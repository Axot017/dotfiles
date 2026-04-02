# btw

Adds a `/btw` command for side questions.

## What it does

- asks a one-off question
- gets a short answer from the model
- does not use tools
- does not write to session history
- does not affect the main agent flow

## Usage

```text
/btw what does TCP slow start do?
```

Or run `/btw` and type the question when prompted.

## Notes

- Uses the currently selected model.
- Works while the main agent is busy.
- Result is shown in a temporary UI panel and then forgotten.
