# Simple subagents extension

Defines one agent tool: `spawn_subagents`.

Subagents are Markdown files in:

- `~/.pi/subagents`
- `{project}/.pi/subagents`

If both define the same `name`, the project file wins.

Example:

```md
---
name: researcher
description: Research current docs and summarize with sources
reasoning: high
tools: read, websearch, webfetch
---

You are a focused research subagent. Use web sources when needed and return a concise brief.
```

Tool syntax:

```md
# Pi default tools
tools:

# Explicit allowlist
tools: read, grep, find, ls, bash, websearch

# Default builtin tools, plus explicit custom tools, minus selected tools
tools: *, websearch, webfetch, !edit, !write
```

Only `reasoning` and `tools` are supported. Subagents always use Pi's default model.
