import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

const PLAN_SYSTEM_PROMPT = `Plan mode active.

Task: make plan for user request. No implementation.

Rules:
- No edit/write tool.
- No code/config change.
- Use other tools if needed.
- Need info? Ask human. Do not guess risky thing.`;

const IMPLEMENT_PROMPT = "Implement the plan above.";

function buildPlanPrompt(instruction: string): string {
  return `${PLAN_SYSTEM_PROMPT}\n\nUser instruction:\n${instruction}`;
}

function buildImplementPrompt(additionalContext?: string): string {
  const context = additionalContext?.trim();
  if (!context) return IMPLEMENT_PROMPT;
  return `${IMPLEMENT_PROMPT}\n\nAdditional context from user:\n${context}`;
}

function buildEditPlanPrompt(feedback: string): string {
  return `${PLAN_SYSTEM_PROMPT}\n\nRevise the plan above using this user feedback. Do not implement.\n\nUser feedback:\n${feedback.trim()}`;
}

type FlowState = "idle" | "planning" | "awaiting_decision";
type PlanDecisionAction = "ok" | "ok_with_context" | "edit_plan" | "stop";

interface PlanDecision {
  action: PlanDecisionAction;
  context?: string;
}

interface PlanOption {
  action: PlanDecisionAction;
  label: string;
  description: string;
  needsText?: boolean;
  textPrompt?: string;
}

async function askPlanDecision(ctx: ExtensionContext): Promise<PlanDecision> {
  const options: PlanOption[] = [
    {
      action: "ok",
      label: "ok",
      description: "unlock edit/write tools and implement the plan",
    },
    {
      action: "ok_with_context",
      label: "ok, with additional context",
      description: "unlock edit/write tools and implement with extra user context",
      needsText: true,
      textPrompt: "Additional context:",
    },
    {
      action: "edit_plan",
      label: "edit plan",
      description: "keep edit/write locked and ask agent to revise the plan",
      needsText: true,
      textPrompt: "Plan change request:",
    },
    {
      action: "stop",
      label: "stop",
      description: "leave plan flow and unlock tools",
    },
  ];

  return ctx.ui.custom<PlanDecision>((tui, theme, _kb, done) => {
    const editorTheme: EditorTheme = {
      borderColor: (s) => theme.fg("accent", s),
      selectList: {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      },
    };
    const editor = new Editor(tui, editorTheme);

    let selectedIndex = 0;
    let textMode = false;
    let cachedLines: string[] | undefined;

    const refresh = () => {
      cachedLines = undefined;
      tui.requestRender();
    };

    const selectedOption = () => options[selectedIndex]!;

    const submitOption = () => {
      const option = selectedOption();
      if (!option.needsText) {
        done({ action: option.action });
        return;
      }
      textMode = true;
      editor.setText("");
      refresh();
    };

    editor.onSubmit = (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        refresh();
        return;
      }
      done({ action: selectedOption().action, context: trimmed });
    };

    return {
      handleInput(data: string) {
        if (textMode) {
          if (matchesKey(data, Key.escape)) {
            textMode = false;
            editor.setText("");
            refresh();
            return;
          }
          editor.handleInput(data);
          refresh();
          return;
        }

        if (matchesKey(data, Key.escape)) {
          done({ action: "stop" });
          return;
        }
        if (matchesKey(data, Key.up) || data === "k") {
          if (selectedIndex > 0) selectedIndex -= 1;
          refresh();
          return;
        }
        if (matchesKey(data, Key.down) || data === "j") {
          if (selectedIndex < options.length - 1) selectedIndex += 1;
          refresh();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          submitOption();
        }
      },

      render(width: number): string[] {
        if (cachedLines) return cachedLines;

        const lines: string[] = [];
        const add = (line: string = "") => lines.push(truncateToWidth(line, width));
        const border = theme.fg("accent", "─".repeat(Math.max(width - 1, 1)));

        add(border);
        add(theme.fg("accent", theme.bold(" Plan ready")));
        add(theme.fg("muted", " Is this plan OK?"));
        add();

        for (let i = 0; i < options.length; i++) {
          const option = options[i]!;
          const isSelected = i === selectedIndex;
          const prefix = isSelected ? theme.fg("accent", "› ") : "  ";
          const label = isSelected ? theme.fg("accent", option.label) : theme.fg("text", option.label);
          add(`${prefix}${i + 1}. ${label}`);
          add(`   ${theme.fg("muted", option.description)}`);
        }

        if (textMode) {
          const option = selectedOption();
          add();
          add(theme.fg("muted", ` ${option.textPrompt ?? "Input:"}`));
          for (const line of editor.render(Math.max(width - 2, 10))) {
            add(` ${line}`);
          }
          add();
          add(theme.fg("dim", " Enter submit • Esc back • text must be non-empty"));
        } else {
          add();
          add(theme.fg("dim", " ↑↓ or j/k navigate • Enter select • Esc stop"));
        }

        add(border);
        cachedLines = lines;
        return lines;
      },

      invalidate() {
        cachedLines = undefined;
      },
    };
  });
}

