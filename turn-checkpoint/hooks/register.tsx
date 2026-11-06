import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Turn } from '../types'

const turns = atom({ plugin: 'turn-checkpoint', key: 'turns' } as const, [])

const WRITERS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const size = (list: Turn[]) =>
  list.reduce((sum, t) => sum + t.snaps.reduce((s, one) => s + (one.original?.length ?? 0), 0), 0)

export const register: Register = (on, options) => {
  const maxTurns = Math.max(1, Number(options.maxTurns ?? 20))
  const maxBytes = Math.max(0.1, Number(options.maxMegabytes ?? 2)) * 1_000_000
  let counter = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'undo-turn', description: 'Restore the files the last turn changed' })
    await $.command.register({ name: 'checkpoints', description: 'List the turns that changed files' })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined) {
      counter += 1
      const no = counter
      const at = await $.clock.now()
      await update($, turns, list => [...list, { no, at, prompt: e.text.slice(0, 60), snaps: [] }].slice(-maxTurns))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (WRITERS.has(e.tool)) {
      const input = e as unknown as Record<string, unknown>
      const path = String(input.file_path ?? input.notebook_path ?? '')
      const list = await read($, turns)
      const current = list[list.length - 1]
      if (path !== '' && current !== undefined && !current.snaps.some(one => one.path === path)) {
        let original: string | null = null
        try {
          original = await $.fs.read(path)
        } catch {
          // The file does not exist yet: the turn creates it.
        }
        await update($, turns, all =>
          all.map(t => (t.no === current.no ? { ...t, snaps: [...t.snaps, { path, original }] } : t)),
        )
        await update($, turns, all => {
          let kept = all
          while (kept.length > 1 && size(kept) > maxBytes) kept = kept.slice(1)
          return kept
        })
      }
    }

    return next(e)
  })

  on('command.run', { command: 'checkpoints' }, async $ => {
    const list = (await read($, turns)).filter(t => t.snaps.length > 0)
    if (list.length === 0) {
      return { text: 'No turn has changed a file yet.' }
    }

    return {
      text: list
        .map(t => `#${t.no} "${t.prompt}": ${t.snaps.map(s => s.path.split('/').pop()).join(', ')}`)
        .join('\n'),
    }
  })

  on('command.run', { command: 'undo-turn' }, async $ => {
    const list = await read($, turns)
    const target = [...list].reverse().find(t => t.snaps.length > 0)
    if (target === undefined) {
      return { text: 'Nothing to undo: no turn has changed a file.' }
    }
    const restored: string[] = []
    const created: string[] = []
    for (const snap of target.snaps) {
      if (snap.original === null) {
        created.push(snap.path)
      } else {
        await $.fs.write(snap.path, snap.original)
        restored.push(snap.path)
      }
    }
    await update($, turns, all => all.filter(t => t.no !== target.no))

    return {
      text: [
        `Undid turn #${target.no} ("${target.prompt}").`,
        `Restored ${restored.length}: ${restored.join(', ') || 'none'}`,
        created.length > 0 ? `Created by that turn and left in place (delete them yourself): ${created.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })
}
