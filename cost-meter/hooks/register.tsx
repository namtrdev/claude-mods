import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { icon } from './icons'

import type { TurnUse } from '../types'

const last = atom({ plugin: 'cost-meter', key: 'last' } as const, null)
const total = atom({ plugin: 'cost-meter', key: 'total' } as const, { input: 0, output: 0, read: 0, write: 0 })

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const hit = (u: TurnUse) => {
  const all = u.input + u.read + u.write
  return all === 0 ? 0 : Math.round((u.read / all) * 100)
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    if (e.usage !== undefined && e.agentId === undefined) {
      const use: TurnUse = {
        input: e.usage.input_tokens,
        output: e.usage.output_tokens,
        read: e.usage.cache_read_input_tokens,
        write: e.usage.cache_creation_input_tokens,
      }
      await update($, last, () => use)
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
    const { Box, Text } = ui
    const sum = await read($, total)

    return (
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
    )
  })
}
