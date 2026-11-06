export type Loaded = { path: string; kind: string; chars: number; parent?: string }

declare module 'claude-code' {
  interface PluginState {
    'context-files': { files: Loaded[]; nested: Loaded[]; isExpanded: boolean }
  }
}
