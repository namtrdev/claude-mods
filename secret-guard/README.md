# Secret Guard

Masks secrets in tool results, refuses to write keys into source files and blocks git commits whose staged changes contain secrets. Files named .env are allowed.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install secret-guard@jackie-mods
```

## Use

Commands: /secret-guard.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Mask secrets in tool results** (`maskResults`, default `true`): Hide secrets in what Read, Bash and other tools return to the model.
- **When a write would hold a secret** (`onWrite`, default `block`): block refuses the write; warn shows a notice and lets it through.
- **Check staged changes before git commit** (`guardCommits`, default `true`): Refuse git commit when the staged changes hold a secret.
- **Extra files allowed to hold secrets** (`extraAllowedFiles`, default `empty`): Regular expressions for file paths, comma separated. Files named .env are always allowed. Example: secrets\.yaml$,\.local\.json$

## License

MIT, Copyright (c) 2026 Jackie.
