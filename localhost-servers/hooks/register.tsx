import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Server } from '../types'

const servers = atom({ plugin: 'localhost-servers', key: 'servers' } as const, [])
const isExpanded = atom({ plugin: 'localhost-servers', key: 'isExpanded' } as const, true)

const POLL_MS = 4000
const FRESH_MS = 20000
const LOCAL = /^(127\.0\.0\.1|\[::1\]|localhost)$/

// lsof -F output: p<pid>, c<command>, then one n<host:port> per listening socket.
const parseListeners = (out: string) => {
  const found: { pid: number; cmd: string; port: number; scope: 'local' | 'all' }[] = []
  let pid = 0
  let cmd = ''
  for (const line of out.split('\n')) {
    const tag = line[0]
    const rest = line.slice(1)
    if (tag === 'p') pid = Number(rest)
    else if (tag === 'c') cmd = rest
    else if (tag === 'n') {
      const at = rest.lastIndexOf(':')
      const port = Number(rest.slice(at + 1))
      if (at > 0 && port > 0 && !found.some(f => f.pid === pid && f.port === port)) {
        found.push({ pid, cmd, port, scope: LOCAL.test(rest.slice(0, at)) ? 'local' : 'all' })
      }
    }
  }
  return found
}

const parseCwds = (out: string) => {
  const map = new Map<number, string>()
  let pid = 0
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n') map.set(pid, line.slice(1))
  }
  return map
}

const parseUptimes = (out: string) => {
  const map = new Map<number, { up: string; command: string }>()
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/)
    if (m) map.set(Number(m[1]), { up: m[2] ?? '', command: m[3] ?? '' })
  }
  return map
}

const tilde = (path: string, home: string) => (path.startsWith(home) ? `~${path.slice(home.length)}` : path)

// Re-check the pid still runs the command that was listed, so a reused pid is never signalled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signal($: any, s: Server, sig: 'TERM' | 'KILL') {
  const ps = await $.process.run(['ps', '-o', 'command=', '-p', String(s.pid)])
  if (ps.stdout.trim() !== s.cmd) return $.ui.toast(`:${s.port} changed, not signalled`)
  await $.process.run(['kill', `-${sig}`, String(s.pid)])
  await update($, servers, (prev: Server[]) => prev.filter(one => one.pid !== s.pid))
  $.ui.toast(`${sig === 'TERM' ? 'Stopped' : 'Terminated'} :${s.port} (pid ${s.pid})`)
}

// "/path/node /path/.bin/vite --port 3000" -> "node vite"
function label(cmd: string) {
  return cmd
    .split(' ')
    .filter(t => !t.startsWith('-'))
    .slice(0, 2)
    .map(t => t.split('/').pop())
    .join(' ')
}

// Cells are sized by Box width, not by padding: the desktop surface draws a proportional font.
const clip = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text)

