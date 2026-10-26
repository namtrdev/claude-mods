export type TurnUse = { input: number; output: number; read: number; write: number }
export type CacheTtl = '5m' | '1h'

declare module 'claude-code' {
  interface PluginState {
    'cost-meter': { last: TurnUse | null; total: TurnUse; ttl: CacheTtl; lastAt: number }
  }
}
