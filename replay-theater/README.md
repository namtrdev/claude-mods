# Replay Theater

A pane that records every tool call in the session with a timestamp and a pass or fail mark, then replays them step by step or on a timer with back, play, next, rewind and clear controls.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install replay-theater@jackie-mods
```

## Use

Commands: /replay.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Open the pane at start** (`openPaneAtStart`, default `true`): Open the Replay Theater pane when a session begins; off opens it only with /replay.
- **Playback speed (ms per step)** (`playSpeedMs`, default `800`): Delay between steps while playing. Lower is faster.
- **Steps to keep** (`maxSteps`, default `500`): How many recent tool calls the recording holds.

## License

MIT, Copyright (c) 2026 Jackie.

Icons: Lucide (ISC). See THIRD_PARTY_NOTICES.md.
