export type TurnUse = { input: number; output: number; read: number; write: number }
export type CacheTtl = '5m' | '1h'

declare module 'claude-code' {
  interface PluginState {
    'prompt-cache-meter': { last: TurnUse | null; prev: TurnUse | null; total: TurnUse; ttl: CacheTtl; lastAt: number }
  }
}
