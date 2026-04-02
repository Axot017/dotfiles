# ask-user

Project-local Pi extension that adds an `ask_user` tool.

## What it does

The tool asks the user a question with:
- a predefined list of answers
- an always-available `Custom answer…` option
- keyboard-only navigation

## Keys

- `↑` / `↓` — move selection
- `j` / `k` — vim-style move selection
- `Enter` — select / submit
- `Esc` — when typing custom answer, go back to the choices

## Tool API

```ts
ask_user({
  question: "Which environment should I use?",
  answers: ["dev", "staging", "prod"]
})
```

Returns plain text only, e.g.:
- `dev`
- `prod`
- `something else`

## Notes

- Requires interactive Pi UI mode.
- In non-interactive mode it errors.
- Project-local extension path:
  - `.pi/extensions/ask-user/index.ts`

If Pi is already running, use `/reload` to pick it up.
