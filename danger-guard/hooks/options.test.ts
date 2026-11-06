import { expect, test } from 'claude-code/testing'

const check = async ($: any, command: string) => {
  const r = await $.tool.check({ tool: 'Bash', input: { command } })
  return r.decision
}

const root = ['rm', '-rf', '/'].join(' ')

test('defaults: sudo asks, force push asks, deleting root is refused', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))
  on('clock.now', () => ({ value: 0 }))
  expect(await check($, 'sudo ls')).toBe('ask')
  expect(await check($, 'git push --force origin main')).toBe('ask')
  expect(await check($, root)).toBe('deny')
  expect(await check($, 'ls -la')).toBe('allow')
})

test(
  'options: allow sudo, deny force push, custom command',
  { options: { allowSudo: true, forcePush: 'deny', extraCommands: 'terraform apply' } },
  async ($, on) => {
    on('tool.check', () => ({ decision: 'allow' }))
    on('clock.now', () => ({ value: 0 }))
    expect(await check($, 'sudo ls')).toBe('allow')
    expect(await check($, 'git push -f')).toBe('deny')
    expect(await check($, 'terraform apply -auto-approve')).toBe('ask')
  },
)
