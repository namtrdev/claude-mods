import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const isOn = atom({ plugin: 'secret-guard', key: 'isOn' } as const, true)
const masked = atom({ plugin: 'secret-guard', key: 'masked' } as const, 0)

// Keyed secrets: `name = value` where the name says "secret".
// One pass finds each `=` and `:`, then looks back for the key name and forward for the value. Bit tricks on
// char codes (a flag table, `| 32` case folding, unsigned range tests, a last-letter bitmask) replace the regex
// lookbehinds this used before, which were several times slower on large text. Same results as the regex version.
const F_VALUE = 1
const F_HEX = 2
const F_DIGIT = 4
const F_ALPHA = 8
const F_SPACE = 16
const F_QUOTE = 32
const F_TICK = 64
const CLS = new Uint8Array(128)
for (let c = 0; c < 128; c++) {
  let f = 0
  if ((c - 48) >>> 0 < 10) f |= F_DIGIT | F_HEX | F_VALUE
  if (((c | 32) - 97) >>> 0 < 26) f |= F_ALPHA | F_VALUE
  if (((c | 32) - 97) >>> 0 < 6) f |= F_HEX
  if (c === 95 || c === 43 || c === 47 || c === 61 || c === 46 || c === 45) f |= F_VALUE
  if (c === 32 || (c - 9) >>> 0 < 5) f |= F_SPACE
  if (c === 34 || c === 39) f |= F_QUOTE
  if (c === 96) f |= F_TICK
  CLS[c] = f
}

const UNICODE_SPACE = /\s/
const isSpace = (c: number) => (c < 128 ? (CLS[c] & F_SPACE) !== 0 : UNICODE_SPACE.test(String.fromCharCode(c)))

const codes = (list: string[]) => list.map(w => Array.from(w, ch => ch.charCodeAt(0)))
// Names that mark the value after them as a secret.
const ASSIGN_NAMES = codes([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'api-key',
  'accesskey',
  'access_key',
  'access-key',
  'privatekey',
  'private_key',
  'private-key',
])
// Names that only count when the value also looks random.
const GENERIC_NAMES = codes(['key', 'credentials', 'credential', 'auth', 'passphrase'])
// Bit n is set when some name ends in the letter 'a' + n, so one shift-and-test rejects most positions.
const lastLetters = (list: number[][]) => list.reduce((m, w) => m | (1 << (w[w.length - 1] - 97)), 0)
const ASSIGN_LAST = lastLetters(ASSIGN_NAMES)
const GENERIC_LAST = lastLetters(GENERIC_NAMES)

// Does a key name end at text[j]? Letters compare case-insensitively through `| 32`.
const nameEndsAt = (text: string, j: number, list: number[][], last: number) => {
  const lc = text.charCodeAt(j) | 32
  if ((lc - 97) >>> 0 >= 26 || ((last >>> (lc - 97)) & 1) === 0) return false
  for (const w of list) {
    const top = w.length - 1
    if (j < top) continue
    let k = top
    while (k >= 0) {
      const c = text.charCodeAt(j - (top - k))
      if ((w[k] >= 97 ? c | 32 : c) !== w[k]) break
      k--
    }
    if (k < 0) return true
  }
  return false
}

const PLACEHOLDER_WORD = /test|example|fake|dummy|sample|placeholder|changeme|your[_-]|xxxx/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// n * log2(n), so entropy is log2(len) - sum(n log2 n) / len with no per-character logarithm.
const NLOGN = new Float64Array(1025)
for (let n = 2; n <= 1024; n++) NLOGN[n] = n * Math.log2(n)
const COUNTS = new Uint32Array(128)

// Does text[v, e) look random? Plain words and ids also sit behind key-like names, so a value counts when it is
// mixed letters and digits with high entropy, and is no path, UUID, placeholder, or name made of lowercase words.
// Hex has only 16 symbols, so its entropy tops out near 4 bits: it gets a lower bar.
const isRandomRun = (text: string, v: number, e: number) => {
  const len = e - v
  const first = text.charCodeAt(v)
  if (first === 47 || first === 46 || first === 126) return false
  let any = 0
  let all = 255
  let seg = 0
  let pure = true
  let names = 0
  COUNTS.fill(0)
  for (let k = v; k < e; k++) {
    const c = text.charCodeAt(k)
    const f = CLS[c]
    any |= f
    all &= f
    COUNTS[c]++
    if (c === 45 || c === 95 || c === 46) {
      if (pure && seg >= 3) names++
      seg = 0
      pure = true
    } else {
      seg++
      if ((c - 97) >>> 0 >= 26) pure = false
    }
  }
  if (pure && seg >= 3) names++
  if ((any & F_ALPHA) === 0 || (any & F_DIGIT) === 0 || names >= 2) return false
  let sum = 0
  for (let c = 0; c < 128; c++) {
    const n = COUNTS[c]
    if (n > 1) sum += n <= 1024 ? NLOGN[n] : n * Math.log2(n)
  }
  if (Math.log2(len) - sum / len < ((all & F_HEX) !== 0 ? 3.0 : 3.5) - 1e-9) return false
  const value = text.slice(v, e)
  return !(len === 36 && UUID.test(value)) && !PLACEHOLDER_WORD.test(value)
}

