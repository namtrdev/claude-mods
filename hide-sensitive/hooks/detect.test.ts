import { expect, test } from 'claude-code/testing'

// Every secret here is built at run time, so this file holds no key-shaped literal.
let seed = 20260507
const rand = (n: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') =>
  Array.from(
    { length: n },
    () => alphabet[Math.floor(((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * alphabet.length)],
  ).join('')
const HEX = '0123456789abcdef'
const UPPER_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
// A random token that has every character class its alphabet offers (a hex alphabet has no upper case).
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
const ACCESSTOKEN = j('access', 'Token')
const DASHES = '-'.repeat(5)

const mask = async ($: any, text: string) => String((await $.prompt.submit({ text })).text ?? '')
const t = (
  name: string,
  body: (m: (text: string) => Promise<string>) => Promise<void>,
  options?: Record<string, unknown>,
) =>
  test(name, options === undefined ? {} : { options }, async ($, on) => {
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('ui.toast', () => ({ value: undefined }))
    await body(text => mask($, text))
  })
const gone = (out: string, value: string) => expect(out.includes(value)).toBe(false)

t('known key formats are replaced by their label', async m => {
  const cases: [string, string, string][] = [
    ['anthropic-key', j('sk-ant-api03-', token(90, URL_SAFE)), 'anthropic-key'],
    ['api-key', j('sk-', token(48)), 'api-key'],
    ['github-token', j('ghp_', token(36)), 'github-token'],
    ['github-token', j('github_pat_', token(22), '_', token(59)), 'github-token'],
    ['aws-key', j('AKIA', token(16, UPPER_DIGITS)), 'aws-key'],
    ['slack-token', j('xoxb-', rand(12, '0123456789'), '-', rand(12, '0123456789'), '-', token(24)), 'slack-token'],
    ['google-key', j('AIza', token(35, URL_SAFE)), 'google-key'],
    ['jwt', j('eyJ', token(15, URL_SAFE), '.eyJ', token(40, URL_SAFE), '.', token(43, URL_SAFE)), 'jwt'],
    ['bearer-token', j('Bearer ', token(40)), 'bearer-token'],
  ]
  for (const [, value, label] of cases) {
    const out = await m(`here it is: ${value} thanks`)
    gone(out, value.replace('Bearer ', ''))
    expect(out).toContain(`[hidden:${label}]`)
  }
})

t('a private key block is masked whole', async m => {
  const body = [token(64), token(64), token(64)].join('\n')
  const block = j(DASHES, 'BEGIN RSA PRIVATE KEY', DASHES, '\n', body, '\n', DASHES, 'END RSA PRIVATE KEY', DASHES)
  const out = await m(`key file:\n${block}\nend`)
  gone(out, body.split('\n')[1])
  expect(out).toContain('[hidden:private-key]')
  expect(out).toContain('key file:')
})

t('vendor tokens without a name are masked', async m => {
  const vendors: [string, string][] = [
    ['stripe-key', j('sk_live_', token(24))],
    ['stripe-key', j('rk_live_', token(24))],
    ['stripe-key', j('sk_test_', token(24))],
    ['stripe-key', j('whsec_', token(32))],
    ['gitlab-token', j('glpat-', token(20))],
    ['npm-token', j('npm_', token(36))],
    ['huggingface-token', j('hf_', token(34))],
    ['sendgrid-key', j('SG.', token(22, URL_SAFE), '.', token(43, URL_SAFE))],
    ['pypi-token', j('pypi-AgEIcHlwaS5vcmc', token(70, URL_SAFE))],
    ['shopify-token', j('shpat_', rand(32, HEX))],
    ['digitalocean-token', j('dop_v1_', rand(64, HEX))],
    ['twilio-key', j('SK', rand(32, HEX))],
    ['docker-token', j('dckr_pat_', token(27, URL_SAFE))],
  ]
  for (const [label, value] of vendors) {
    const out = await m(`use ${value} for the integration`)
    gone(out, value)
    expect(out).toContain(`[hidden:${label}]`)
  }
})

t('a secret after a known name is masked in every common syntax', async m => {
  const v = token(20)
  const forms = [
    `${j(PASSWORD)}=${v}`,
    `export DB_${PASSWORD.toUpperCase()}=${v}`,
    `${TOKEN}: ${v}`,
    `${SECRET} = "${v}"`,
    `{"${PASSWORD}": "${v}"}`,
    `{'${SECRET}': '${v}'}`,
    `{"id": 1, "access_${TOKEN}": "${v}", "x": 2}`,
    `https://api.example.com/v1?${API_KEY}=${v}&limit=10`,
    `docker run -e CLIENT_${SECRET.toUpperCase()}=${v} app`,
  ]
  for (const form of forms) gone(await m(form), v)
})

t('an unknown name with a random value is masked, a plain word is not', async m => {
  const names = ['internal_svc_key', 'deploy_key', 'SERVICE_AUTH', 'client_credential', 'signing_key', 'SECRET_KEY']
  for (const name of names) {
    for (const value of [token(24), rand(40, HEX), token(32, URL_SAFE)]) {
      const text = `${name}=${value}`
      gone(await m(text), value)
    }
  }
  for (const text of [
    'sort_key=created_at',
    'cache_key=user-profile-settings-v2',
    'primary_key=id',
    'auth=false',
    'monkey=banana',
    's3_key=reports/2024/q3-summary.csv',
    'ssh_key=~/.ssh/id_ed25519.pub',
  ]) {
    expect(await m(text)).toBe(text)
  }
})

t('typed declarations and bracketed names are read through to the value', async m => {
  const v = token(20)
  const forms = [
    `let ${APIKEY}: string = '${v}';`,
    `const ${ACCESSTOKEN}: string = "${v}"`,
    `var apiKey string = "${v}"`,
    `${API_KEY}: str = "${v}"`,
    `${PASSWORD}: string = "${v}"`,
    `os.environ["API_KEY"] = "${v}"`,
    `env['${TOKEN.toUpperCase()}'] = '${v}'`,
    `config["db_${PASSWORD}"] = "${v}"`,
  ]
  for (const form of forms) gone(await m(form), v)
})

t('placeholders, type names and references are left alone', async m => {
  const same = [
    `${PASSWORD}: string`,
    `${PASSWORD}: string;`,
    `${TOKEN}: Token`,
    `${SECRET}: Secret,`,
    `"${TOKEN}": "string"`,
    `${PASSWORD}: null,`,
    `${PASSWORD}=<${PASSWORD}>`,
    `${API_KEY}=********`,
    `${TOKEN}: \${TOKEN}`,
    `${SECRET}: $SECRET`,
    `${PASSWORD}: process.env.DB_PASSWORD`,
    `let ${APIKEY}: string = process.env.API_KEY`,
    `const ${TOKEN}: string;`,
    `${PASSWORD}: undefined`,
    `${PASSWORD}={{ secrets.DB_PASSWORD }}`,
    `client_${SECRET}=[REDACTED]`,
    `${TOKEN}=[hidden:api-key]`,
    `${PASSWORD}: %DB_PASS%`,
    `"${PASSWORD}": ""`,
    `${PASSWORD}: true`,
    `${API_KEY}=changeme`,
    `${API_KEY}=example`,
    `${SECRET}: sample`,
  ]
  for (const text of same) expect(await m(text)).toBe(text)
})

t('the name itself as a value: capitalised is a type, lowercase is a real default', async m => {
  expect(await m(`${TOKEN}: ${TOKEN[0].toUpperCase()}${TOKEN.slice(1)}`)).toBe(
    `${TOKEN}: ${TOKEN[0].toUpperCase()}${TOKEN.slice(1)}`,
  )
  expect(await m(`${TOKEN}: ${TOKEN.toUpperCase()}`)).toBe(`${TOKEN}: ${TOKEN.toUpperCase()}`)
  for (const w of [PASSWORD, SECRET, TOKEN]) gone(await m(`${w}=${w}`), `=${w}`)
})

t('a secret already masked by a specific rule keeps its label', async m => {
  const key = j('sk-', token(48))
  const out = await m(`${TOKEN}=${key}`)
  gone(out, key)
  expect(out).toContain('[hidden:api-key]')
})

t('credentials in a connection string are masked, with or without an @ in the secret', async m => {
  const pw = token(14)
  for (const dsn of [
    `postgres://app:${pw}@db:5432/x`,
    `redis://:${pw}@cache:6379/0`,
    `mongodb+srv://u:${pw}@c.mongodb.net/t`,
    `amqp://guest:${pw}@mq/`,
  ]) {
    const out = await m(`conn = ${dsn}`)
    gone(out, pw)
    expect(out).toContain('[hidden:') // a dotted host can also read as an email, which is masked first
  }
  const odd = j('Hunter', '@', '2024')
  gone(await m(`postgres://app:${odd}@db:5432/x`), odd)
  gone(await m(`clone https://u:${j('p', '@', 'ss-w0rd')}@git.example.com/r.git`), j('p', '@', 'ss-w0rd'))
  for (const text of [
    'http://localhost:8080/path',
    'https://example.com:443/x',
    'http://[::1]:8080/health',
    j('postgres://user:${DB_PASS}@db/app'),
    'postgres://user:<password>@localhost/db',
    'redis://:****@cache:6379',
    'https://example.com/path',
  ]) {
    expect(await m(text)).toBe(text)
  }
})

t('Authorization Basic, curl -u and Cookie headers are masked', async m => {
  const v = token(16)
  const forms = [
    j('Authorization', ': ', 'Basic ', v),
    j('curl -H "Authorization', ': Basic ', v, '==" https://x.io'),
    `curl -u admin:${v} https://x.io`,
    `curl --user admin:${v} https://x.io`,
    j('Cookie', ': session', '=', v, '; theme=dark'),
    j('Set-Cookie', ': sid', '=', v, '; Path=/'),
    j("curl -H 'Cookie", ': session', '=', v, "' https://x.io"),
  ]
  for (const form of forms) gone(await m(form), v)
  for (const text of [
    'Basic configuration options are listed below',
    'git push -u origin main',
    'docker run -u 1000:1000 nginx',
    'ls -u',
    'curl -u user: https://x.io',
    j('Cookie', ': sessions are stored on the server'),
  ]) {
    expect(await m(text)).toBe(text)
  }
})

t('emails, cards and phone numbers are masked', async m => {
  expect(await m('write to jane.doe+tag@mail.example.co.uk now')).toBe('write to [hidden:email] now')
  // The second address starts right where the first one ends.
  expect(await m('x@a.com+y@b.io')).toBe('[hidden:email][hidden:email]')
  expect(await m('card 4111 1111 1111 1111 exp 12/27')).toContain('[hidden:card]')
  expect(await m('card 4111-1111-1111-1111')).toContain('[hidden:card]')
  for (const phone of ['0938263356', '0938 263 356', '+84 91 234 5678', '+1 415 555 0132'])
    expect(await m(`call ${phone} today`)).toContain('[hidden:phone]')
  // Sixteen digits that fail the Luhn check, an epoch in milliseconds and an IP are not cards or phones.
  for (const text of [
    'order 1234567890123456 shipped',
    'ts=1700000000000',
    'ip 192.168.1.10',
    'v1.22.3-rc.1',
    '2024-05-06T12:30:45Z',
  ])
    expect(await m(text)).toBe(text)
})

t('ordinary code and prose are untouched', async m => {
  const same = [
    `commit ${rand(40, HEX)}`,
    `sha256:${rand(64, HEX)}`,
    `id ${rand(8, HEX)}-${rand(4, HEX)}-4${rand(3, HEX)}-a${rand(3, HEX)}-${rand(12, HEX)}`,
    "SELECT id, name FROM users WHERE age >= 21 AND status = 'active';",
    '.btn{color:#e03868;margin:0 auto}',
    '{"name": "svc", "count": 3, "enabled": true}',
    'replicas: 3\nimage: nginx:1.25.3\nport: 8080',
    'for f in *.txt; do wc -l "$f"; done',
    'build #4821 took 37s',
  ]
  for (const text of same) expect(await m(text)).toBe(text)
})
