export type Step = { id: string; at: number; tool: string; summary: string; isError: boolean }

declare module 'claude-code' {
  interface PluginState {
    'replay-theater': { steps: Step[]; cursor: number; isPlaying: boolean }
  }
}
