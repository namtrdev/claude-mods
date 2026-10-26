# Reply Modes

A row of buttons above the prompt that switches reply modes: short, detail, ask-me and critique. The active mode adds a one-line instruction to each message you send.

## Install

```
/plugin marketplace add namtrdev/claude-mods
/plugin install reply-modes@jackie-mods
```

## Use

Commands: /short, /detail, /ask-me, /critique, /mode-off.

Built for Claude Code mods (hook modules). Nothing here runs outside your machine: the mod reads session events and draws its own interface.

## Options

You set these when you install the mod, and can change them later in the Claude Code config menu.

- **Short: instruction** (`shortNote`, default `Trả lời tối đa 3 câu.`): The line added to your message in Short mode.
- **Detail: instruction** (`detailNote`, default `Trả lời đầy đủ, có lập luận và ví dụ.`): The line added to your message in Detail mode.
- **Ask me: instruction** (`askMeNote`, default `Dùng coaching: đặt câu hỏi giúp tôi tự làm rõ vấn đề, chưa đưa đáp án ngay.`): The line added to your message in Ask me mode.
- **Critique: instruction** (`critiqueNote`, default `Chỉ nêu rủi ro, điểm yếu và phương án thay thế.`): The line added to your message in Critique mode.

## License

MIT, Copyright (c) 2026 Jackie.

Icons: Lucide (ISC). See THIRD_PARTY_NOTICES.md.