export default function planCommandExtension(pi: ExtensionAPI) {
  let flowState: FlowState = "idle";
  let previousTools: string[] | undefined;

  function planModeActive(): boolean {
    return flowState !== "idle";
  }

  function planTools(): string[] {
    return pi.getAllTools()
      .map((tool) => tool.name)
      .filter((name) => name !== "edit" && name !== "write");
  }

  function enterPlanMode() {
    if (!planModeActive()) {
      previousTools = pi.getActiveTools();
    }

    flowState = "planning";
    pi.setActiveTools(planTools());
  }

  function exitPlanMode() {
    if (previousTools) {
      pi.setActiveTools(previousTools);
      previousTools = undefined;
    }
    flowState = "idle";
  }

  pi.registerCommand("plan", {
    description: "Create plan for instruction; approve, refine, or implement after planning",
    handler: async (args, ctx) => {
      const instruction = args.trim();

      if (!instruction) {
        ctx.ui.notify("Usage: /plan <instruction>", "warning");
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent busy. Run /plan after current turn finishes.", "warning");
        return;
      }

      if (planModeActive()) {
        ctx.ui.notify("Plan flow already active.", "warning");
        return;
      }

      enterPlanMode();
      ctx.ui.notify("Plan mode. All tools enabled except edit/write.", "info");

      pi.sendUserMessage(buildPlanPrompt(instruction));
    },
  });

  pi.on("input", async (event) => {
    if (!planModeActive() || event.source === "extension") return;
    if (flowState === "awaiting_decision") return;
    exitPlanMode();
  });

  pi.on("before_agent_start", async (event) => {
    if (!planModeActive()) return;

    // Tool list can change after reload/dynamic tools. Keep edit/write disabled for every planning/refinement turn.
    pi.setActiveTools(planTools());

    return {
      systemPrompt: `${event.systemPrompt}\n\n${PLAN_SYSTEM_PROMPT}`,
    };
  });

  pi.on("tool_call", async (event) => {
    if (!planModeActive() || (event.toolName !== "edit" && event.toolName !== "write")) return;

    return {
      block: true,
      reason: `Plan mode blocks ${event.toolName} tool. Make plan, not patch.`,
    };
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (flowState !== "planning") return;

    if (!ctx.hasUI) {
      exitPlanMode();
      ctx.ui.notify("Plan approval picker requires interactive UI. Plan mode ended.", "warning");
      return;
    }

    flowState = "awaiting_decision";
    const decision = await askPlanDecision(ctx);

    if (decision.action === "edit_plan") {
      flowState = "planning";
      pi.setActiveTools(planTools());
      pi.sendUserMessage(buildEditPlanPrompt(decision.context ?? ""));
      return;
    }

    if (decision.action === "ok") {
      exitPlanMode();
      pi.sendUserMessage(buildImplementPrompt());
      return;
    }

    if (decision.action === "ok_with_context") {
      exitPlanMode();
      pi.sendUserMessage(buildImplementPrompt(decision.context));
      return;
    }

    exitPlanMode();
    ctx.ui.notify("Plan flow stopped. Tools restored.", "info");
  });

  pi.on("session_shutdown", async () => {
    exitPlanMode();
  });
}
