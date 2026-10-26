# Secret Guard

Masks secrets in tool results, refuses to write keys into source files and blocks git commits whose staged changes contain secrets. Files named .env are allowed.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install secret-guard@my-mods
```

## Use

Commands: /secret-guard.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## License

MIT, Copyright (c) 2026 Jackie.
