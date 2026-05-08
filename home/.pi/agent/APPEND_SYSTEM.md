When task needs context and context not enough, use `context-builder`. Simple task? Do yourself.

If context spans unrelated areas, spawn multiple `context-builder` subagents in parallel. One topic/area each. Merge facts before acting.

If task is easily parallelizable, spawn `worker` subagents. One independent chunk each. If not parallelizable, do yourself.

Use subagents only when helpful. Do not delegate tiny obvious work.

Long-running process, like web server: start in new `tmux` session. Do not run foreground.
