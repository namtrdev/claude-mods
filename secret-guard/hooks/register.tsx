import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const isOn = atom({ plugin: 'secret-guard', key: 'isOn' } as const, true)
const masked = atom({ plugin: 'secret-guard', key: 'masked' } as const, 0)

// Value of a key whose name ends in key/credential/auth/passphrase. Plain words and ids also sit behind such
// names, so a value only counts when it looks random: long, mixed letters and digits, high entropy, no placeholder word.
const PLACEHOLDER_WORD = /test|example|fake|dummy|sample|placeholder|changeme|your[_-]|xxxx/i

const entropy = (s: string) => {
  const counts = new Map<string, number>()
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1)
  let h = 0
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length)
  return h
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const looksRandom = (s: string) => {
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s) || PLACEHOLDER_WORD.test(s)) return false
  // Paths and UUIDs are ids, not secrets. Two or more lowercase words joined by - _ . read as a name.
  if (/^[/.~]/.test(s) || UUID.test(s)) return false
  if (s.split(/[-_.]/).filter(w => /^[a-z]{3,}$/.test(w)).length >= 2) return false
  // Hex has only 16 symbols, so its entropy tops out near 4 bits: it needs a lower bar.
  return entropy(s) >= (/^[0-9a-f]+$/i.test(s) ? 3.0 : 3.5)
}

const RULES: { label: string; re: RegExp; ok?: (match: string) => boolean }[] = [
  { label: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { label: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: 'api-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { label: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/g },
  { label: 'aws-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { label: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'google-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { label: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g },
  { label: 'secret', re: /(?<=(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[=:]\s*["']?)[^\s"'`]{4,}/gi },
  { label: 'secret', re: /(?<=(?:key|credentials?|auth|passphrase)["']?\s*[=:]\s*["']?)[A-Za-z0-9_+/=.-]{16,}/gi, ok: looksRandom },
]

// Files meant to hold secrets.
const ALLOWED = /(^|\/)\.env(\.[\w.-]+)?$/

const labelsIn = (text: string) => {
  const found: string[] = []
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      if (rule.ok === undefined || rule.ok(m[0])) found.push(rule.label)
    }
  }
  return found
}

const maskText = (text: string, tally: { n: number }) => {
  let out = text
  for (const rule of RULES) {
    out = out.replace(rule.re, match => {
      if (rule.ok !== undefined && !rule.ok(match)) return match
      tally.n += 1
      return rule.label === 'secret' ? '[hidden:secret]' : `[hidden:${rule.label}]`
    })
  }
  return out
}

const deepMask = (value: unknown, tally: { n: number }): unknown => {
  if (typeof value === 'string') return maskText(value, tally)
  if (Array.isArray(value)) return value.map(one => deepMask(one, tally))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, deepMask(v, tally)]),
    )
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

    return ran.context === undefined
      ? { result: clean as never }
      : { result: clean as never, context: ran.context }
  })
}
