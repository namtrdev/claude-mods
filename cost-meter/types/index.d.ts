export type TurnUse = { input: number; output: number; read: number; write: number }

declare module 'claude-code' {
  interface PluginState {
    'cost-meter': { last: TurnUse | null; total: TurnUse }
  }
}
