# Claude Code mods by Jackie

Ten mods for Claude Code: privacy and safety guards, a replay pane, usage, context and localhost-server bands.

| Mod | What it does |
|---|---|
| `blast-radius` | A pane that shows how far this session's changes reach: the files edited, the directories touched, risky shell commands (recursive deletes, force pushes, remote scripts) and a running LOW, MEDIUM or HIGH score. |
| `replay-theater` | A pane that records every tool call in the session with a timestamp and a pass or fail mark, then replays them step by step or on a timer with back, play, next, rewind and clear controls. |
| `context-files` | A band above the prompt that lists the CLAUDE. |
| `hide-sensitive` | Masks API keys, tokens, passwords, card numbers, emails and phone numbers in your messages before they reach the model, and in replies on screen, with boxes you click to copy the original. |
| `secret-guard` | Masks secrets in tool results, refuses to write keys into source files and blocks git commits whose staged changes contain secrets. |
| `reply-modes` | A row of buttons above the prompt that switches reply modes: short, detail, ask-me and critique. |
| `danger-guard` | Asks for confirmation before destructive commands such as recursive deletes, force pushes, hard resets, sudo and DROP TABLE, refuses catastrophic ones outright, and asks before writes to sensitive paths like ~/. |
| `turn-checkpoint` | Saves the original of every file a turn edits before it is changed. |
| `cost-meter` | A band above the prompt that shows token usage for the last turn and the whole session, including the prompt-cache hit ratio. |
| `localhost-servers` | A band above the prompt that lists the localhost servers listening now, grouped by the Claude Code session that owns them, with STOP (SIGTERM) and TERMINATE (SIGKILL) buttons on every row. |

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install <mod>@jackie-mods
```

Each mod folder also has its own README. Icons are from Lucide (ISC), see THIRD_PARTY_NOTICES.md.

## License

MIT, Copyright (c) 2026 Jackie.
