import { expect, test } from 'claude-code/testing'

// Built at run time so this file holds no key-shaped literal.
const awsKey = ['AKIA', 'IOSFODNN7EXAMPLE'].join('')
const write = (path: string) => ({ tool: 'Write', file_path: path, content: `const k = '${awsKey}'` })

test('defaults: a write holding a key is refused, .env is allowed', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.toast', () => ({ value: undefined }))
  const blocked = await $.tool.call(write('config.js'))
  expect(String((blocked as { deny?: string }).deny ?? '')).toContain('secret-guard')
  const allowed = await $.tool.call(write('.env'))
  expect((allowed as { deny?: string }).deny).toBeUndefined()
})

test(
  'options: extra allowed file, and warn instead of block',
  { options: { extraAllowedFiles: 'secrets\\.yaml$' } },
  async ($, on) => {
    on('tool.call', () => ({ result: {} }))
    on('ui.toast', () => ({ value: undefined }))
    const ok = await $.tool.call(write('deploy/secrets.yaml'))
    expect((ok as { deny?: string }).deny).toBeUndefined()
  },
)

test('options: warn lets the write through', { options: { onWrite: 'warn' } }, async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.toast', () => ({ value: undefined }))
  const ok = await $.tool.call(write('config.js'))
  expect((ok as { deny?: string }).deny).toBeUndefined()
})
