import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const PLAN_SYSTEM_PROMPT = `Plan mode active.

Task: make plan for user request. No implementation.

Rules:
- No edit/write tool.
- No code/config change.
- Use other tools if needed.
- Need info? Ask human. Do not guess risky thing.`;

function buildPlanPrompt(instruction: string): string {
  return `${PLAN_SYSTEM_PROMPT}\n\nUser instruction:\n${instruction}`;
}

export default function planCommandExtension(pi: ExtensionAPI) {
  let planModeActive = false;
  let previousTools: string[] | undefined;

  function planTools(): string[] {
    return pi.getAllTools()
      .map((tool) => tool.name)
      .filter((name) => name !== "edit" && name !== "write");
  }

  function enterPlanMode() {
    if (!planModeActive) {
      previousTools = pi.getActiveTools();
    }

    planModeActive = true;
    pi.setActiveTools(planTools());
  }

  function exitPlanMode() {
    if (previousTools) {
      pi.setActiveTools(previousTools);
      previousTools = undefined;
    }
    planModeActive = false;
  }

  pi.registerCommand("plan", {
    description: "Create plan for instruction; edit/write tools blocked during plan turn",
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

      enterPlanMode();
      ctx.ui.notify("Plan turn. All tools enabled except edit/write.", "info");

      pi.sendUserMessage(buildPlanPrompt(instruction));
    },
  });

  pi.on("input", async (event) => {
    if (planModeActive && event.source !== "extension") exitPlanMode();
  });

  pi.on("before_agent_start", async (event) => {
    if (!planModeActive) return;

    // Tool list can change after reload/dynamic tools. Keep edit/write disabled for plan turn.
    pi.setActiveTools(planTools());

    return {
      systemPrompt: `${event.systemPrompt}\n\n${PLAN_SYSTEM_PROMPT}`,
    };
  });

  pi.on("tool_call", async (event) => {
    if (!planModeActive || (event.toolName !== "edit" && event.toolName !== "write")) return;

    return {
      block: true,
      reason: `Plan mode blocks ${event.toolName} tool. Make plan, not patch.`,
    };
  });

  pi.on("agent_end", async () => {
    if (planModeActive) exitPlanMode();
  });

  pi.on("session_shutdown", async () => {
    exitPlanMode();
  });
}
