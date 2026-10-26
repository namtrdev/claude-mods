export type ModeName = 'off' | 'short' | 'detail' | 'ask-me' | 'critique'

declare module 'claude-code' {
  interface PluginState {
    'reply-modes': { mode: ModeName }
  }
}
