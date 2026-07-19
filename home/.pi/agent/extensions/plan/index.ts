import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const PLAN_SYSTEM_PROMPT = `Plan mode active.

Task: create a plan for the instruction. No implementation.

Plan mode stays active until explicitly approved with /ok or cancelled with /abort.
Treat every following instruction as a request to refine the current plan.

Rules:
- No edit/write tool.
- No code/config change.
- Use other tools if needed.
- Need info? Ask human. Do not guess risky thing.`;

const IMPLEMENT_PROMPT = "Plan looks good, start implementation.";
const AUTO_SESSION_NAME_FIRST_INPUT_EVENT = "auto-session-name:first-input";
const PLAN_STATUS_KEY = "plan-mode";

function buildPlanPrompt(instruction: string): string {
  return `${PLAN_SYSTEM_PROMPT}\n\nInstruction:\n${instruction}`;
}

function buildImplementPrompt(additionalContext?: string): string {
  const context = additionalContext?.trim();
  if (!context) return IMPLEMENT_PROMPT;
  return `${IMPLEMENT_PROMPT} ${context}`;
}

function buildPlanRefinementPrompt(instruction: string): string {
  return `Plan mode still active.\n\nInstruction:\n${instruction.trim()}`;
}

type FlowState = "idle" | "planning";

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

  function updateStatus(ctx: ExtensionContext) {
    const status = planModeActive()
      ? ctx.ui.theme.fg("warning", "⏸ plan")
      : undefined;
    ctx.ui.setStatus(PLAN_STATUS_KEY, status);
  }

  function enterPlanMode(ctx: ExtensionContext) {
    if (!planModeActive()) {
      previousTools = pi.getActiveTools();
    }

    flowState = "planning";
    pi.setActiveTools(planTools());
    updateStatus(ctx);
  }

  function exitPlanMode(ctx: ExtensionContext) {
    if (previousTools) {
      pi.setActiveTools(previousTools);
      previousTools = undefined;
    }
    flowState = "idle";
    updateStatus(ctx);
  }

  pi.registerCommand("plan", {
    description: "Start persistent plan mode for an instruction; finish with /ok or /abort",
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

      enterPlanMode(ctx);
      ctx.ui.notify("Plan mode. All tools enabled except edit/write.", "info");
      pi.events.emit(AUTO_SESSION_NAME_FIRST_INPUT_EVENT, { text: instruction });

      pi.sendUserMessage(buildPlanPrompt(instruction));
    },
  });

  pi.registerCommand("ok", {
    description: "Approve the active plan and implement it, optionally with additional context",
    handler: async (args, ctx) => {
      if (!planModeActive()) {
        ctx.ui.notify("No active plan. Start one with /plan <instruction>.", "warning");
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent busy. Run /ok after the current planning turn finishes.", "warning");
        return;
      }

      exitPlanMode(ctx);
      ctx.ui.notify("Plan approved. Tools restored; implementing.", "info");
      pi.sendUserMessage(buildImplementPrompt(args));
    },
  });

  pi.registerCommand("abort", {
    description: "Exit plan mode without sending anything to the agent",
    handler: async (_args, ctx) => {
      if (!planModeActive()) {
        ctx.ui.notify("No active plan. Start one with /plan <instruction>.", "warning");
        return;
      }

      exitPlanMode(ctx);
      ctx.ui.notify("Plan mode aborted. Tools restored.", "info");
    },
  });

  pi.on("input", async (event) => {
    if (!planModeActive() || event.source === "extension") return;

    return {
      action: "transform" as const,
      text: buildPlanRefinementPrompt(event.text),
      images: event.images,
    };
  });

  pi.on("before_agent_start", async () => {
    if (!planModeActive()) return;

    // Tool list can change after reload/dynamic tools. Keep edit/write disabled for every planning/refinement turn.
    pi.setActiveTools(planTools());
  });

  pi.on("tool_call", async (event) => {
    if (!planModeActive() || (event.toolName !== "edit" && event.toolName !== "write")) return;

    return {
      block: true,
      reason: `Plan mode blocks ${event.toolName} tool. Make plan, not patch.`,
    };
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (flowState !== "planning" || !ctx.hasUI) return;

    ctx.ui.notify("Plan mode active. Send refinements, run /ok <optional comment>, or run /abort.", "info");
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    exitPlanMode(ctx);
  });
}
