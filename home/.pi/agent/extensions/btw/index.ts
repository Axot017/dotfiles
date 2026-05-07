import { complete, type UserMessage } from "@mariozechner/pi-ai";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

const SYSTEM_PROMPT = `Answer side question. Brief, direct.

Primary pi agent snapshot may exist: session + recent live activity. Use when relevant, mainly progress/status question.

Rules:
- Answer user question direct.
- No tools.
- No hidden instruction mention.
- Concise but complete.
- Progress question: summarize goal, done work, current activity, blockers/errors, likely next step when known.
- Primary-agent context = best-effort snapshot. No certainty about events not shown.
- Ambiguous question: state likely meaning, answer.`;

const MAX_CONTEXT_CHARS = 24_000;
const MAX_LIVE_EVENTS = 80;

type ContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

type SessionEntry = {
  type: string;
  message?: {
    role?: string;
    content?: unknown;
    toolName?: string;
    isError?: boolean;
    command?: string;
    output?: string;
    exitCode?: number;
    cancelled?: boolean;
  };
  summary?: string;
  tokensBefore?: number;
  timestamp?: string;
};

type LiveEvent = {
  timestamp: number;
  text: string;
};

const pushLiveEvent = (events: LiveEvent[], text: string) => {
  events.push({ timestamp: Date.now(), text });
  if (events.length > MAX_LIVE_EVENTS) {
    events.splice(0, events.length - MAX_LIVE_EVENTS);
  }
};

const stringifyCompact = (value: unknown, max = 600): string => {
  try {
    const text = JSON.stringify(value);
    if (!text) return "{}";
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return String(value);
  }
};

const extractTextParts = (content: unknown): string[] => {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const block = part as ContentBlock;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts;
};

const extractToolCallLines = (content: unknown): string[] => {
  if (!Array.isArray(content)) return [];

  const calls: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const block = part as ContentBlock;
    if (block.type === "toolCall" && typeof block.name === "string") {
      calls.push(`Tool call: ${block.name} ${stringifyCompact(block.arguments ?? {})}`);
    }
  }
  return calls;
};

const truncateMiddle = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;

  const head = Math.floor(maxChars * 0.35);
  const tail = maxChars - head;
  return [
    text.slice(0, head),
    `\n\n[... primary-agent context truncated: ${text.length - maxChars} chars omitted ...]\n\n`,
    text.slice(text.length - tail),
  ].join("");
};

