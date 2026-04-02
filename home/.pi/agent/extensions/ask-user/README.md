# ask-user

Project-local Pi extension that adds an `ask_user` tool.

## What it does

The tool asks the user either:
- one question, or
- a series of questions in one UI flow

Each question has:
- a predefined list of answers
- an always-available `Custom answer…` option
- keyboard-only navigation

## Keys

### While answering a question
- `↑` / `↓` — move selection
- `j` / `k` — vim-style move selection
- `←` / `→` — switch questions
- `h` / `l` — vim-style switch questions
- `Enter` — select / submit
- `Esc` — when typing custom answer, go back to the choices

### Review screen
- `↑` / `↓` or `j` / `k` — move between answers / submit
- `Enter` — edit selected answer or submit all answers

## Tool API

### Single question

```ts
ask_user({
  question: "Which environment should I use?",
  answers: ["dev", "staging", "prod"]
})
```

Return value:
- plain text string, e.g. `dev`

### Multiple questions

```ts
ask_user({
  questions: [
    { question: "Environment?", answers: ["dev", "staging", "prod"] },
    { question: "Run tests?", answers: ["yes", "no"] },
    { question: "Deploy after?", answers: ["yes", "no"] }
  ]
})
```

Return value:
- JSON array string in the same order, e.g. `[
  "dev",
  "yes",
  "no"
]`

## Notes

- Requires interactive Pi UI mode.
- In non-interactive mode it errors.
- Extension path in this dotfiles repo:
  - `home/.pi/agent/extensions/ask-user/index.ts`

If Pi is already running, use `/reload` to pick it up.
