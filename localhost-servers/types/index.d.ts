export type Server = {
  pid: number
  cmd: string
  port: number
  scope: 'local' | 'all'
  cwd: string
  up: string
  cpu: number
  mem: number
  session?: string
}

export type Sys = { cpu: number; ramUsed: number; ramTotal: number; gpu: number | null }

declare module 'claude-code' {
  interface PluginState {
    'localhost-servers': { servers: Server[]; sys: Sys; isExpanded: boolean }
  }
}
