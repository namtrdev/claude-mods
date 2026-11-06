import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { GuardEvent } from '../types'

const events = atom({ plugin: 'danger-guard', key: 'events' } as const, [])

// `curl … | sh` in linear time. As a single regex, `[^|]*` rescans to the end of the command for every curl or wget,
// so a long command with many of them and no pipe took quadratic time (400 KB: 1.6 s). From each curl or wget only the
// first `|` after it can match, so look at that one, and let every curl before the same pipe share the answer.
const AFTER_PIPE = /\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/y

const pipesToShell = (command: string) => {
  const word = /\b(?:curl|wget)\b/g
  for (let m = word.exec(command); m !== null; m = word.exec(command)) {
    const pipe = command.indexOf('|', m.index + m[0].length)
    if (pipe < 0) return false
    AFTER_PIPE.lastIndex = pipe
    if (AFTER_PIPE.test(command)) return true
    word.lastIndex = pipe
  }
  return false
}

// `head ... tail` on one line, in linear time. A regex such as `\bgit\s+push\b.*(--force|-f\b)` rescans to the end
// of the line for every `git push`, so a long line with many of them took quadratic time (400 KB: 5 s). Once a line
// has been tested from one head, a later head on the same line has a shorter tail and cannot match either.
const isLineBreak = (c: number) => c === 10 || c === 13 || c === 0x2028 || c === 0x2029

const onOneLine = (command: string, head: RegExp, tail: (from: number, to: number) => boolean) => {
  head.lastIndex = 0
  let testedFrom = -1
  let testedTo = -1
  for (let m = head.exec(command); m !== null; m = head.exec(command)) {
    const from = m.index + m[0].length
    if (from >= testedFrom && from <= testedTo) continue
    let to = from
    while (to < command.length && !isLineBreak(command.charCodeAt(to))) to++
    if (tail(from, to)) return true
    testedFrom = from
    testedTo = to
  }
  return false
}

const GIT_PUSH = /\bgit\s+push\b/g
const FORCE_FLAG = /--force\b|\s-f\b/
const FORCE_FLAG_AT_BREAK = /\s-f\b/y // the `\s` may be the line break itself, with `-f` opening the next line

const pushesForce = (command: string) =>
  onOneLine(command, GIT_PUSH, (from, to) => {
    if (FORCE_FLAG.test(command.slice(from, to))) return true
    FORCE_FLAG_AT_BREAK.lastIndex = to
    return to < command.length && FORCE_FLAG_AT_BREAK.test(command)
  })

const DD = /\bdd\s+/g
const DD_TO_DEVICE = /\bof=\/dev\//
const MKFS = /\bmkfs\b/

const overwritesDisk = (command: string) =>
  MKFS.test(command) || onOneLine(command, DD, (from, to) => DD_TO_DEVICE.test(command.slice(from, to)))

// deny: no sensible reason to ever do this; ask: legitimate but irreversible.
// `re` finds the rule's candidate; `also`, when present, must agree too.
const RULES: { re: RegExp; also?: (command: string) => boolean; verdict: 'ask' | 'deny'; reason: string }[] = [
  {
    re: /\brm\s+(-\w*\s+)*-\w*[rf]\w*\s+(-\w+\s+)*(\/|~|\$HOME|\/\*)(\s|$)/,
    verdict: 'deny',
    reason: 'recursive delete of root or home',
  },
  { re: /:\(\)\s*\{\s*:\|:&\s*\};:/, verdict: 'deny', reason: 'fork bomb' },
  { re: />\s*\/dev\/(sd|nvme|disk)\w*/, verdict: 'deny', reason: 'writes to a raw disk' },
  { re: /\bmkfs\b|\bdd\s/, also: overwritesDisk, verdict: 'deny', reason: 'formats or overwrites a disk' },
  { re: /\brm\s+(-\w*\s+)*-\w*[rf]\w*\b/, verdict: 'ask', reason: 'recursive or forced delete' },
  { re: /\bgit\s+push\b/, also: pushesForce, verdict: 'ask', reason: 'force push rewrites remote history' },
  {
    re: /\bgit\s+(reset\s+--hard|clean\s+-\w*f|checkout\s+--\s|restore\s+\.)/,
    verdict: 'ask',
    reason: 'discards uncommitted work',
  },
  { re: /\bgit\s+branch\s+-D\b/, verdict: 'ask', reason: 'deletes a branch with unmerged work' },
  { re: /\b(curl|wget)\b/, also: pipesToShell, verdict: 'ask', reason: 'runs a remote script' },
  { re: /\bchmod\s+(-R\s+)?[0-7]*777\b/, verdict: 'ask', reason: 'world-writable permissions' },
  { re: /\bsudo\b/, verdict: 'ask', reason: 'runs with root privileges' },
  { re: /\bdrop\s+(table|database|schema)\b|\btruncate\s+table\b/i, verdict: 'ask', reason: 'drops database data' },
  {
    re: /\b(kubectl|helm)\s+(delete|uninstall)\b|\bterraform\s+destroy\b/,
    verdict: 'ask',
    reason: 'deletes infrastructure',
  },
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

// One line, at most `max` characters, the middle cut out: a long path keeps its root and its file name,
// so the confirmation block stays readable instead of overflowing.
const short = (text: string, max = 60) => {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= max) return one
  const head = Math.ceil((max - 1) * 0.4)
  const tail = max - 1 - head

  return `${one.slice(0, head)}…${one.slice(one.length - tail)}`
}

export const register: Register = (on, options) => {
  const rules = RULES.flatMap(rule => {
    if (options.allowSudo === true && rule.reason === 'runs with root privileges') return []
    if (rule.reason === 'force push rewrites remote history' && options.forcePush === 'allow') return []
    if (rule.reason === 'recursive or forced delete' && options.recursiveDelete === 'allow') return []
    if (rule.reason === 'force push rewrites remote history' && options.forcePush === 'deny')
      return [{ ...rule, verdict: 'deny' as const }]
    if (rule.reason === 'recursive or forced delete' && options.recursiveDelete === 'deny')
      return [{ ...rule, verdict: 'deny' as const }]
    return [rule]
  })
  const extraCommands = parse(options.extraCommands)
  const extraPaths = parse(options.extraPaths)

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const command = String((e.input as { command?: unknown }).command ?? '')
    const rule =
      rules.find(one => one.re.test(command) && (one.also === undefined || one.also(command))) ??
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

      return { decision: 'ask', reason: `danger-guard: ${short(path)} is a sensitive path` }
    })
  }
}
