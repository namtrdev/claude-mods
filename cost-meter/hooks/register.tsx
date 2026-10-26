import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { icon } from './icons'

import type { TurnUse } from '../types'

const last = atom({ plugin: 'cost-meter', key: 'last' } as const, null)
const ttl = atom({ plugin: 'cost-meter', key: 'ttl' } as const, '5m')
const lastAt = atom({ plugin: 'cost-meter', key: 'lastAt' } as const, 0)
const total = atom({ plugin: 'cost-meter', key: 'total' } as const, { input: 0, output: 0, read: 0, write: 0 })

const NAME = { '5m': '5 min', '1h': '1 hour' }
const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const hit = (u: TurnUse) => {
  const all = u.input + u.read + u.write
  return all === 0 ? 0 : Math.round((u.read / all) * 100)
}

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    timer?.cancel()
    timer = $.clock.every(1000, async () => {
      const at = await read($, lastAt)
      if (at === 0) return
      const left = at + TTL_MS[await read($, ttl)] - (await $.clock.now())
      $.ui.status(left > 0 ? `cache warm ${clock(left)}` : 'cache cold')
      $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.usage !== undefined && e.agentId === undefined) {
      const use: TurnUse = {
        input: e.usage.input_tokens,
        output: e.usage.output_tokens,
        read: e.usage.cache_read_input_tokens,
        write: e.usage.cache_creation_input_tokens,
      }
      await update($, last, () => use)
      const now = await $.clock.now()
      await update($, lastAt, () => now)
      await update($, total, sum => ({
        input: sum.input + use.input,
        output: sum.output + use.output,
        read: sum.read + use.read,
        write: sum.write + use.write,
      }))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const turn = await read($, last)
    if (e.props.hasSurvey || turn === null) {
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const sum = await read($, total)
    const span = await read($, ttl)
    const at = await read($, lastAt)
    const left = at + TTL_MS[span] - (await $.clock.now())
    const hasSvg = ui.Svg !== undefined

    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={2}>
          <Box gap={1}>
            {ui.Svg !== undefined && icon(ui, 'gauge', '#9ca3af', '')}
            <Text bold>USAGE</Text>
          </Box>
          <Text>
            turn <Text color="#5fe3ff">in {k(turn.input + turn.read + turn.write)}</Text>{' '}
            <Text color="#ffe066">out {k(turn.output)}</Text>{' '}
            <Text color="#7dff9a">cache {hit(turn)}%</Text>
          </Text>
          <Text dimColor>
            session in {k(sum.input + sum.read + sum.write)} · out {k(sum.output)} · cache {hit(sum)}%
          </Text>
        </Box>
        <Box gap={2}>
          <Box gap={1}>
            {hasSvg && icon(ui, 'timer', left > 0 ? '#7dff9a' : '#9ca3af', '')}
            <Text color={left > 0 ? 'green' : undefined} dimColor={left <= 0}>
              {left > 0 ? `cache warm ${clock(left)}` : 'cache cold'}
            </Text>
          </Box>
          <Text dimColor>Cache TTL:</Text>
          {(['5m', '1h'] as const).map(one => (
            <Box gap={1}>
              {hasSvg && icon(ui, span === one ? 'circle-dot' : 'circle', span === one ? '#7dff9a' : '#9ca3af', '', 12)}
              <Button key={`ttl-${one}`} label={hasSvg ? NAME[one] : span === one ? `● ${NAME[one]}` : `○ ${NAME[one]}`} onPress={() => update($, ttl, () => one)} />
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
