# Context Files

A band above the prompt that lists the CLAUDE.md, memory and other instruction files the session loaded, grouped by tier with an estimated token count, in collapsed or expanded form.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install context-files@jackie-mods
```

## Use

Commands: /context-files.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Start expanded** (`startExpanded`, default `true`): Open the band with the full file list; off starts it collapsed to one line.

## License

MIT, Copyright (c) 2026 Jackie.

Icons: Lucide (ISC). See THIRD_PARTY_NOTICES.md.
