export type GuardCount = number

declare module 'claude-code' {
  interface PluginState {
    'secret-guard': { isOn: boolean; masked: GuardCount }
  }
}
