import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { icon } from './icons'
import type { IconName } from './icons'

import type { Step } from '../types'

const PANE = 'replay-theater'
const steps = atom({ plugin: 'replay-theater', key: 'steps' } as const, [])
const cursor = atom({ plugin: 'replay-theater', key: 'cursor' } as const, -1)
const isPlaying = atom({ plugin: 'replay-theater', key: 'isPlaying' } as const, false)

const summarize = (tool: string, e: object): string => {
  const input = e as Record<string, unknown>
  const detail = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.prompt ?? ''
  return `${tool} ${String(detail).replace(/\s+/g, ' ').slice(0, 80)}`.trim()
}

export const register: Register = (on, options) => {
  const speed = Math.max(100, Number(options.playSpeedMs ?? 800))
  const maxSteps = Math.max(10, Number(options.maxSteps ?? 500))
  let timer: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'replay',
      description: 'Open the Replay Theater pane',
    })

    if (options.openPaneAtStart !== false) {
      void $.ui.open({ id: PANE, title: 'Replay Theater' })
    }

    return next(e)
  })

  on('command.run', { command: 'replay' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Replay Theater' })

    return { text: 'Replay Theater opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const at = await $.clock.now()
    const step: Step = {
      id: e.tool_use_id,
      at,
      tool: e.tool,
      summary: summarize(e.tool, e),
      isError: false,
    }
    await update($, steps, list => [...list, step].slice(-maxSteps))
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) {
      await update($, steps, list =>
        list.map(one => (one.id === step.id ? { ...one, isError: true } : one)),
      )
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const hasSvg = ui.Svg !== undefined
    const ctl = (key: string, name: IconName, label: string, glyphLabel: string, onPress: () => void) => (
      <Box gap={1} flexShrink={0}>
        {hasSvg && icon(ui, name, '#9ca3af', '')}
        <Button key={key} label={hasSvg ? label : glyphLabel} onPress={onPress} />
      </Box>
    )
    const [list, at, playing] = [await read($, steps), await read($, cursor), await read($, isPlaying)]
    const room = Math.max(3, (e.viewport?.rows ?? 24) - 8)
    const start = Math.max(0, Math.min(at - Math.floor(room / 2), list.length - room))
    const t0 = list[0]?.at ?? 0

    const play = async () => {
      if (playing) {
        timer?.cancel(); timer = undefined; await update($, isPlaying, () => false)
        return
      }
      if (list.length === 0) return
      await update($, isPlaying, () => true)
      if (at >= list.length - 1) await update($, cursor, () => -1)
      timer = $.clock.every(speed, async () => {
        const [all, now] = [await read($, steps), await read($, cursor)]
        if (now >= all.length - 1) {
          timer?.cancel(); timer = undefined
          await update($, isPlaying, () => false)
          return
        }
        await update($, cursor, () => now + 1)
      })
    }

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          {hasSvg && icon(ui, playing ? 'play' : 'pause', playing ? '#7dff9a' : '#9ca3af', '')}
          <Text bold>
            {hasSvg ? (playing ? 'Playing' : 'Paused') : playing ? '▶ Playing' : '■ Paused'} · step {Math.max(0, at + 1)}/{list.length}
          </Text>
        </Box>
        {list.length === 0 && <Text dimColor>Nothing recorded yet.</Text>}
        {list.slice(start, start + room).map((one, i) => {
          const idx = start + i
          const secs = ((one.at - t0) / 1000).toFixed(1).padStart(6)
          return (
            <Box gap={1} alignItems="flex-start">
              {hasSvg ? (
                <Box width={2} flexShrink={0}>{idx === at && icon(ui, 'play', '#ffe066', '', 12)}</Box>
              ) : (
                <Text>{idx === at ? '▸' : ' '}</Text>
              )}
              {hasSvg ? (
                <Box width={2} flexShrink={0}>
                  {icon(ui, one.isError ? 'x' : 'check', one.isError ? '#ff7a7a' : '#7dff9a', '', 14)}
                </Box>
              ) : (
                <Text color={one.isError ? 'red' : 'green'}>{one.isError ? '✗' : '✓'}</Text>
              )}
              <Text bold={idx === at} dimColor={idx > at} color={one.isError ? 'red' : undefined}>
                {secs}s {one.summary}
              </Text>
            </Box>
          )
        })}
        <Box columnGap={2} rowGap={1} flexWrap="wrap">
          {ctl('back', 'skip-back', 'Back', '◀ Back', () => update($, cursor, n => Math.max(-1, n - 1)))}
          {ctl('play', playing ? 'pause' : 'play', playing ? 'Pause' : 'Play', playing ? 'Pause' : 'Play', play)}
          {ctl('next', 'skip-forward', 'Next', 'Next ▶', () => update($, cursor, n => Math.min(list.length - 1, n + 1)))}
          {ctl('rewind', 'rotate-ccw', 'Rewind', 'Rewind', async () => {
            timer?.cancel()
            timer = undefined
            await update($, isPlaying, () => false)
            await update($, cursor, () => -1)
          })}
          {ctl('clear', 'trash-2', 'Clear', 'Clear', async () => {
            timer?.cancel()
            timer = undefined
            await update($, isPlaying, () => false)
            await update($, steps, () => [])
            await update($, cursor, () => -1)
          })}
        </Box>
      </Box>
    )
  })
}
