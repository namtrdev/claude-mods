# Cost Meter

A band above the prompt that shows token usage for the last turn and the whole session, including the prompt-cache hit ratio.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install cost-meter@jackie-mods
```

## Use

Commands: shows after the first reply.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Default cache TTL** (`defaultTtl`, default `5m`): Which prompt-cache lifetime the countdown assumes until you press a TTL button.
- **Show the cache countdown** (`showCacheClock`, default `true`): Show the second row with the cache clock and the TTL buttons.

## License

MIT, Copyright (c) 2026 Jackie.

Icons: Lucide (ISC). See THIRD_PARTY_NOTICES.md.
