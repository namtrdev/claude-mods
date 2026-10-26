import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { icon } from './icons'

import type { ModeName } from '../types'

const mode = atom({ plugin: 'reply-modes', key: 'mode' } as const, 'off')

const MODES: { name: ModeName; label: string; note: string }[] = [
  { name: 'short', label: 'Ngắn', note: 'Trả lời tối đa 3 câu.' },
  { name: 'detail', label: 'Chi tiết', note: 'Trả lời đầy đủ, có lập luận và ví dụ.' },
  { name: 'ask-me', label: 'Hỏi tôi', note: 'Dùng coaching: đặt câu hỏi giúp tôi tự làm rõ vấn đề, chưa đưa đáp án ngay.' },
  { name: 'critique', label: 'Phản biện', note: 'Chỉ nêu rủi ro, điểm yếu và phương án thay thế.' },
]

const ICON = { short: 'zap', detail: 'list', 'ask-me': 'circle-help', critique: 'shield-alert', off: 'circle' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    for (const one of MODES) {
      await $.command.register({ name: one.name, description: `Reply mode: ${one.label}. ${one.note}` })
    }
    await $.command.register({ name: 'mode-off', description: 'Turn the reply mode off' })

    return next(e)
  })

  for (const one of MODES) {
    on('command.run', { command: one.name }, async $ => {
      await update($, mode, () => one.name)

      return { text: `Reply mode: ${one.label}.` }
    })
  }

  on('command.run', { command: 'mode-off' }, async $ => {
    await update($, mode, () => 'off')

    return { text: 'Reply mode off.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const current = await read($, mode)
    const found = MODES.find(one => one.name === current)
    if (e.command !== undefined || found === undefined) {
      return next(e)
    }

    return next({ ...e, text: `${e.text}\n\n(Chế độ ${found.label}: ${found.note})` })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const hasSvg = ui.Svg !== undefined
    const current = await read($, mode)

    return (
      <Box gap={2}>
        <Text bold>MODE</Text>
        {MODES.map(one => (
          <Box gap={1}>
            {hasSvg && icon(ui, ICON[one.name], current === one.name ? '#7dff9a' : '#9ca3af', '')}
            <Button
              key={one.name}
              label={hasSvg ? one.label : current === one.name ? `● ${one.label}` : `○ ${one.label}`}
              onPress={() => update($, mode, () => (current === one.name ? 'off' : one.name))}
            />
          </Box>
        ))}
      </Box>
    )
  })
}
