# Hide Sensitive

Masks API keys, tokens, passwords, card numbers, emails and phone numbers in your messages before they reach the model, and in replies on screen, with boxes you click to copy the original.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install hide-sensitive@jackie-mods
```

## Use

Commands: /hide-sensitive.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Mask keys and passwords** (`maskKeys`, default `true`): Mask API keys, tokens, JWTs, private keys and password=... values.
- **Mask email addresses** (`maskEmail`, default `true`): Replace email addresses with a [hidden:email] box.
- **Mask phone numbers** (`maskPhone`, default `true`): Mask +country-code numbers and Vietnamese mobile numbers.
- **Mask card numbers** (`maskCard`, default `true`): Mask 13 to 19 digit numbers that pass the Luhn check.
- **Extra patterns** (`extraPatterns`, default `empty`): Your own regular expressions to mask, comma separated. Example: EMP-\d{6},ACME-[A-Z0-9]{8}

## License

MIT, Copyright (c) 2026 Jackie.

