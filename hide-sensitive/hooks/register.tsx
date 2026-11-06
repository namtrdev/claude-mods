import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

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

// Keyed secrets: `name = value` where the name says "secret".
// One pass finds each `=` and `:`, then looks back for the key name and forward for the value. Bit tricks on
// char codes (a flag table, `| 32` case folding, unsigned range tests, a last-letter bitmask) replace the regex
// lookbehinds this used before, which were several times slower on large text. Same results as the regex version.
const F_VALUE = 1
const F_HEX = 2
const F_DIGIT = 4
const F_ALPHA = 8
const F_SPACE = 16
const F_QUOTE = 32
const F_TICK = 64
const CLS = new Uint8Array(128)
for (let c = 0; c < 128; c++) {
  let f = 0
  if ((c - 48) >>> 0 < 10) f |= F_DIGIT | F_HEX | F_VALUE
  if (((c | 32) - 97) >>> 0 < 26) f |= F_ALPHA | F_VALUE
  if (((c | 32) - 97) >>> 0 < 6) f |= F_HEX
  if (c === 95 || c === 43 || c === 47 || c === 61 || c === 46 || c === 45) f |= F_VALUE
  if (c === 32 || (c - 9) >>> 0 < 5) f |= F_SPACE
  if (c === 34 || c === 39) f |= F_QUOTE
  if (c === 96) f |= F_TICK
  CLS[c] = f
}

const UNICODE_SPACE = /\s/
const isSpace = (c: number) => (c < 128 ? (CLS[c] & F_SPACE) !== 0 : UNICODE_SPACE.test(String.fromCharCode(c)))

const codes = (list: string[]) => list.map(w => Array.from(w, ch => ch.charCodeAt(0)))
// Names that mark the value after them as a secret.
const ASSIGN_NAMES = codes([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'api-key',
  'accesskey',
  'access_key',
  'access-key',
  'privatekey',
  'private_key',
  'private-key',
])
// Names that only count when the value also looks random.
const GENERIC_NAMES = codes(['key', 'credentials', 'credential', 'auth', 'passphrase'])
// Bit n is set when some name ends in the letter 'a' + n, so one shift-and-test rejects most positions.
const lastLetters = (list: number[][]) => list.reduce((m, w) => m | (1 << (w[w.length - 1] - 97)), 0)
const ASSIGN_LAST = lastLetters(ASSIGN_NAMES)
const GENERIC_LAST = lastLetters(GENERIC_NAMES)

// Length of the name from `list` that ends at text[j], or 0. Letters compare case-insensitively through `| 32`.
const nameEndsAt = (text: string, j: number, list: number[][], last: number) => {
  const lc = text.charCodeAt(j) | 32
  if ((lc - 97) >>> 0 >= 26 || ((last >>> (lc - 97)) & 1) === 0) return 0
  for (const w of list) {
    const top = w.length - 1
    if (j < top) continue
    let k = top
    while (k >= 0) {
      const c = text.charCodeAt(j - (top - k))
      if ((w[k] >= 97 ? c | 32 : c) !== w[k]) break
      k--
    }
    if (k < 0) return w.length
  }
  return 0
}

const PLACEHOLDER_WORD = /test|example|fake|dummy|sample|placeholder|changeme|your[_-]|xxxx/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// n * log2(n), so entropy is log2(len) - sum(n log2 n) / len with no per-character logarithm.
const NLOGN = new Float64Array(1025)
for (let n = 2; n <= 1024; n++) NLOGN[n] = n * Math.log2(n)
const COUNTS = new Uint32Array(128)

// Does text[v, e) look random? Plain words and ids also sit behind key-like names, so a value counts when it is
// mixed letters and digits with high entropy, and is no path, UUID, placeholder, or name made of lowercase words.
// Hex has only 16 symbols, so its entropy tops out near 4 bits: it gets a lower bar.
const isRandomRun = (text: string, v: number, e: number) => {
  const len = e - v
  const first = text.charCodeAt(v)
  if (first === 47 || first === 46 || first === 126) return false
  let any = 0
  let all = 255
  let seg = 0
  let pure = true
  let names = 0
  COUNTS.fill(0)
  for (let k = v; k < e; k++) {
    const c = text.charCodeAt(k)
    const f = CLS[c]
    any |= f
    all &= f
    COUNTS[c]++
    if (c === 45 || c === 95 || c === 46) {
      if (pure && seg >= 3) names++
      seg = 0
      pure = true
    } else {
      seg++
      if ((c - 97) >>> 0 >= 26) pure = false
    }
  }
  if (pure && seg >= 3) names++
  if ((any & F_ALPHA) === 0 || (any & F_DIGIT) === 0 || names >= 2) return false
  let sum = 0
  for (let c = 0; c < 128; c++) {
    const n = COUNTS[c]
    if (n > 1) sum += n <= 1024 ? NLOGN[n] : n * Math.log2(n)
  }
  if (Math.log2(len) - sum / len < ((all & F_HEX) !== 0 ? 3.0 : 3.5) - 1e-9) return false
  const value = text.slice(v, e)
  return !(len === 36 && UUID.test(value)) && !PLACEHOLDER_WORD.test(value)
}

