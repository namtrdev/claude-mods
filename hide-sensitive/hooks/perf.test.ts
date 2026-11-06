import { expect, test } from 'claude-code/testing'

// The detectors must stay linear. Each input below took seconds in the regex version (the email one 35 s).
const DASHES = '-'.repeat(5)
const API_KEY = ['api', '_key'].join('')
const mask = async ($: any, text: string) => String((await $.prompt.submit({ text })).text ?? '')
const t = (name: string, body: (m: (text: string) => Promise<string>) => Promise<void>) =>
  test(name, async ($, on) => {
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('ui.toast', () => ({ value: undefined }))
    await body(text => mask($, text))
  })

const timed = (name: string, make: () => string) =>
  t(`stays linear: ${name}`, async m => {
    const text = make()
    const start = performance.now()
    await m(text)
    expect(performance.now() - start).toBeLessThan(300)
  })

timed('a long run that looks like an email local part', () => 'a.'.repeat(125_000))
timed('many JWT-looking prefixes in one run', () => '-eyJaaaaaaa'.repeat(23_000))
timed('private key headers that are never closed', () => `${DASHES}BEGIN PRIVATE KEY${DASHES}\n`.repeat(9_000))
timed('URLs with a colon and no @', () => 'http://u:p '.repeat(23_000))
timed('a megabyte of URLs that each hold a secret', () => `http://x.io/?${API_KEY}=abcd1234 `.repeat(36_000))
