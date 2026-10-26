import { expect, test } from 'claude-code/testing'

// Built at run time so this file holds no key-shaped literal.
const awsKey = ['AKIA', 'IOSFODNN7EXAMPLE'].join('')

const send = async ($: any, text: string) => {
  const r = await $.prompt.submit({ text })
  return String(r.text ?? '')
}

test('defaults mask phone, email and key', async ($, on) => {
  on('prompt.submit', (_, e) => ({ text: e.text }))
  const out = await send($, `tel 0938263356 mail a.b@example.com key ${awsKey}`)
  expect(out).toContain('[hidden:phone]')
  expect(out).toContain('[hidden:email]')
  expect(out).toContain('[hidden:aws-key]')
})

test(
  'options: phone off, custom pattern on',
  { options: { maskPhone: false, extraPatterns: 'EMP-\\d{6}' } },
  async ($, on) => {
    on('prompt.submit', (_, e) => ({ text: e.text }))
    const out = await send($, 'tel 0938263356 id EMP-123456')
    expect(out).toContain('0938263356')
    expect(out).toContain('[hidden:custom]')
  },
)
