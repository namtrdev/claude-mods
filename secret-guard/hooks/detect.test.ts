import { expect, test } from 'claude-code/testing'

// Every secret here is built at run time, so this file holds no key-shaped literal.
let seed = 20260508
const rand = (n: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') =>
  Array.from(
    { length: n },
    () => alphabet[Math.floor(((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * alphabet.length)],
  ).join('')
const HEX = '0123456789abcdef'
// A random token that has every character class its alphabet offers.
const token = (n: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string => {
  const classes = [/[a-z]/, /[A-Z]/, /\d/].filter(re => re.test(alphabet))
  for (;;) {
    const t = rand(n, alphabet)
    if (classes.every(re => re.test(t))) return t
  }
}
const j = (...parts: string[]) => parts.join('')
const PASSWORD = j('pass', 'word')
const SECRET = j('sec', 'ret')
const TOKEN = j('tok', 'en')
const API_KEY = j('api', '_key')
const APIKEY = j('api', 'Key')
const DASHES = '-'.repeat(5)

type Verdict = { deny?: string; result?: { text?: string } }
const write = async ($: any, content: string, path = 'config.js'): Promise<Verdict> =>
  $.tool.call({ tool: 'Write', file_path: path, content })
const refused = (v: Verdict) => String(v.deny ?? '').includes('secret-guard')
const gone = (text: string, value: string) => expect(text.includes(value)).toBe(false)

type Reply = (fn: (call: any) => unknown) => void
// A test may register on('tool.call') only once, so every test shares one handler whose answer it can replace.
const t = (name: string, body: ($: any, reply: Reply) => Promise<void>, options?: Record<string, unknown>) =>
  test(name, options === undefined ? {} : { options }, async ($, on) => {
    let answer: (call: any) => unknown = () => ({ result: {} })
    on('tool.call', (_, e: any) => answer(e))
    on('ui.toast', () => ({ value: undefined }))
    await body($, fn => {
      answer = fn
    })
  })

// What a tool returns, as secret-guard hands it to the model.
const seen = async ($: any, reply: Reply, text: string): Promise<string> => {
  reply(() => ({ result: { text } }))
  const r = (await $.tool.call({ tool: 'Read', file_path: 'notes.txt' })) as Verdict
  return String(r.result?.text ?? '')
}

t('a write holding a secret is refused, whatever the format', async $ => {
  const v = token(24)
  const forms = [
    j('sk-', token(48)),
    j('ghp_', token(36)),
    j('sk_live_', token(24)),
    j('glpat-', token(20)),
    j('npm_', token(36)),
    j('hf_', token(34)),
    `${PASSWORD}=${v}`,
    `{"${PASSWORD}": "${v}"}`,
    `deploy_key=${token(32)}`,
    `{"signing_key": "${token(32)}"}`,
    `let ${APIKEY}: string = '${v}'`,
    `os.environ["API_KEY"] = "${v}"`,
    j('postgres://app:', v, '@db:5432/x'),
    j('Authorization', ': Basic ', v),
    j('Cookie', ': session', '=', v),
    `curl -u admin:${v} https://x.io`,
  ]
  for (const form of forms) expect(refused(await write($, `const x = '${form}'`))).toBe(true)
})

t('a write of a PEM block is refused', async $ => {
  const block = j(DASHES, 'BEGIN PRIVATE KEY', DASHES, '\n', token(64), '\n', DASHES, 'END PRIVATE KEY', DASHES)
  expect(refused(await write($, block))).toBe(true)
})

t('a write is allowed for .env files, placeholders, hashes and plain config', async $ => {
  const secret = `${PASSWORD}=${token(20)}`
  expect((await write($, secret, '.env')).deny).toBeUndefined()
  expect((await write($, secret, 'deploy/.env.production')).deny).toBeUndefined()
  const fine = [
    `${PASSWORD}: string`,
    `${TOKEN}: Token`,
    `${API_KEY}=changeme`,
    `${PASSWORD}=<${PASSWORD}>`,
    `${SECRET}: \${${SECRET.toUpperCase()}}`,
    `${PASSWORD}: process.env.DB_PASSWORD`,
    `let ${APIKEY}: string = process.env.API_KEY`,
    `commit ${rand(40, HEX)}`,
    'sort_key=created_at',
    'cache_key=user-profile-settings-v2',
    'replicas: 3\nimage: nginx:1.25.3',
  ]
  for (const content of fine) expect((await write($, content)).deny).toBeUndefined()
})

t('Edit and MultiEdit are checked on the new text', async $ => {
  const v = token(24)
  const edit = (await $.tool.call({
    tool: 'Edit',
    file_path: 'a.ts',
    old_string: 'x',
    new_string: `${PASSWORD}=${v}`,
  })) as Verdict
  expect(refused(edit)).toBe(true)
  const multi = (await $.tool.call({
    tool: 'MultiEdit',
    file_path: 'a.ts',
    edits: [
      { old_string: 'a', new_string: 'b' },
      { old_string: 'c', new_string: j('sk-', token(48)) },
    ],
  })) as Verdict
  expect(refused(multi)).toBe(true)
  const clean = (await $.tool.call({
    tool: 'Edit',
    file_path: 'a.ts',
    old_string: 'x',
    new_string: 'const y = 2',
  })) as Verdict
  expect(clean.deny).toBeUndefined()
})

t('a tool result is masked, and the secret never reaches the model', async ($, reply) => {
  const v = token(24)
  const key = j('sk-', token(48))
  const out = await seen(
    $,
    reply,
    [
      `${PASSWORD}=${v}`,
      `{"signing_key": "${token(32)}"}`,
      `see ${key} here`,
      j('postgres://app:', v, '@db:5432/x'),
      `curl -u admin:${v} https://x.io`,
    ].join('\n'),
  )
  gone(out, v)
  gone(out, key)
  expect(out).toContain('[hidden:api-key]')
  expect(out).toContain('[hidden:secret]')
})

t('a secret nested in an object or an array is masked too', async ($, reply) => {
  const v = token(24)
  reply(() => ({ result: { items: [{ note: `${TOKEN}=${v}` }, { deep: { value: j('ghp_', token(36)) } }] } }))
  const r = (await $.tool.call({ tool: 'Read', file_path: 'a.json' })) as { result?: unknown }
  const text = JSON.stringify(r.result)
  gone(text, v)
  expect(text).toContain('[hidden:github-token]')
})

t('a value masked by a specific rule keeps its label', async ($, reply) => {
  const key = j('sk-', token(48))
  const out = await seen($, reply, `${TOKEN}=${key}`)
  gone(out, key)
  expect(out).toContain('[hidden:api-key]')
  expect(out.includes('[hidden:secret]')).toBe(false)
})

t('a result with nothing secret comes back unchanged', async ($, reply) => {
  const text = [
    `commit ${rand(40, HEX)}`,
    `${PASSWORD}: string`,
    'sort_key=created_at',
    'SELECT id FROM users WHERE a = 1;',
    'http://localhost:8080/path',
    'docker run -u 1000:1000 nginx',
  ].join('\n')
  expect(await seen($, reply, text)).toBe(text)
})

// The detectors must stay linear. Each input took seconds in the regex version (the email-like one 35 s at this size).
const timed = (name: string, make: () => string) =>
  t(`stays linear: ${name}`, async ($, reply) => {
    const text = make()
    reply(() => ({ result: { text } }))
    const start = performance.now()
    await $.tool.call({ tool: 'Read', file_path: 'big.txt' })
    await write($, text)
    expect(performance.now() - start).toBeLessThan(500)
  })

timed('many JWT-looking prefixes in one run', () => '-eyJaaaaaaa'.repeat(23_000))
timed('private key headers that are never closed', () => `${DASHES}BEGIN PRIVATE KEY${DASHES}\n`.repeat(9_000))
timed('URLs with a colon and no @', () => 'http://u:p '.repeat(23_000))
