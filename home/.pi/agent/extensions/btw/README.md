# btw

Adds a `/btw` command for side questions.

## What it does

- asks a one-off side question
- includes a best-effort snapshot of the current session branch
- includes recent live primary-agent activity while the agent is busy
- gets a short answer from the model
- does not use tools
- does not write to session history
- does not pause, steer, or affect the main agent flow

## Usage

```text
/btw what does TCP slow start do?
/btw what's the progress?
```

Or run `/btw` and type the question when prompted.

## Notes

- Uses the currently selected model.
- Works while the main agent is busy.
- Progress answers are based on a snapshot of saved session entries plus recent extension events.
- Very recent streaming tokens/tool updates may be missing until pi emits the corresponding event.
- Result is shown in a temporary UI panel and then forgotten.
