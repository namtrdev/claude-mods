import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { icon } from './icons'

import type { Loaded } from '../types'

const files = atom({ plugin: 'context-files', key: 'files' } as const, [])
const isExpanded = atom({ plugin: 'context-files', key: 'isExpanded' } as const, true)

const ORDER = ['managed', 'user', 'project', 'local', 'memory']
const COLOR: Record<string, string> = {
  managed: '#ff7a7a',
  user: '#5fe3ff',
  project: '#7dff9a',
  local: '#ffe066',
  memory: '#ff8ae8',
}

const tokens = (chars: number) => {
  const n = Math.round(chars / 4)
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-files',
      description: 'Expand or collapse the loaded-instruction-files band',
    })
    $.ui.invalidate('prompt.context')

    return next(e)
  })

  on('command.run', { command: 'context-files' }, async $ => {
    const was = await read($, isExpanded)
    await update($, isExpanded, () => !was)

    return { text: was ? 'Context files band collapsed.' : 'Context files band expanded.' }
  })

  on('prompt.context', async ($, e, next) => {
    const out = await next(e)
    const list = out.instructionFiles ?? e.instructionFiles ?? []
    const loaded: Loaded[] = list.map(one => ({
      path: one.path,
      kind: one.kind,
      chars: one.content.length,
      parent: one.parent,
    }))
    await update($, files, () => loaded)

    return out
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const hasSvg = ui.Svg !== undefined
    const [list, open] = [await read($, files), await read($, isExpanded)]
    const total = list.reduce((sum, one) => sum + one.chars, 0)
    const cols = e.viewport?.columns ?? 80
    const groups = ORDER.map(kind => {
      const group = list.filter(one => one.kind === kind)
      return { kind, count: group.length, chars: group.reduce((a, one) => a + one.chars, 0) }
    }).filter(one => one.count > 0)
    const pct = (part: number) => (total === 0 ? 0 : Math.round((part / total) * 100))
    const cells = (part: number, width: number) =>
      total === 0 ? 0 : Math.max(1, Math.round((part / total) * width))
    const stacked = (width: number) =>
      groups.map(one => (
        <Text color={COLOR[one.kind]}>{'▓'.repeat(cells(one.chars, width))}</Text>
      ))
    const summary =
      list.length === 0 ? 'no instruction files loaded yet' : `${list.length} files · ~${tokens(total)} tok`

    const toggle = (
      <Box gap={1}>
        {hasSvg && icon(ui, open ? 'chevron-down' : 'chevron-right', '#9ca3af', '')}
        <Button
          key="toggle"
          label={hasSvg ? (open ? 'Collapse' : 'Expand  ') : open ? '▾ Collapse' : '▸ Expand  '}
          onPress={() => update($, isExpanded, () => !open)}
        />
      </Box>
    )

    if (!open) {
      return (
        <Box gap={2}>
          {toggle}
          <Text bold>CONTEXT</Text>
          <Text dimColor>{summary}</Text>
          <Box>{stacked(Math.max(8, Math.min(24, cols - 50)))}</Box>
        </Box>
      )
    }

    const bar = Math.max(10, Math.min(30, cols - 30))

    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={2}>
          {toggle}
          <Text bold>CONTEXT</Text>
          <Text dimColor>{summary}</Text>
        </Box>
        {groups.length > 0 && (
          <Box flexDirection="column" gap={1}>
            <Box>{stacked(Math.max(10, Math.min(60, cols - 10)))}</Box>
            <Box gap={2}>
              {groups.map(one => (
                <Text color={COLOR[one.kind]}>
                  {one.kind} {one.count} · {tokens(one.chars)}
                </Text>
              ))}
            </Box>
          </Box>
        )}
        {groups.map(group => (
          <Box flexDirection="column" gap={1}>
            <Text bold color={COLOR[group.kind]}>
              {group.kind.toUpperCase()}
            </Text>
            {list
              .filter(one => one.kind === group.kind)
              .map(one => {
                const name = one.path.split('/').pop() ?? one.path
                const dir = one.path.slice(0, one.path.length - name.length).replace(/^\/Users\/[^/]+/, '~')
                const n = cells(one.chars, bar)
                return (
                  <Box flexDirection="column">
                    <Box gap={2}>
                      <Box gap={1}>
                        {one.parent !== undefined && icon(ui, 'corner-down-right', '#9ca3af', '↳')}
                        {hasSvg && icon(ui, 'file-text', COLOR[group.kind], '')}
                        <Text bold>{name}</Text>
                      </Box>
                      <Text dimColor>~{tokens(one.chars)} tok</Text>
                    </Box>
                    <Box gap={1}>
                      <Text color={COLOR[group.kind]}>{'▓'.repeat(n)}</Text>
                      <Text dimColor>{'░'.repeat(Math.max(0, bar - n))}</Text>
                      <Text dimColor>{String(pct(one.chars)).padStart(3)}%</Text>
                    </Box>
                    <Text dimColor>{dir}</Text>
                  </Box>
                )
              })}
          </Box>
        ))}
      </Box>
    )
  })
}
