export type Touch = { path: string; tool: string; count: number }
export type Risky = { command: string; reason: string; weight: number }

declare module 'claude-code' {
  interface PluginState {
    'blast-radius': { touched: Touch[]; risky: Risky[]; commands: number }
  }
}