// Type names that sit between a name and `=` in declarations: `let name: string = value`, `var name string = value`.
const TYPE_NAMES = codes(['string', 'str', 'number', 'int', 'integer', 'bool', 'boolean', 'any', 'bytes'])
const TYPE_LAST = lastLetters(TYPE_NAMES)
const isWordChar = (c: number) => c < 128 && ((CLS[c] & (F_ALPHA | F_DIGIT)) !== 0 || c === 95)

// Values that follow a secret-looking name but are not secrets: type names, null-like words, references to an
// environment variable or template, and masks. Masking them only hides code and docs from the model.
const NOT_SECRET = new Set([
  'string',
  'str',
  'number',
  'int',
  'integer',
  'bool',
  'boolean',
  'any',
  'bytes',
  'object',
  'unknown',
  'type',
  'value',
  'null',
  'none',
  'nil',
  'undefined',
  'true',
  'false',
  'required',
  'optional',
  'changeme',
  'redacted',
])
// The name itself as a value: a capitalised Token or an upper-case TOKEN is a type or a placeholder, but a lowercase
// one is a real default credential, so only the capitalised forms are skipped.
const NAME_AS_VALUE = new Set(['password', 'passwd', 'secret', 'token', 'key'])
const PLACEHOLDER_SHAPE =
  /^(?:<[^<>]*>[,;]?|\$(?:[{(]|[A-Z_][A-Z0-9_]*[,;)}\]]*$)|\{\{|%[^%\s]+%$|\[(?:hidden:|REDACTED)|[*xX.#-]{3,}[,;]?$)/
const ENV_REFERENCE = /^(?:process\.env|os\.environ|os\.getenv|System\.getenv|env\.|ENV\[|getenv\()/i

const isPlaceholder = (text: string, v: number, e: number) => {
  const value = text.slice(v, e)
  if (PLACEHOLDER_SHAPE.test(value) || ENV_REFERENCE.test(value)) return true
  const core = value.replace(/[,;)\]}]+$/, '')
  const low = core.toLowerCase()
  return NOT_SECRET.has(low) || (NAME_AS_VALUE.has(low) && core.charCodeAt(0) < 97)
}

// Value ranges after a secret-looking name. `generic` false: names like password or token, any value of 4+ characters.
// `generic` true: names like key or auth, a value of 16+ characters that also looks random.
const scanKeyed = (text: string, generic: boolean): [number, number][] => {
  const out: [number, number][] = []
  const n = text.length
  const names = generic ? GENERIC_NAMES : ASSIGN_NAMES
  const last = generic ? GENERIC_LAST : ASSIGN_LAST
  const min = generic ? 16 : 4
  for (let i = text.search(/[=:]/); i >= 0 && i < n; i++) {
    const c = text.charCodeAt(i)
    if (c !== 61 && c !== 58) continue
    let j = i - 1
    while (j >= 0 && isSpace(text.charCodeAt(j))) j--
    if (c === 61 && j >= 0) {
      // `name: string = value` and `name string = value`: step over the type, and the colon before it.
      const size = nameEndsAt(text, j, TYPE_NAMES, TYPE_LAST)
      if (size > 0 && (j - size < 0 || !isWordChar(text.charCodeAt(j - size)))) {
        j -= size
        while (j >= 0 && isSpace(text.charCodeAt(j))) j--
        if (j >= 0 && text.charCodeAt(j) === 58) {
          j--
          while (j >= 0 && isSpace(text.charCodeAt(j))) j--
        }
      }
    }
    if (j >= 0) {
      // A closing quote may sit between the name and the separator, as in JSON: "name": "value".
      const q = text.charCodeAt(j)
      if (q === 34 || q === 39) j--
    }
    if (j < 0 || nameEndsAt(text, j, names, last) === 0) continue
    let v = i + 1
    while (v < n && isSpace(text.charCodeAt(v))) v++
    if (v < n) {
      const q = text.charCodeAt(v)
      if (q === 34 || q === 39) v++
    }
    let e = v
    while (e < n) {
      const d = text.charCodeAt(e)
      const stop = generic
        ? d >= 128 || (CLS[d] & F_VALUE) === 0
        : d < 128
          ? (CLS[d] & (F_SPACE | F_QUOTE | F_TICK)) !== 0
          : isSpace(d)
      if (stop) break
      e++
    }
    if (e - v < min) continue
    if (!generic && isPlaceholder(text, v, e)) continue
    if (!generic || isRandomRun(text, v, e)) out.push([v, e])
    // Resume at the last matched character: it may itself be the `=` or `:` that introduces the next value.
    i = e - 2
  }
  return out
}

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

// The person's choices from the manifest's userConfig; register() fills it in.
let cfg = { keys: true, email: true, phone: true, card: true, extra: [] as RegExp[] }

const find = (text: string): Hit[] => {
  const hits: Hit[] = []
  const add = (re: RegExp, label: string, ok: (s: string) => boolean = () => true) => {
    for (const m of text.matchAll(re)) {
      if (m.index !== undefined && ok(m[0])) {
        hits.push({ start: m.index, end: m.index + m[0].length, label, original: m[0] })
      }
    }
  }
  for (const rule of RULES) {
    if (rule.label === 'email' ? cfg.email : cfg.keys) add(rule.re, rule.label)
  }
  if (cfg.keys) {
    for (const generic of [false, true]) {
      for (const [start, end] of scanKeyed(text, generic)) {
        hits.push({ start, end, label: 'secret', original: text.slice(start, end) })
      }
    }
  }
  if (cfg.card) add(CARD, 'card', isCard)
  if (cfg.phone) add(PHONE, 'phone')
  for (const re of cfg.extra) add(re, 'custom')
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: Hit[] = []
  for (const hit of hits) {
    if (kept.length === 0 || hit.start >= kept[kept.length - 1].end) kept.push(hit)
  }
  // A secret inside a URL masks the whole URL, so copying gives back the real link.
  const urls = [...text.matchAll(/https?:\/\/[^\s)>\]"'`]+/g)]
  const out: Hit[] = []
  for (const hit of kept) {
    // A hit that starts inside a URL belongs to it, even when the hit runs on past the URL's end
    // (the value then swallows the `)` that closes a markdown link).
    const url = urls.find(u => u.index! <= hit.start && hit.start < u.index! + u[0].length)
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
const PLACEHOLDER = /\[hidden:([^\]]+)\]/g

type Seg = { plain: string } | { label: string; original?: string }

// The host's UI components have no exported types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Component = any

// Draws segments as rows: plain text as text, each mask as a box that copies its original.
const view = (
  segs: Seg[],
  ui: { Box: Component; Button: Component; Text: Component; Markdown?: Component; Svg?: Component },
  copy: (item: { label: string; original?: string }, surface: unknown) => void,
) => {
  const { Box, Text } = ui
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
            const box = chip(ui, `hidden-${id}`, '████████ ', seg.label, '#ffe066', (press: { surface: unknown }) =>
              copy(seg, press.surface),
            )
            // A masked URL is itself the link to its original, which the surface opens on a press;
            // a small button beside it copies. Fixed width, as Markdown otherwise fills the row.
            if (seg.label.startsWith('url') && seg.original !== undefined && ui.Markdown !== undefined) {
              const face = `████████ ${seg.label}`
              const copyHref = `https://hidden.invalid/copy-${id}`

              // Link and copy icon share one Markdown line, so no gap sits between them; the box is
              // the text plus the icon and one cell; any more shows as a gap in the line.
              return (
                <Box width={face.length + 2} flexGrow={0} flexShrink={0} alignSelf="flex-start">
                  <ui.Markdown
                    key={`url-${id}`}
                    text={`[${face}](${seg.original}) [⧉](${copyHref})`}
                    pressableLinks={[copyHref]}
                    onLinkPress={(link: { href: string }, press: { surface: unknown }) => {
                      if (link.href === copyHref) copy(seg, press.surface)
                    }}
                  />
                </Box>
              )
            }

            return box
          })}
        </Box>
      ))}
    </Box>
  )
}

