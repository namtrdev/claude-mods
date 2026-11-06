export type ModeName = 'off' | 'short' | 'detail' | 'ask-me' | 'critique' | 'fast'

declare module 'claude-code' {
  interface PluginState {
    'reply-modes': { mode: ModeName }
  }
}
