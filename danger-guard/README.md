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

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Allow sudo without asking** (`allowSudo`, default `false`): Skip the confirmation for commands that use sudo.
- **Force push** (`forcePush`, default `ask`): What to do before git push --force.
- **Recursive delete (rm -rf)** (`recursiveDelete`, default `ask`): What to do before a recursive or forced rm outside the root and home cases, which are always refused.
- **Extra commands to confirm** (`extraCommands`, default `empty`): Regular expressions for commands you want to be asked about, comma separated. Example: terraform apply,docker system prune
- **Extra protected paths** (`extraPaths`, default `empty`): Regular expressions for file paths that need confirmation before a write, comma separated. Example: /prod/,\.pem$

## License

MIT, Copyright (c) 2026 Jackie.
