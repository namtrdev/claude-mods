# Localhost Servers

A band above the prompt that lists the localhost servers listening now, grouped by the Claude Code session that owns them. Each row shows port, process, pid and uptime, with STOP (SIGTERM) and TERMINATE (SIGKILL) buttons.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install localhost-servers@jackie-mods
```

## Use

Commands: /localhost-servers (expand or collapse the band).

Every few seconds the mod lists listening TCP sockets with `lsof` and reads each process's working directory and uptime with `ps`. Daemons that run from `/` are left out. Each session running this mod writes a small heartbeat file under `~/.claude/localhost-servers/` with its name and working directory; a server is shown under the session whose working directory contains the server's. Servers that match no live session appear under "none", and a session that does not run the mod cannot be matched.

STOP and TERMINATE first check that the pid still runs the command that was listed, then send the signal. Nothing leaves your machine.

## License

MIT, Copyright (c) 2026 Jackie.
