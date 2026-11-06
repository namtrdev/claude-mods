import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { icon } from './icons'

import type { Risky, Touch } from '../types'

const PANE = 'blast-radius'
const touched = atom({ plugin: 'blast-radius', key: 'touched' } as const, [])
const risky = atom({ plugin: 'blast-radius', key: 'risky' } as const, [])
const commands = atom({ plugin: 'blast-radius', key: 'commands' } as const, 0)

const WRITERS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const RULES: { re: RegExp; reason: string; weight: number }[] = [
  { re: /\brm\s+(-\w*[rf]\w*\s+)+/, reason: 'recursive delete', weight: 8 },
  { re: /\bgit\s+push\b.*(--force|-f\b)/, reason: 'force push', weight: 9 },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-\w*f)/, reason: 'discards work', weight: 7 },
  { re: /\bgit\s+push\b/, reason: 'publishes commits', weight: 4 },
  { re: /\b(sudo|chmod|chown)\b/, reason: 'privileged change', weight: 6 },
  { re: /\b(curl|wget)\b.*\|\s*(sh|bash)/, reason: 'runs remote script', weight: 9 },
  { re: /\b(npm|pnpm|yarn|pip)\s+(install|add|i)\b/, reason: 'installs packages', weight: 3 },
  { re: /\bdrop\s+(table|database)\b/i, reason: 'drops data', weight: 9 },
  { re: />\s*[^\s&>|]+/, reason: 'writes via redirect', weight: 2 },
]

const filePath = (e: object): string | undefined => {
  const input = e as Record<string, unknown>
  const path = input.file_path ?? input.notebook_path
  return typeof path === 'string' ? path : undefined
}

const score = (files: Touch[], bad: Risky[]) =>
  files.length + bad.reduce((sum, one) => sum + one.weight, 0)

const level = (n: number) => (n >= 15 ? 'HIGH' : n >= 6 ? 'MEDIUM' : 'LOW')

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
  const extraRules = parse(options.extraRiskyPatterns).map(re => ({ re, reason: 'your pattern', weight: 5 }))
  const toastFrom = Number(options.toastFrom ?? 7)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'blast-radius',
      description: 'Show how far this session’s changes reach',
    })

    if (options.openPaneAtStart !== false) {
      void $.ui.open({ id: PANE, title: 'Blast radius' })
    }

    return next(e)
  })

  on('command.run', { command: 'blast-radius' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Blast radius' })

    return { text: 'Blast radius pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    if (WRITERS.has(e.tool)) {
      const path = filePath(e)
      if (path !== undefined) {
        await update($, touched, list => {
          const hit = list.find(one => one.path === path)
          return hit
            ? list.map(one => (one === hit ? { ...one, count: one.count + 1 } : one))
            : [...list, { path, tool: e.tool, count: 1 }]
        })
      }
    } else if (e.tool === 'Bash') {
      const command = String((e as Record<string, unknown>).command ?? '')
      await update($, commands, n => n + 1)
      const rule = [...RULES, ...extraRules].filter(r => r.re.test(command)).sort(
        (a, b) => b.weight - a.weight,
      )[0]
      if (rule !== undefined) {
        await update($, risky, list =>
          [...list, { command: command.slice(0, 120), reason: rule.reason, weight: rule.weight }].slice(-50),
        )
        if (rule.weight >= toastFrom) {
          $.ui.toast(`Blast radius: ${rule.reason}`)
        }
      }
    }

    const [files, bad] = [await read($, touched), await read($, risky)]
    const n = score(files, bad)
    $.ui.status(n === 0 ? undefined : `blast ${level(n)} · ${files.length} files`)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const hasSvg = ui.Svg !== undefined
    const [files, bad, ran] = [await read($, touched), await read($, risky), await read($, commands)]
    const n = score(files, bad)
    const room = Math.max(3, Math.floor(((e.viewport?.rows ?? 24) - 8) / 2))
    const dirs = new Set(files.map(one => one.path.split('/').slice(0, -1).join('/')))

    return (
      <Box flexDirection="column">
        <Text bold>
          Radius: {level(n)} (score {n})
        </Text>
        <Text dimColor>
          {files.length} files · {dirs.size} dirs · {ran} shell commands · {bad.length} risky
        </Text>
        <Text bold>Files changed</Text>
        {files.length === 0 && <Text dimColor>None yet.</Text>}
        {files.slice(-room).map(one => (
          <Text>
            {one.tool} {one.path}
            {one.count > 1 ? ` ×${one.count}` : ''}
          </Text>
        ))}
        <Text bold>Risky commands</Text>
        {bad.length === 0 && <Text dimColor>None.</Text>}
        {bad.slice(-room).map(one => (
          <Box gap={1}>
            {hasSvg && icon(ui, 'triangle-alert', one.weight >= 7 ? '#ff7a7a' : '#ffe066', '')}
            <Text color={one.weight >= 7 ? 'red' : 'yellow'}>
              [{one.reason}] {one.command}
            </Text>
          </Box>
        ))}
        <Box gap={1}>
          {hasSvg && icon(ui, 'rotate-ccw', '#9ca3af', '')}
        <Button
          key="reset"
          label="Reset"
          onPress={async () => {
            await update($, touched, () => [])
            await update($, risky, () => [])
            await update($, commands, () => 0)
            $.ui.status(undefined)
          }}
        />
        </Box>
      </Box>
    )
  })
}
