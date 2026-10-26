# Turn Checkpoint

Saves the original of every file a turn edits before it is changed. Use /undo-turn to restore the files from the last turn that changed any, and /checkpoints to list those turns.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install turn-checkpoint@jackie-mods
```

## Use

Commands: /undo-turn, /checkpoints.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Turns to keep** (`maxTurns`, default `20`): How many recent turns keep their saved file originals.
- **Storage limit (MB)** (`maxMegabytes`, default `2`): Oldest turns are dropped once the saved originals pass this size.

## License

MIT, Copyright (c) 2026 Jackie.
