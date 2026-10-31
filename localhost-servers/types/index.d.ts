export type Server = {
  pid: number
  cmd: string
  port: number
  scope: 'local' | 'all'
  cwd: string
  up: string
  session?: string
}

declare module 'claude-code' {
  interface PluginState {
    'localhost-servers': { servers: Server[]; isExpanded: boolean }
  }
}
