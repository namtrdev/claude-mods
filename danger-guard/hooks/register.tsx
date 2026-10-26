import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { GuardEvent } from '../types'

const events = atom({ plugin: 'danger-guard', key: 'events' } as const, [])

// deny: no sensible reason to ever do this; ask: legitimate but irreversible.
const RULES: { re: RegExp; verdict: 'ask' | 'deny'; reason: string }[] = [
  { re: /\brm\s+(-\w*\s+)*-\w*[rf]\w*\s+(-\w+\s+)*(\/|~|\$HOME|\/\*)(\s|$)/, verdict: 'deny', reason: 'recursive delete of root or home' },
  { re: /:\(\)\s*\{\s*:\|:&\s*\};:/, verdict: 'deny', reason: 'fork bomb' },
  { re: />\s*\/dev\/(sd|nvme|disk)\w*/, verdict: 'deny', reason: 'writes to a raw disk' },
  { re: /\bmkfs\b|\bdd\s+.*\bof=\/dev\//, verdict: 'deny', reason: 'formats or overwrites a disk' },
  { re: /\brm\s+(-\w*\s+)*-\w*[rf]\w*\b/, verdict: 'ask', reason: 'recursive or forced delete' },
  { re: /\bgit\s+push\b.*(--force\b|\s-f\b)/, verdict: 'ask', reason: 'force push rewrites remote history' },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-\w*f|checkout\s+--\s|restore\s+\.)/, verdict: 'ask', reason: 'discards uncommitted work' },
  { re: /\bgit\s+branch\s+-D\b/, verdict: 'ask', reason: 'deletes a branch with unmerged work' },
  { re: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, verdict: 'ask', reason: 'runs a remote script' },
  { re: /\bchmod\s+(-R\s+)?[0-7]*777\b/, verdict: 'ask', reason: 'world-writable permissions' },
  { re: /\bsudo\b/, verdict: 'ask', reason: 'runs with root privileges' },
  { re: /\bdrop\s+(table|database|schema)\b|\btruncate\s+table\b/i, verdict: 'ask', reason: 'drops database data' },
  { re: /\b(kubectl|helm)\s+(delete|uninstall)\b|\bterraform\s+destroy\b/, verdict: 'ask', reason: 'deletes infrastructure' },
]

const SENSITIVE_PATH = /(^|\/)(\.ssh|\.aws|\.gnupg|\.kube)\/|(^|\/)\.(bashrc|zshrc|zprofile|profile)$|^\/etc\//

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
  const rules = RULES.flatMap(rule => {
    if (options.allowSudo === true && rule.reason === 'runs with root privileges') return []
    if (rule.reason === 'force push rewrites remote history' && options.forcePush === 'allow') return []
    if (rule.reason === 'recursive or forced delete' && options.recursiveDelete === 'allow') return []
    if (rule.reason === 'force push rewrites remote history' && options.forcePush === 'deny') return [{ ...rule, verdict: 'deny' as const }]
    if (rule.reason === 'recursive or forced delete' && options.recursiveDelete === 'deny') return [{ ...rule, verdict: 'deny' as const }]
    return [rule]
  })
  const extraCommands = parse(options.extraCommands)
  const extraPaths = parse(options.extraPaths)

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const command = String((e.input as { command?: unknown }).command ?? '')
    const rule =
      rules.find(one => one.re.test(command)) ??
      (extraCommands.some(re => re.test(command))
        ? { verdict: 'ask' as const, reason: 'matches one of your commands to confirm' }
        : undefined)
    if (rule === undefined) {
      return next(e)
    }
    const entry: GuardEvent = {
      at: await $.clock.now(),
      verdict: rule.verdict,
      reason: rule.reason,
      what: command.slice(0, 120),
    }
    await update($, events, list => [...list, entry].slice(-50))
    $.ui.toast(`danger-guard: ${rule.verdict} · ${rule.reason}`)

    return { decision: rule.verdict, reason: `danger-guard: ${rule.reason}` }
  })

  for (const tool of ['Write', 'Edit', 'MultiEdit'] as const) {
    on('tool.check', { tool }, async ($, e, next) => {
      const path = String((e.input as { file_path?: unknown }).file_path ?? '')
      if (!SENSITIVE_PATH.test(path) && !extraPaths.some(re => re.test(path))) {
        return next(e)
      }
      const entry: GuardEvent = { at: await $.clock.now(), verdict: 'ask', reason: 'sensitive path', what: path }
      await update($, events, list => [...list, entry].slice(-50))

      return { decision: 'ask', reason: `danger-guard: ${path} is a sensitive path` }
    })
  }
}