// "~/Desktop/journey/portfolio/web" -> "…/portfolio/web"
function shortPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`
}

const COLS = [
  { name: 'PORT', width: 9 },
  { name: 'PROCESS', width: 26 },
  { name: 'PID', width: 10 },
  { name: 'UPTIME', width: 12 },
]

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'localhost-servers',
      description: 'Expand or collapse the localhost servers band',
    })

    const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
    const dir = `${home}/.claude/localhost-servers`
    const id = await $.session.id()
    const cwd = (await $.process.run(['pwd'])).stdout.trim()
    let busy = false

    const scan = async () => {
      if (busy) return
      busy = true
      try {
        // Heartbeat first: one file per session, so concurrent sessions never write the same file.
        // The session's name is the last customTitle in its transcript; the id stands in until it has one.
        const transcript = `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/${id}.jsonl`
        const named = await $.process.run(['grep', '-o', '"customTitle":"[^"]*"', transcript])
        const title = named.stdout.trim().split('\n').pop()?.slice(15, -1) || id.slice(0, 8)
        await $.fs.write(`${dir}/${id}.json`, JSON.stringify({ id, title, cwd, at: await $.clock.now() }))

        const listen = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'])
        const found = parseListeners(listen.stdout)
        const pids = [...new Set(found.map(f => f.pid))].join(',')
        if (pids === '') return update($, servers, () => [])

        const [cwds, ps] = await Promise.all([
          $.process.run(['lsof', '-a', '-d', 'cwd', '-Fpn', '-p', pids]),
          $.process.run(['ps', '-o', 'pid=,etime=,command=', '-p', pids]),
        ])
        const cwdOf = parseCwds(cwds.stdout)
        const psOf = parseUptimes(ps.stdout)

        const now = await $.clock.now()
        const sessions: { id: string; title: string; cwd: string }[] = []
        for (const f of await $.fs.list(dir).catch(() => [])) {
          if (!f.name.endsWith('.json') || now - f.mtimeMs > FRESH_MS) continue
          try {
            sessions.push(JSON.parse(await $.fs.read(`${dir}/${f.name}`)))
          } catch {}
        }
        const owner = (path: string) =>
          sessions
            .filter(s => path === s.cwd || path.startsWith(`${s.cwd}/`))
            .sort((a, b) => b.cwd.length - a.cwd.length)[0]?.title

        const list: Server[] = found
          .map(f => ({ ...f, cwd: cwdOf.get(f.pid) ?? '/' }))
          // System daemons run from "/"; a dev server runs from its project.
          .filter(f => f.cwd !== '/')
          .map(f => ({
            pid: f.pid,
            cmd: psOf.get(f.pid)?.command ?? f.cmd,
            port: f.port,
            scope: f.scope,
            cwd: tilde(f.cwd, home),
            up: psOf.get(f.pid)?.up ?? '',
            session: owner(f.cwd),
          }))
          .sort((a, b) => a.port - b.port)

        await update($, servers, () => list)
      } catch {
        // A failed poll keeps the last list; the next tick tries again.
      } finally {
        busy = false
      }
    }

    await update($, isExpanded, () => true)
    void scan()
    $.clock.every(POLL_MS, () => void scan())

    return next(e)
  })

  on('command.run', { command: 'localhost-servers' }, async $ => {
    const was = await read($, isExpanded)
    await update($, isExpanded, () => !was)

    return { text: was ? 'Localhost servers band collapsed.' : 'Localhost servers band expanded.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const [list, open] = [await read($, servers), await read($, isExpanded)]
    const summary = list.length === 0 ? 'no servers listening' : `${list.length} listening`

    const toggle = (
      <Button
        key="toggle"
        label={open ? '▾ Collapse' : '▸ Expand  '}
        onPress={() => update($, isExpanded, () => !open)}
      />
    )

    if (!open) {
      return (
        <Box gap={2}>
          {toggle}
          <Text bold>SERVERS</Text>
          <Text dimColor>{summary}</Text>
          <Text color="#7dff9a">{list.map(s => `:${s.port}`).join(' ')}</Text>
        </Box>
      )
    }

    const sessions = [...new Set(list.map(s => s.session ?? ''))].sort()

    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={2}>
          {toggle}
          <Text bold>SERVERS</Text>
          <Text dimColor>{summary}</Text>
        </Box>
        <Box flexDirection="column" gap={4}>
        {sessions.map(id => {
          const group = list.filter(s => (s.session ?? '') === id)
          return (
            <Box key={id} flexDirection="column">
              <Box paddingBottom={2}>
              <Text bold color="#5fe3ff">
                {`Session | ${id === '' ? 'none' : id} | ${shortPath(group[0]?.cwd ?? '')}`}
              </Text>
              </Box>
              <Box paddingBottom={1}>
                {COLS.map(c => (
                  <Box key={c.name} width={c.width} flexShrink={0}>
                    <Text dimColor bold>{c.name}</Text>
                  </Box>
                ))}
                <Text dimColor bold>ACTION</Text>
              </Box>
              <Box flexDirection="column" gap={1}>
              {group.map(s => (
                <Box key={`${s.pid}:${s.port}`} alignItems="center" hover={{ backgroundColor: '#2b3140' }}>
                  <Box width={COLS[0]!.width} flexShrink={0}>
                    <Text bold color={s.scope === 'local' ? '#7dff9a' : '#ffe066'}>{`:${s.port}`}</Text>
                  </Box>
                  <Box width={COLS[1]!.width} flexShrink={0}>
                    <Text>{clip(label(s.cmd), COLS[1]!.width - 1)}</Text>
                  </Box>
                  <Box width={COLS[2]!.width} flexShrink={0}>
                    <Text>{String(s.pid)}</Text>
                  </Box>
                  <Box width={COLS[3]!.width} flexShrink={0}>
                    <Text>{s.up}</Text>
                  </Box>
                  <Box gap={1}>
                    <Button key={`stop:${s.pid}`} label="STOP" onPress={() => signal($, s, 'TERM')} />
                    <Button key={`kill:${s.pid}`} label="TERMINATE" onPress={() => signal($, s, 'KILL')} />
                  </Box>
                </Box>
              ))}
              </Box>
            </Box>
          )
        })}
        </Box>
      </Box>
    )
  })
}
