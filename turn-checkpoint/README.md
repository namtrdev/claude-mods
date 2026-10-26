# Turn Checkpoint

Saves the original of every file a turn edits before it is changed. Use /undo-turn to restore the files from the last turn that changed any, and /checkpoints to list those turns.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install turn-checkpoint@my-mods
```

## Use

Commands: /undo-turn, /checkpoints.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## License

MIT, Copyright (c) 2026 Jackie.