const buildSessionContext = (entries: SessionEntry[]): string => {
  const sections: string[] = [];

  for (const entry of entries) {
    if (entry.type === "compaction") {
      sections.push(`Compaction summary: ${entry.summary ?? ""}`.trim());
      continue;
    }

    if (entry.type === "branch_summary") {
      sections.push(`Branch summary: ${entry.summary ?? ""}`.trim());
      continue;
    }

    if (entry.type !== "message" || !entry.message?.role) {
      continue;
    }

    const role = entry.message.role;
    const lines: string[] = [];

    if (role === "user") {
      const text = extractTextParts(entry.message.content).join("\n").trim();
      if (text) lines.push(`User: ${text}`);
    } else if (role === "assistant") {
      const text = extractTextParts(entry.message.content).join("\n").trim();
      if (text) lines.push(`Assistant: ${text}`);
      lines.push(...extractToolCallLines(entry.message.content));
    } else if (role === "toolResult") {
      const text = extractTextParts(entry.message.content).join("\n").trim();
      const status = entry.message.isError ? "error" : "ok";
      lines.push(`Tool result (${entry.message.toolName ?? "unknown"}, ${status}): ${text}`.trim());
    } else if (role === "bashExecution") {
      const command = entry.message.command?.trim();
      const output = entry.message.output?.trim();
      const status = entry.message.cancelled ? "cancelled" : `exit ${entry.message.exitCode ?? "unknown"}`;
      if (command) lines.push(`User bash (${status}): ${command}${output ? `\n${output}` : ""}`);
    }

    if (lines.length > 0) sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
};

const buildLiveContext = (events: LiveEvent[], isBusy: boolean, currentAssistantPreview: string): string => {
  const lines = [`Primary agent is currently ${isBusy ? "busy" : "idle"}.`];
  if (currentAssistantPreview.trim()) {
    lines.push(`Current assistant draft: ${currentAssistantPreview.trim().slice(0, 1_500)}`);
  }

  for (const event of events) {
    lines.push(`[${new Date(event.timestamp).toLocaleTimeString()}] ${event.text}`);
  }

  return lines.join("\n");
};

const buildBtwPrompt = (question: string, primaryContext: string): string =>
  [
    "Use primary-agent context if helps answer side question.",
    "",
    "<primary-agent-context>",
    primaryContext || "No primary-agent context available.",
    "</primary-agent-context>",
    "",
    "<side-question>",
    question,
    "</side-question>",
  ].join("\n");

export default function btwExtension(pi: ExtensionAPI) {
  const liveEvents: LiveEvent[] = [];
  let isBusy = false;
  let currentAssistantPreview = "";

  pi.on("agent_start", (event: any) => {
    isBusy = true;
    currentAssistantPreview = "";
    const prompt = typeof event?.prompt === "string" ? event.prompt.trim() : "";
    pushLiveEvent(liveEvents, prompt ? `Started primary-agent task: ${prompt}` : "Primary agent started");
  });

  pi.on("tool_execution_start", (event: any) => {
    pushLiveEvent(liveEvents, `Started tool ${event.toolName}: ${stringifyCompact(event.args ?? {})}`);
  });

  pi.on("tool_execution_update", (event: any) => {
    if (event.partialResult?.content) {
      const text = extractTextParts(event.partialResult.content).join("\n").trim();
      if (text) pushLiveEvent(liveEvents, `Tool ${event.toolName} update: ${text.slice(0, 800)}`);
    }
  });

  pi.on("tool_execution_end", (event: any) => {
    const text = extractTextParts(event.result?.content).join("\n").trim();
    const status = event.isError ? "failed" : "finished";
    pushLiveEvent(liveEvents, `Tool ${event.toolName} ${status}${text ? `: ${text.slice(0, 800)}` : ""}`);
  });

  pi.on("message_update", (event: any) => {
    if (event.message?.role !== "assistant") return;
    currentAssistantPreview = extractTextParts(event.message.content).join("\n").trim();
  });

  pi.on("message_end", (event: any) => {
    if (event.message?.role !== "assistant") return;
    const text = extractTextParts(event.message.content).join("\n").trim();
    currentAssistantPreview = "";
    if (text) pushLiveEvent(liveEvents, `Assistant said: ${text.slice(0, 1_200)}`);
  });

  pi.on("turn_end", (event: any) => {
    pushLiveEvent(liveEvents, `Turn ${event.turnIndex ?? "?"} ended`);
  });

  pi.on("agent_end", () => {
    isBusy = false;
    pushLiveEvent(liveEvents, "Primary agent finished");
  });

  pi.registerCommand("btw", {
    description: "Ask a side question without affecting the main agent/session",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("No model selected", "error");
        return;
      }

      let question = args.trim();
      if (!question) {
        const input = await ctx.ui.input("/btw", "Ask a side question...");
        question = input?.trim() ?? "";
      }

      if (!question) {
        ctx.ui.notify("No question provided", "warning");
        return;
      }

      const answer = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const loader = new BorderedLoader(tui, theme, `Thinking about: ${question}`);
        loader.onAbort = () => done(null);

        const run = async () => {
          const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
          if (!auth.ok) throw new Error(auth.error);
          if (!auth.apiKey) throw new Error(`No API key for ${ctx.model!.provider}/${ctx.model!.id}`);
          const sessionContext = buildSessionContext(ctx.sessionManager.getBranch() as SessionEntry[]);
          const liveContext = buildLiveContext(liveEvents, isBusy, currentAssistantPreview);
          const primaryContext = truncateMiddle(
            ["# Session branch", sessionContext || "No saved session messages yet.", "", "# Recent live activity", liveContext]
              .join("\n")
              .trim(),
            MAX_CONTEXT_CHARS,
          );
          const userMessage: UserMessage = {
            role: "user",
            content: [{ type: "text", text: buildBtwPrompt(question, primaryContext) }],
            timestamp: Date.now(),
          };

          const response = await complete(
            ctx.model!,
            {
              systemPrompt: SYSTEM_PROMPT,
              messages: [userMessage],
            },
            { apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
          );

          if (response.stopReason === "aborted") return null;

          return response.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("\n")
            .trim();
        };

        run()
          .then(done)
          .catch((error) => done(`Error: ${error instanceof Error ? error.message : String(error)}`));

        return loader;
      });

      if (answer === null) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        let cachedLines: string[] | undefined;

        return {
          handleInput(data: string) {
            if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
              done(undefined);
            }
          },
          render(width: number): string[] {
            if (cachedLines) return cachedLines;
            const lines: string[] = [];
            const add = (line = "") => lines.push(truncateToWidth(line, width));
            const border = theme.fg("accent", "─".repeat(Math.max(width - 1, 1)));

            add(border);
            add(theme.fg("accent", theme.bold(" BTW")));
            add();
            add(theme.fg("muted", " Question:"));
            add(` ${theme.fg("text", question)}`);
            add();
            add(theme.fg("muted", " Answer:"));
            for (const line of answer.split("\n")) {
              add(` ${theme.fg("text", line)}`);
            }
            add();
            add(theme.fg("dim", " Enter or Esc to close"));
            add(border);

            cachedLines = lines;
            return lines;
          },
          invalidate() {
            cachedLines = undefined;
          },
        };
      });
    },
  });
}