// Value ranges after a secret-looking name. `generic` false: names like password or token, any value of 4+ characters.
// `generic` true: names like key or auth, a value of 16+ characters that also looks random.
const scanKeyed = (text: string, generic: boolean): [number, number][] => {
  const out: [number, number][] = []
  const n = text.length
  const names = generic ? GENERIC_NAMES : ASSIGN_NAMES
  const last = generic ? GENERIC_LAST : ASSIGN_LAST
  const min = generic ? 16 : 4
  for (let i = text.search(/[=:]/); i >= 0 && i < n; i++) {
    const c = text.charCodeAt(i)
    if (c !== 61 && c !== 58) continue
    let j = i - 1
    while (j >= 0 && isSpace(text.charCodeAt(j))) j--
    if (generic && j >= 0) {
      const q = text.charCodeAt(j)
      if (q === 34 || q === 39) j--
    }
    if (j < 0 || !nameEndsAt(text, j, names, last)) continue
    let v = i + 1
    while (v < n && isSpace(text.charCodeAt(v))) v++
    if (v < n) {
      const q = text.charCodeAt(v)
      if (q === 34 || q === 39) v++
    }
    let e = v
    while (e < n) {
      const d = text.charCodeAt(e)
      const stop = generic
        ? d >= 128 || (CLS[d] & F_VALUE) === 0
        : d < 128
          ? (CLS[d] & (F_SPACE | F_QUOTE | F_TICK)) !== 0
          : isSpace(d)
      if (stop) break
      e++
    }
    if (e - v < min) continue
    if (!generic || isRandomRun(text, v, e)) out.push([v, e])
    // Resume at the last matched character: it may itself be the `=` or `:` that introduces the next value.
    i = e - 2
  }
  return out
}

const RULES: { label: string; re: RegExp }[] = [
  { label: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { label: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: 'api-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { label: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/g },
  { label: 'aws-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { label: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'google-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { label: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g },
]

// Files meant to hold secrets.
const ALLOWED = /(^|\/)\.env(\.[\w.-]+)?$/

const labelsIn = (text: string) => {
  const found: string[] = []
  for (const rule of RULES) {
    for (const _ of text.matchAll(rule.re)) found.push(rule.label)
  }
  for (const generic of [false, true]) {
    for (const _ of scanKeyed(text, generic)) found.push('secret')
  }
  return found
}

const maskText = (text: string, tally: { n: number }) => {
  let out = text
  for (const rule of RULES) {
    out = out.replace(rule.re, () => {
      tally.n += 1
      return `[hidden:${rule.label}]`
    })
  }
  // The keyed rules run last, on the text the other rules already masked.
  for (const generic of [false, true]) {
    let at = 0
    let next = ''
    for (const [start, end] of scanKeyed(out, generic)) {
      next += out.slice(at, start) + '[hidden:secret]'
      at = end
      tally.n += 1
    }
    out = next + out.slice(at)
  }
  return out
}

const deepMask = (value: unknown, tally: { n: number }): unknown => {
  if (typeof value === 'string') return maskText(value, tally)
  if (Array.isArray(value)) return value.map(one => deepMask(one, tally))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, deepMask(v, tally)]))
  }
  return value
}

const parse = (raw: unknown) =>
  String(raw ?? '')
    .split(',')
    .map(one => one.trim())
    .filter(one => one !== '')
    .flatMap(one => {
      try {
        return [new RegExp(one)]
      } catch {
        return []
      }
    })

export const register: Register = (on, options) => {
  const extraAllowed = parse(options.extraAllowedFiles)
  const warnOnly = options.onWrite === 'warn'
  const guardCommits = options.guardCommits !== false
  const maskResults = options.maskResults !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'secret-guard',
      description: 'Turn the secret guard (tool results, writes, commits) on or off',
    })

    return next(e)
  })

  on('command.run', { command: 'secret-guard' }, async $ => {
    const was = await read($, isOn)
    await update($, isOn, () => !was)
    $.ui.status(was ? 'secret guard OFF' : undefined)

    return { text: was ? 'Secret guard is OFF.' : 'Secret guard is ON.' }
  })

  on('tool.call', async ($, e, next) => {
    if (!(await read($, isOn))) {
      return next(e)
    }
    const input = e as unknown as Record<string, unknown>

    if (e.tool === 'Write' || e.tool === 'Edit' || e.tool === 'MultiEdit') {
      const path = String(input.file_path ?? '')
      const edits = Array.isArray(input.edits) ? (input.edits as { new_string?: unknown }[]) : []
      const body = [input.content, input.new_string, ...edits.map(one => one.new_string)]
        .filter((one): one is string => typeof one === 'string')
        .join('\n')
      const found = ALLOWED.test(path) || extraAllowed.some(re => re.test(path)) ? [] : labelsIn(body)
      if (found.length > 0) {
        const why = `secret-guard: ${path} would contain ${[...new Set(found)].join(', ')}.`
        if (warnOnly) {
          $.ui.toast(why)
        } else {
          return { deny: `${why} Read it from an environment variable or a .env file instead.` }
        }
      }
    }

    if (guardCommits && e.tool === 'Bash' && /\bgit\s+commit\b/.test(String(input.command ?? ''))) {
      try {
        const staged = await $.tool.call({ tool: 'Bash', command: 'git diff --cached' })
        const found = labelsIn(String((staged as { text?: string }).text ?? ''))
        if (found.length > 0) {
          return {
            deny: `secret-guard: staged changes contain ${[...new Set(found)].join(', ')}. Unstage them before committing.`,
          }
        }
      } catch {
        // No repository or git unavailable: nothing to check.
      }
    }

    const ran = await next(e)
    if (!maskResults || ran.deny !== undefined || ran.result === undefined) {
      return ran
    }
    const tally = { n: 0 }
    const clean = deepMask(ran.result, tally)
    if (tally.n === 0) {
      return ran
    }
    await update($, masked, n => n + tally.n)
    $.ui.toast(`secret-guard hid ${tally.n} secret${tally.n > 1 ? 's' : ''} in ${e.tool} output`)

    return ran.context === undefined ? { result: clean as never } : { result: clean as never, context: ran.context }
  })
}
