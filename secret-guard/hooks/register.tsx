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

// Length of the name from `list` that ends at text[j], or 0. Letters compare case-insensitively through `| 32`.
const nameEndsAt = (text: string, j: number, list: number[][], last: number) => {
  const lc = text.charCodeAt(j) | 32
  if ((lc - 97) >>> 0 >= 26 || ((last >>> (lc - 97)) & 1) === 0) return 0
  for (const w of list) {
    const top = w.length - 1
    if (j < top) continue
    let k = top
    while (k >= 0) {
      const c = text.charCodeAt(j - (top - k))
      if ((w[k] >= 97 ? c | 32 : c) !== w[k]) break
      k--
    }
    if (k < 0) return w.length
  }
  return 0
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

// Type names that sit between a name and `=` in declarations: `let name: string = value`, `var name string = value`.
const TYPE_NAMES = codes(['string', 'str', 'number', 'int', 'integer', 'bool', 'boolean', 'any', 'bytes'])
const TYPE_LAST = lastLetters(TYPE_NAMES)
const isWordChar = (c: number) => c < 128 && ((CLS[c] & (F_ALPHA | F_DIGIT)) !== 0 || c === 95)

// Values that follow a secret-looking name but are not secrets: type names, null-like words, references to an
// environment variable or template, and masks. Masking them only hides code and docs from the model.
const NOT_SECRET = new Set([
  'string',
  'str',
  'number',
  'int',
  'integer',
  'bool',
  'boolean',
  'any',
  'bytes',
  'object',
  'unknown',
  'type',
  'value',
  'null',
  'none',
  'nil',
  'undefined',
  'true',
  'false',
  'required',
  'optional',
  'changeme',
  'redacted',
  'example',
  'sample',
  'dummy',
  'placeholder',
])
// The name itself as a value: a capitalised Token or an upper-case TOKEN is a type or a placeholder, but a lowercase
// one is a real default credential, so only the capitalised forms are skipped.
const NAME_AS_VALUE = new Set(['password', 'passwd', 'secret', 'token', 'key'])
const PLACEHOLDER_SHAPE =
  /^(?:<[^<>]*>[,;]?|\$(?:[{(]|[A-Z_][A-Z0-9_]*[,;)}\]]*$)|\{\{|%[^%\s]+%$|\[(?:hidden:|REDACTED)|[*xX.#-]{3,}[,;]?$)/
const ENV_REFERENCE = /^(?:process\.env|os\.environ|os\.getenv|System\.getenv|env\.|ENV\[|getenv\()/i

const isPlaceholder = (text: string, v: number, e: number) => {
  const value = text.slice(v, e)
  if (PLACEHOLDER_SHAPE.test(value) || ENV_REFERENCE.test(value)) return true
  const core = value.replace(/[,;)\]}]+$/, '')
  const low = core.toLowerCase()
  return NOT_SECRET.has(low) || (NAME_AS_VALUE.has(low) && core.charCodeAt(0) < 97)
}

// Secrets that are only part of a longer match: the password in a connection string, the credentials after
// `Authorization: Basic`, after `curl -u user:`, and the cookies of a Cookie header. Each regex is [prefix][secret]:
// the prefix stays, the secret is masked.
const BASIC_HEADER =
  /(\bAuthorization["']?\s*[:=]\s*["']?(?:Basic|Digest|Negotiate|NTLM|token)\s+)([A-Za-z0-9+/=._~-]{8,})/gi
const CURL_USER =
  /((?:^|[\s'"])(?:-u|--user|--proxy-user)(?:\s+|=)["']?(?!\d+:\d+(?:[\s"']|$))[^\s:"'@]+:)([^\s"'`]{3,})/g
const COOKIE_HEADER = /(\b(?:Set-)?Cookie["']?\s*[:=]\s*["']?)((?=[\w.-]+=)[^\n"']{8,})/gi

// `scheme://user:secret@host`: found from each `://`, with no regex. The secret ends at the `@`.
const scanUrlSecrets = (text: string, out: [number, number][]) => {
  const n = text.length
  for (let p = text.indexOf('://'); p >= 0; p = text.indexOf('://', p + 3)) {
    const before = text.charCodeAt(p - 1)
    if (p === 0 || !isWordChar(before)) continue
    let k = p + 3
    let ended = false
    while (k < n) {
      const c = text.charCodeAt(k)
      if (c === 58) {
        ended = true
        break
      }
      if (c === 64 || c === 47 || c === 63 || c === 35 || isSpace(c)) break
      k++
    }
    if (!ended) continue
    const v = k + 1
    let e = v
    while (e < n) {
      const c = text.charCodeAt(e)
      if (c === 47 || c === 63 || c === 35 || isSpace(c)) break
      e++
    }
    // The userinfo ends at the last `@` before the path, so a secret that itself holds an `@` is masked whole.
    let at = e - 1
    while (at > v && text.charCodeAt(at) !== 64) at--
    if (at > v && !isPlaceholder(text, v, at)) out.push([v, at])
  }
}

const scanPartial = (text: string): [number, number][] => {
  const found: [number, number][] = []
  for (const re of [BASIC_HEADER, CURL_USER, COOKIE_HEADER]) {
    for (const m of text.matchAll(re)) {
      const start = m.index! + m[1].length
      const end = start + m[2].length
      if (!isPlaceholder(text, start, end)) found.push([start, end])
    }
  }
  scanUrlSecrets(text, found)
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const out: [number, number][] = []
  for (const r of found) {
    if (out.length === 0 || r[0] >= out[out.length - 1][1]) out.push(r)
  }
  return out
}

// Detectors that start from a rare anchor instead of trying a regex at every position. A regex such as
// `\beyJ[...]{8,}\.` restarts at each character of a long run, so input like "-eyJaaaaaaa-eyJaaaaaaa…" took quadratic
// time (400 KB: 9 s). These find the same matches as the regex in linear time, checked against it on random text.
type Span = [number, number]
const isTokenChar = (c: number) => isWordChar(c) || c === 45

// A JWT is `eyJ` + three runs of token characters joined by dots. The runs are scanned once and shared by every
// `eyJ` that falls inside them.
const scanJwt = (text: string): Span[] => {
  const out: Span[] = []
  const n = text.length
  const run = (from: number) => {
    let e = from
    while (e < n && isTokenChar(text.charCodeAt(e))) e++
    return e
  }
  let runFrom = -1
  let runTo = -1
  let memoDot = -1
  let memoEnd = -1
  for (let p = text.indexOf('eyJ'); p >= 0;) {
    if (p > 0 && isWordChar(text.charCodeAt(p - 1))) {
      p = text.indexOf('eyJ', p + 1)
      continue
    }
    const a = p + 3
    let dot1: number
    if (a >= runFrom && a <= runTo) {
      dot1 = runTo
    } else {
      dot1 = run(a)
      runFrom = a
      runTo = dot1
    }
    if (dot1 - a >= 8 && text.charCodeAt(dot1) === 46) {
      let end: number
      if (dot1 === memoDot) {
        end = memoEnd
      } else {
        const dot2 = run(dot1 + 1)
        end = -1
        if (dot2 - (dot1 + 1) >= 8 && text.charCodeAt(dot2) === 46) {
          const last = run(dot2 + 1)
          if (last - (dot2 + 1) >= 8) end = last
        }
        memoDot = dot1
        memoEnd = end
      }
      if (end >= 0) {
        out.push([p, end])
        p = text.indexOf('eyJ', end)
        continue
      }
    }
    p = text.indexOf('eyJ', p + 1)
  }
  return out
}

// A private key block needs an END header after its BEGIN header. Cut the text after the last END header, so a
// BEGIN with no END anywhere after it is never scanned to the end of the text.
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
const PEM_END = /-----END [A-Z ]*PRIVATE KEY-----/y

const scanPem = (text: string): Span[] => {
  let cut = -1
  for (
    let stop = text.lastIndexOf('-----END ');
    stop >= 0;
    stop = stop === 0 ? -1 : text.lastIndexOf('-----END ', stop - 1)
  ) {
    PEM_END.lastIndex = stop
    const m = PEM_END.exec(text)
    if (m !== null) {
      cut = stop + m[0].length
      break
    }
  }
  if (cut < 0) return []
  return [...text.slice(0, cut).matchAll(PEM)].map(m => [m.index!, m.index! + m[0].length] as Span)
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
    if (c === 61 && j >= 0) {
      // `name: string = value` and `name string = value`: step over the type, and the colon before it.
      const size = nameEndsAt(text, j, TYPE_NAMES, TYPE_LAST)
      if (size > 0 && (j - size < 0 || !isWordChar(text.charCodeAt(j - size)))) {
        j -= size
        while (j >= 0 && isSpace(text.charCodeAt(j))) j--
        if (j >= 0 && text.charCodeAt(j) === 58) {
          j--
          while (j >= 0 && isSpace(text.charCodeAt(j))) j--
        }
      }
    }
    if (j >= 0 && text.charCodeAt(j) === 93) j-- // a name in brackets: os.environ["NAME"] = "value"
    if (j >= 0) {
      // A closing quote may sit between the name and the separator, as in JSON: "name": "value".
      const q = text.charCodeAt(j)
      if (q === 34 || q === 39) j--
    }
    if (j < 0 || nameEndsAt(text, j, names, last) === 0) continue
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
    if (!generic && isPlaceholder(text, v, e)) continue
    if (!generic || isRandomRun(text, v, e)) out.push([v, e])
    // Resume at the last matched character: it may itself be the `=` or `:` that introduces the next value.
    i = e - 2
  }
  return out
}

const RULES: { label: string; re?: RegExp; scan?: (text: string) => [number, number][] }[] = [
  { label: 'private-key', scan: text => scanPem(text) },
  { label: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: 'api-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { label: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/g },
  { label: 'aws-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { label: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'google-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'stripe-key', re: /\b(?:[sr]k_(?:live|test)|whsec)_[A-Za-z0-9]{16,}/g },
  { label: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  { label: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { label: 'huggingface-token', re: /\bhf_[A-Za-z0-9]{30,}/g },
  { label: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g },
  { label: 'pypi-token', re: /\bpypi-[A-Za-z0-9_-]{50,}/g },
  { label: 'shopify-token', re: /\bshp(?:at|ca|pa|ss)_[a-f0-9]{32}\b/g },
  { label: 'digitalocean-token', re: /\bdo[opr]_v1_[a-f0-9]{64}\b/g },
  { label: 'twilio-key', re: /\bSK[0-9a-f]{32}\b/g },
  { label: 'docker-token', re: /\bdckr_pat_[A-Za-z0-9_-]{20,}/g },
  { label: 'jwt', scan: text => scanJwt(text) },
  { label: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g },
]

// Files meant to hold secrets.
const ALLOWED = /(^|\/)\.env(\.[\w.-]+)?$/

const labelsIn = (text: string) => {
  const found: string[] = []
  for (const rule of RULES) {
    for (const _ of rule.scan !== undefined ? rule.scan(text) : text.matchAll(rule.re!)) found.push(rule.label)
  }
  for (const generic of [false, true]) {
    for (const _ of scanKeyed(text, generic)) found.push('secret')
  }
  for (const _ of scanPartial(text)) found.push('secret')
  return found
}

const maskText = (text: string, tally: { n: number }) => {
  let out = text
  for (const rule of RULES) {
    if (rule.scan !== undefined) {
      let at = 0
      let next = ''
      for (const [start, end] of rule.scan(out)) {
        next += out.slice(at, start) + `[hidden:${rule.label}]`
        at = end
        tally.n += 1
      }
      out = next + out.slice(at)
    } else {
      out = out.replace(rule.re!, () => {
        tally.n += 1
        return `[hidden:${rule.label}]`
      })
    }
  }
  // The keyed rules run last, on the text the other rules already masked.
  {
    let at = 0
    let next = ''
    for (const [start, end] of scanPartial(out)) {
      next += out.slice(at, start) + '[hidden:secret]'
      at = end
      tally.n += 1
    }
    out = next + out.slice(at)
  }
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
