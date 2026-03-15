---
name: prepare-task
description: Build context for a task, then produce an implementation plan
---

## context-builder
output: context.md

Gather the relevant context, constraints, files, and implementation considerations for this task:

{task}

Focus on producing concise but actionable context for planning.

## planner
reads: context.md
output: plan.md
progress: true

Using the gathered context and the original request below, create a clear implementation plan.

Original task:
{task}

Gathered context:
{previous}

Return a step-by-step plan with any risks, assumptions, and validation steps.
