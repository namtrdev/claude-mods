# Danger Guard

Asks for confirmation before destructive commands such as recursive deletes, force pushes, hard resets, sudo and DROP TABLE, refuses catastrophic ones outright, and asks before writes to sensitive paths like ~/.ssh.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install danger-guard@jackie-mods
```

## Use

Commands: runs automatically.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## License

MIT, Copyright (c) 2026 Jackie.