// One chip: a single Button, so the whole control (copy glyph included) is the press target.
const chip = (
  ui: { Button: Component; Text: Component },
  id: string,
  face: string,
  label: string,
  color: string,
  onPress: (press: { surface: unknown }) => void,
) => {
  const { Button, Text } = ui

  return (
    <Button key={id} plain onPress={onPress}>
      <Text backgroundColor="#3b3b3b" color={color}>
        {` ${face}${label} ⧉ `}
      </Text>
    </Button>
  )
}

// A user's row sits on the right in a rounded-looking block, as the surface draws it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bubble = (ui: { Box: any }, tree: unknown) => {
  const { Box } = ui
  return (
    <Box justifyContent="flex-end">
      <Box backgroundColor="#2b2b2b" borderStyle="round" borderColor="#2b2b2b" paddingX={1} flexDirection="column">
        {tree}
      </Box>
    </Box>
  )
}

export const register: Register = (on, options) => {
  const extra = String(options.extraPatterns ?? '')
    .split(',')
    .map(one => one.trim())
    .filter(one => one !== '')
    .flatMap(one => {
      try {
        return [new RegExp(one, 'g')]
      } catch {
        return []
      }
    })
  cfg = {
    keys: options.maskKeys !== false,
    email: options.maskEmail !== false,
    phone: options.maskPhone !== false,
    card: options.maskCard !== false,
    extra,
  }

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
    const typed =
      (await read($, isOn)) && ['composer', 'sdk', 'bridge'].includes(e.props.origin.kind) ? find(e.props.text) : []
    if (typed.length > 0) {
      const segs: Seg[] = []
      let from = 0
      for (const hit of typed) {
        segs.push({ plain: e.props.text.slice(from, hit.start) })
        segs.push({ label: hit.label, original: hit.original })
        from = hit.end
      }
      segs.push({ plain: e.props.text.slice(from) })

      const ui = $.ui.resolve(e)

      return bubble(
        ui,
        view(segs, ui, async (item, surface) => {
          const done = await $.ui.copy({ text: item.original ?? '', surface: surface as typeof e.surface })
          $.ui.toast(done.isCopied ? `Copied ${item.label}` : 'Could not copy')
        }),
      )
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

    const ui = $.ui.resolve(e)

    return bubble(
      ui,
      view(segs, ui, async (item, surface) => {
        if (item.original === undefined) {
          $.ui.toast('Original not kept (reloaded since it was sent)')
          return
        }
        const done = await $.ui.copy({ text: item.original, surface: surface as typeof e.surface })
        $.ui.toast(done.isCopied ? `Copied ${item.label}` : 'Could not copy')
      }),
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, isOn)) || find(e.props.text).length === 0) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Markdown, Text } = ui

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
                  {chip(ui, `code-${b}`, '', 'Copy (original)', '#7dff9a', press =>
                    copy(body, 'original code', press.surface as typeof e.surface),
                  )}
                </Box>
                {view(segs, ui, (item, surface) => copy(item.original ?? '', item.label, surface as typeof e.surface))}
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
            const isUrl = hit.label.startsWith('url')
            // A URL keeps its real target, so a click opens the real link; it is already a link
            // target when the markdown is `[text](url)`, so it is left as written there.
            // Other masks get a link that copies the original; code shows links as raw text.
            const asLinkTarget = isUrl && /\]\($/.test(before)
            shown +=
              before + (asLinkTarget ? hit.original : inCode ? face : `[${face}](${isUrl ? hit.original : hrefs[i]})`)
            at = hit.end
          })
          shown += block.slice(at)

          return (
            <Box flexDirection="column">
              <Markdown
                key={`md-${b}`}
                text={shown}
                pressableLinks={hrefs.filter((_, i) => !hits[i].label.startsWith('url'))}
                onLinkPress={async (link, press) => {
                  const i = hrefs.indexOf(link.href)
                  if (i < 0) return
                  const done = await $.ui.copy({ text: hits[i].original, surface: press.surface })
                  $.ui.toast(done.isCopied ? `Copied ${hits[i].label}` : 'Could not copy')
                }}
              />
              <Box gap={1} flexWrap="wrap">
                {hits.map((hit, i) =>
                  chip(ui, `hidden-${b}-${i}`, '████████ ', hit.label, '#ffe066', async press => {
                    const done = await $.ui.copy({ text: hit.original, surface: press.surface as typeof e.surface })
                    $.ui.toast(done.isCopied ? `Copied ${hit.label}` : 'Could not copy')
                  }),
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
