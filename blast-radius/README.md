# Blast Radius

A pane that shows how far this session's changes reach: the files edited, the directories touched, risky shell commands (recursive deletes, force pushes, remote scripts) and a running LOW, MEDIUM or HIGH score.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install blast-radius@jackie-mods
```

## Use

Commands: /blast-radius.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Open the pane at start** (`openPaneAtStart`, default `true`): Open the Blast radius pane when a session begins; off opens it only with /blast-radius.
- **Notify from risk weight** (`toastFrom`, default `7`): Show a notice for a risky command at or above this weight (1 to 9). Lower notifies more often.
- **Extra risky commands** (`extraRiskyPatterns`, default `empty`): Regular expressions for commands to count as risky (weight 5), comma separated. Example: terraform apply,kubectl delete

## License

MIT, Copyright (c) 2026 Jackie.

Icons: Lucide (ISC). See THIRD_PARTY_NOTICES.md.
