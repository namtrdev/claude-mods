export type Snap = { path: string; original: string | null }
export type Turn = { no: number; at: number; prompt: string; snaps: Snap[] }

declare module 'claude-code' {
  interface PluginState {
    'turn-checkpoint': { turns: Turn[] }
  }
}
