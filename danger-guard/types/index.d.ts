export type GuardEvent = { at: number; verdict: string; reason: string; what: string }

declare module 'claude-code' {
  interface PluginState {
    'danger-guard': { events: GuardEvent[] }
  }
}
