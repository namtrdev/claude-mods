export type MaskCount = number

declare module 'claude-code' {
  interface PluginState {
    'hide-sensitive': { isOn: boolean; masked: MaskCount }
  }
}
