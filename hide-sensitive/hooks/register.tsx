import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { icon } from './icons'

const isOn = atom({ plugin: 'hide-sensitive', key: 'isOn' } as const, true)
const masked = atom({ plugin: 'hide-sensitive', key: 'masked' } as const, 0)

const RULES: { label: string; re: RegExp }[] = [
  { label: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { label: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: 'api-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { label: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/g },
  { label: 'aws-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { label: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'google-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { label: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g },
  { label: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
]

// Value of key=value or key: value where the key names a secret.
const ASSIGN = /(?<=\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[=:]\s*["']?)[^\s"']{4,}/gi

// Strict phone shapes only: +<country code> numbers and Vietnamese mobile numbers (03/05/07/08/09).
const PHONE = /(?<![\w+])(?:\+\d{1,3}[ .-]?\d{1,4}(?:[ .-]?\d{2,4}){2,4}|0[35789](?:[ .-]?\d){8})(?![\w])/g

const CARD = /\b(?:\d[ -]?){13,19}\b/g

const isCard = (raw: string) => {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

type Hit = { start: number; end: number; label: string; original: string }
type Item = { label: string; original: string }

const find = (text: string): Hit[] => {
  const hits: Hit[] = []
  const add = (re: RegExp, label: string, ok: (s: string) => boolean = () => true) => {
    for (const m of text.matchAll(re)) {
      if (m.index !== undefined && ok(m[0])) {
        hits.push({ start: m.index, end: m.index + m[0].length, label, original: m[0] })
      }
    }
  }
  for (const rule of RULES) add(rule.re, rule.label)
  add(ASSIGN, 'secret')
  add(CARD, 'card', isCard)
  add(PHONE, 'phone')
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: Hit[] = []
  for (const hit of hits) {
    if (kept.length === 0 || hit.start >= kept[kept.length - 1].end) kept.push(hit)
  }
  // A secret inside a URL masks the whole URL, so copying gives back the real link.
  const urls = [...text.matchAll(/https?:\/\/[^\s)>\]"'`]+/g)]
  const out: Hit[] = []
  for (const hit of kept) {
    const url = urls.find(u => u.index! <= hit.start && hit.end <= u.index! + u[0].length)
    if (url === undefined) {
      out.push(hit)
    } else if (!out.some(o => o.start === url.index)) {
      out.push({ start: url.index!, end: url.index! + url[0].length, label: `url (${hit.label})`, original: url[0] })
    }
  }
  return out
}

const mask = (text: string) => {
  const hits = find(text)
  let out = ''
  let at = 0
  for (const hit of hits) {
    out += text.slice(at, hit.start) + `[hidden:${hit.label}]`
    at = hit.end
  }
  return { out: out + text.slice(at), items: hits.map(h => ({ label: h.label, original: h.original })) }
}

// Originals, by the masked text the row will show. Memory only: gone on reload.
const vault = new Map<string, Item[]>()
const PLACEHOLDER = /\[hidden:([a-z-]+)\]/g

type Seg = { plain: string } | { label: string; original?: string }

// Draws segments as rows: plain text as text, each mask as a box that copies its original.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const view = (segs: Seg[], ui: { Box: any; Button: any; Text: any; Svg?: any }, copy: (item: { label: string; original?: string }, surface: unknown) => void) => {
  const { Box, Button, Text } = ui
  const lines: Seg[][] = [[]]
  for (const seg of segs) {
    if ('plain' in seg) {
      seg.plain.split('\n').forEach((part, i) => {
        if (i > 0) lines.push([])
        if (part !== '') lines[lines.length - 1].push({ plain: part })
      })
    } else {
      lines[lines.length - 1].push(seg)
    }
  }
  let n = 0

  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Box flexWrap="wrap">
          {line.length === 0 && <Text> </Text>}
          {line.map(seg => {
            if ('plain' in seg) return <Text>{seg.plain}</Text>
            const id = n
            n += 1
            return (
              <Box gap={1}>
                <Button key={`hidden-${id}`} plain onPress={(press: { surface: unknown }) => copy(seg, press.surface)}>
                  <Text backgroundColor="#3b3b3b" color="#ffe066">
                    {' ████████ '}
                    <Text dimColor>{seg.label}{ui.Svg === undefined ? ' ⧉ ' : ' '}</Text>
                  </Text>
                </Button>
                {ui.Svg !== undefined && icon(ui, 'copy', '#9ca3af', '', 14)}
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hide-sensitive',
      description: 'Turn masking of sensitive data in your messages on or off',
    })

    return next(e)
  })

  on('command.run', { command: 'hide-sensitive' }, async $ => {
    const was = await read($, isOn)
    await update($, isOn, () => !was)
    $.ui.status(was ? 'sensitive masking OFF' : undefined)

    return { text: was ? 'Sensitive-data masking is OFF.' : 'Sensitive-data masking is ON.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || !(await read($, isOn))) {
      return next(e)
    }
    const { out, items } = mask(e.text)
    if (items.length === 0) {
      return next(e)
    }
    vault.set(out, items)
    if (vault.size > 50) vault.delete(vault.keys().next().value as string)
    await update($, masked, n => n + items.length)
    $.ui.toast(`Hid ${items.length} sensitive item${items.length > 1 ? 's' : ''} before sending`)

    return next({ ...e, text: out })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    // The row carries the prompt as typed, so the secrets are still in it: box them on screen.
    const typed = (await read($, isOn)) && ['composer', 'sdk', 'bridge'].includes(e.props.origin.kind) ? find(e.props.text) : []
    if (typed.length > 0) {
      const segs: Seg[] = []
      let from = 0
      for (const hit of typed) {
        segs.push({ plain: e.props.text.slice(from, hit.start) })
        segs.push({ label: hit.label, original: hit.original })
        from = hit.end
      }
      segs.push({ plain: e.props.text.slice(from) })

      return view(segs, $.ui.resolve(e), async (item, surface) => {
        const done = await $.ui.copy({ text: item.original ?? '', surface: surface as typeof e.surface })
        $.ui.toast(done.isCopied ? `Copied ${item.label}` : 'Could not copy')
      })
    }

    const found = [...e.props.text.matchAll(PLACEHOLDER)]
    if (found.length === 0) {
      return next(e)
    }
    const kept = vault.get(e.props.text) ?? vault.get(e.props.text.trim())
    const items: Item[] =
      kept !== undefined && kept.length === found.length ? kept : found.map(m => ({ label: m[1], original: '' }))
    const segs: Seg[] = []
    let at = 0
    found.forEach((m, i) => {
      segs.push({ plain: e.props.text.slice(at, m.index) })
      segs.push({ label: items[i].label, original: items[i].original || undefined })
      at = m.index! + m[0].length
    })
    segs.push({ plain: e.props.text.slice(at) })

    return view(segs, $.ui.resolve(e), async (item, surface) => {
      if (item.original === undefined) {
        $.ui.toast('Original not kept (reloaded since it was sent)')
        return
      }
      const done = await $.ui.copy({ text: item.original, surface: surface as typeof e.surface })
      $.ui.toast(done.isCopied ? `Copied ${item.label}` : 'Could not copy')
    })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, isOn)) || find(e.props.text).length === 0) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = ui
    const hasSvg = ui.Svg !== undefined

    // Blocks split at blank lines outside code fences, so each keeps its own markdown.
    const blocks: string[] = []
    let current: string[] = []
    let inFence = false
    for (const line of e.props.text.split('\n')) {
      if (line.trimStart().startsWith('```')) inFence = !inFence
      if (line.trim() === '' && !inFence) {
        if (current.length > 0) blocks.push(current.join('\n'))
        current = []
      } else {
        current.push(line)
      }
    }
    if (current.length > 0) blocks.push(current.join('\n'))

    return (
      <Box flexDirection="column" gap={1}>
        {blocks.map((block, b) => {
          const hits = find(block)
          if (hits.length === 0) return <Markdown text={block} />
          const isFence = block.trimStart().startsWith('```')
          if (isFence) {
            // Drawn here, not by Markdown, so its copy button is ours and copies the original.
            const rows = block.split('\n')
            const lang = rows[0].trim().replace(/^`+/, '')
            const body = rows.slice(1, rows[rows.length - 1].trim().startsWith('```') ? -1 : undefined).join('\n')
            const segs: Seg[] = []
            let from = 0
            for (const hit of find(body)) {
              segs.push({ plain: body.slice(from, hit.start) })
              segs.push({ label: hit.label, original: hit.original })
              from = hit.end
            }
            segs.push({ plain: body.slice(from) })
            const copy = async (original: string, label: string, surface: typeof e.surface) => {
              const done = await $.ui.copy({ text: original, surface })
              $.ui.toast(done.isCopied ? `Copied ${label}` : 'Could not copy')
            }

            return (
              <Box flexDirection="column" borderStyle="round" paddingX={1}>
                <Box justifyContent="space-between">
                  <Text dimColor>{lang === '' ? 'code' : lang}</Text>
                  <Box gap={1}>
                    {hasSvg && icon(ui, 'copy', '#7dff9a', '')}
                    <Button key={`code-${b}`} plain onPress={press => copy(body, 'original code', press.surface)}>
                      <Text color="#7dff9a">{hasSvg ? 'Copy (original)' : '⧉ Copy (original)'}</Text>
                    </Button>
                  </Box>
                </Box>
                {view(segs, ui, (item, surface) =>
                  copy(item.original ?? '', item.label, surface as typeof e.surface),
                )}
              </Box>
            )
          }
          const hrefs = hits.map((_, i) => `https://hidden.invalid/${b}-${i}`)
          let shown = ''
          let at = 0
          hits.forEach((hit, i) => {
            const before = block.slice(at, hit.start)
            const lineStart = block.lastIndexOf('\n', hit.start - 1) + 1
            const inCode = (block.slice(lineStart, hit.start).split('`').length - 1) % 2 === 1
            const face = `████ ${hit.label}`
            // A link makes the mask clickable inside the markdown; code shows links as raw text.
            shown += before + (inCode ? face : `[${face}](${hrefs[i]})`)
            at = hit.end
          })
          shown += block.slice(at)

          return (
            <Box flexDirection="column">
              <Markdown
                key={`md-${b}`}
                text={shown}
                pressableLinks={hrefs}
                onLinkPress={async (link, press) => {
                  const i = hrefs.indexOf(link.href)
                  if (i < 0) return
                  const done = await $.ui.copy({ text: hits[i].original, surface: press.surface })
                  $.ui.toast(done.isCopied ? `Copied ${hits[i].label}` : 'Could not copy')
                }}
              />
              <Box gap={1} flexWrap="wrap">
                {hits.map((hit, i) => (
                  <Box gap={1}>
                    <Button
                      key={`hidden-${b}-${i}`}
                      plain
                      onPress={async press => {
                        const done = await $.ui.copy({ text: hit.original, surface: press.surface })
                        $.ui.toast(done.isCopied ? `Copied ${hit.label}` : 'Could not copy')
                      }}
                    >
                      <Text backgroundColor="#3b3b3b" color="#ffe066">
                        {' ████████ '}
                        <Text dimColor>{hit.label}{hasSvg ? ' ' : ' ⧉ '}</Text>
                      </Text>
                    </Button>
                    {hasSvg && icon(ui, 'copy', '#9ca3af', '', 14)}
                  </Box>
                ))}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
