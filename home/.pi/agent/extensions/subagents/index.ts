import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, wrapTextWithAnsi, type Component, type TUI } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

const TOOL_NAME = "spawn_subagents";
const MONITOR_WIDGET_KEY = "subagent-monitor";
const MAX_OUTPUT_BYTES = 200 * 1024;
const MAX_PREVIEW_CHARS = 16 * 1024;
const MAX_PARALLEL_TASKS = 8;
const UPDATE_THROTTLE_MS = 75;
const VALID_REASONING = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

const SubagentTaskSchema = Type.Object({
  agent: Type.String({ description: "Subagent name. Files live in ~/.pi/agent/subagents or .pi/subagents" }),
  input: Type.String({ description: "Full task for subagent. Send all needed context here" }),
});

const SpawnSubagentsParams = Type.Object({
  tasks: Type.Array(SubagentTaskSchema, {
    minItems: 1,
    maxItems: MAX_PARALLEL_TASKS,
    description: `One or more subagents (max ${MAX_PARALLEL_TASKS}). Run parallel. Wait for all. Return all results.`,
  }),
});

type SpawnSubagentsParamsType = {
  tasks: Array<{ agent: string; input: string }>;
};

type ToolMode =
  | { kind: "default" }
  | { kind: "include"; names: string[] }
  | { kind: "defaultPlus"; names: string[]; exclude: string[] };

interface SubagentDefinition {
  name: string;
  description?: string;
  reasoning?: string;
  tools: ToolMode;
  prompt: string;
  path: string;
  scope: "user" | "project";
}

interface ResolvedTools {
  toolNames?: string[];
  extensionPaths: string[];
}

interface ChildResult {
  agent: string;
  ok: boolean;
  output: string;
  exitCode?: number | null;
  error?: string;
  cancelled?: boolean;
}

type TaskStatus = "pending" | "running" | "success" | "failed" | "cancelled";

interface TaskProgress {
  index: number;
  agent: string;
  status: TaskStatus;
  preview: string;
  activeTools: Map<string, string>;
  startedAt?: number;
  finishedAt?: number;
  exitCode?: number | null;
  error?: string;
}

interface SpawnProgressDetails {
  running: boolean;
  total: number;
  successes: number;
  failures: number;
  cancelled: number;
  agents: Array<{
    agent: string;
    status: TaskStatus;
    ok?: boolean;
    preview?: string;
    activeTool?: string;
    elapsedSeconds?: number;
    error?: string;
    exitCode?: number | null;
  }>;
}

type ChildProgressEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string }
  | { type: "tool_end"; toolCallId: string; toolName: string; isError: boolean };

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitList(value: string) {
  const cleaned = stripQuotes(value.trim());
  if (!cleaned) return [];

  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    return cleaned
      .slice(1, -1)
      .split(",")
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }

  return cleaned
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function parseTools(value: string | undefined): ToolMode {
  if (value === undefined || value.trim() === "") return { kind: "default" };

  const items = splitList(value);
  if (items.length === 0) return { kind: "default" };

  const hasDefaultToken = items.some((item) => item === "*" || item.toLowerCase() === "default");
  if (hasDefaultToken) {
    const names: string[] = [];
    const exclude: string[] = [];
    for (const item of items) {
      if (item === "*" || item.toLowerCase() === "default") continue;
      const target = item.startsWith("!") ? item.slice(1) : item;
      if (!target.trim()) continue;
      if (item.startsWith("!")) exclude.push(target.trim());
      else names.push(target.trim());
    }
    return { kind: "defaultPlus", names, exclude };
  }

  return { kind: "include", names: items };
}

function parseSubagentFile(path: string, content: string, scope: "user" | "project"): SubagentDefinition {
  const normalized = content.replace(/^\uFEFF/, "");
  let frontmatter: Record<string, string> = {};
  let body = normalized;

  if (normalized.startsWith("---\n") || normalized.startsWith("---\r\n")) {
    const newline = normalized.startsWith("---\r\n") ? "\r\n" : "\n";
    const endMarker = `${newline}---${newline}`;
    const end = normalized.indexOf(endMarker, 3);
    if (end >= 0) {
      const rawFrontmatter = normalized.slice(3 + newline.length, end);
      body = normalized.slice(end + endMarker.length);
      frontmatter = Object.fromEntries(
        rawFrontmatter
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"))
          .map((line) => {
            const colon = line.indexOf(":");
            if (colon < 0) return [line, ""];
            return [line.slice(0, colon).trim(), stripQuotes(line.slice(colon + 1).trim())];
          }),
      );
    }
  }

  const name = (frontmatter.name || basename(path, extname(path))).trim();
  const prompt = body.trim();
  if (!name) throw new Error(`Subagent file ${path} has no name`);
  if (!prompt) throw new Error(`Subagent ${name} (${path}) has empty prompt body`);

  const reasoning = frontmatter.reasoning?.trim();
  if (reasoning && !VALID_REASONING.has(reasoning)) {
    throw new Error(`Subagent ${name} (${path}) has invalid reasoning '${reasoning}'`);
  }

  return {
    name,
    description: frontmatter.description?.trim() || undefined,
    reasoning,
    tools: parseTools(frontmatter.tools),
    prompt,
    path,
    scope,
  };
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = join(dir, entry.name);
      const isMarkdown = [".md", ".markdown"].includes(extname(entry.name).toLowerCase());
      if (entry.isDirectory()) return findMarkdownFiles(path);
      if (isMarkdown && (entry.isFile() || entry.isSymbolicLink())) return [path];
      return [];
    }));
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function loadSubagents(cwd: string, includeProject: boolean): Promise<Map<string, SubagentDefinition>> {
  const userDir = join(homedir(), ".pi", "agent", "subagents");
  const projectDir = resolve(cwd, ".pi", "subagents");
  const result = new Map<string, SubagentDefinition>();
  const sources: Array<readonly ["user" | "project", string]> = [["user", userDir]];
  if (includeProject) sources.push(["project", projectDir]);

  for (const [scope, dir] of sources) {
    for (const file of await findMarkdownFiles(dir)) {
      const definition = parseSubagentFile(file, await readFile(file, "utf8"), scope);
      result.set(definition.name, definition); // project pass runs last and wins conflicts.
    }
  }

  return result;
}

function describeTools(tools: ToolMode) {
  if (tools.kind === "default") return "default tools";
  if (tools.kind === "include") return tools.names.join(", ");
  const added = tools.names.length > 0 ? ` plus ${tools.names.join(", ")}` : "";
  const excluded = tools.exclude.length > 0 ? ` minus ${tools.exclude.join(", ")}` : "";
  return `default tools${added}${excluded}`;
}

function toolSourcePath(tool: ReturnType<ExtensionAPI["getAllTools"]>[number]) {
  const sourceInfo = tool.sourceInfo;
  if (!sourceInfo || sourceInfo.source === "builtin" || sourceInfo.source === "sdk") return undefined;
  const sourcePath = sourceInfo.path;
  if (!sourcePath || sourcePath.startsWith("<")) return undefined;
  return sourcePath;
}

function resolveExtensionPath(sourcePath: string) {
  if (!existsSync(sourcePath)) return sourcePath;
  const stat = statSync(sourcePath);
  if (stat.isDirectory()) return sourcePath;
  if (basename(sourcePath) === "index.ts" || basename(sourcePath) === "index.js") return dirname(sourcePath);
  return sourcePath;
}

function resolveTools(definition: SubagentDefinition, pi: ExtensionAPI): ResolvedTools {
  if (definition.tools.kind === "default") return { extensionPaths: [] };

  const allTools = pi.getAllTools();
  const byName = new Map(allTools.map((tool) => [tool.name, tool]));
  const unknown = (names: string[]) => names.filter((name) => !byName.has(name));

  let toolNames: string[];
  if (definition.tools.kind === "include") {
    const missing = unknown(definition.tools.names);
    if (missing.length > 0) throw new Error(`Subagent ${definition.name} references unknown tool(s): ${missing.join(", ")}`);
    toolNames = definition.tools.names;
  } else {
    const referenced = [...definition.tools.names, ...definition.tools.exclude];
    const missing = unknown(referenced);
    if (missing.length > 0) throw new Error(`Subagent ${definition.name} references unknown tool(s): ${missing.join(", ")}`);

    const exclude = new Set(definition.tools.exclude);
    const defaultToolNames = allTools
      .filter((tool) => tool.sourceInfo?.source === "builtin")
      .map((tool) => tool.name);
    toolNames = [...defaultToolNames, ...definition.tools.names].filter((name) => !exclude.has(name));
  }

  toolNames = [...new Set(toolNames)].filter((name) => name !== TOOL_NAME);

  const extensionPaths = new Set<string>();
  for (const name of toolNames) {
    const tool = byName.get(name);
    const sourcePath = tool && toolSourcePath(tool);
    if (sourcePath) extensionPaths.add(resolveExtensionPath(sourcePath));
  }

  return { toolNames, extensionPaths: [...extensionPaths] };
}

function truncateOutput(text: string) {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= MAX_OUTPUT_BYTES) return text;
  const buffer = Buffer.from(text, "utf8");
  let end = MAX_OUTPUT_BYTES;
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString("utf8") + `\n\n[Output truncated to ${MAX_OUTPUT_BYTES} bytes from ${bytes} bytes]`;
}

function sanitizePreview(text: string) {
  return text
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function appendPreview(progress: TaskProgress, text: string) {
  const sanitized = sanitizePreview(text);
  if (!sanitized) return;
  progress.preview = `${progress.preview}${sanitized}`.slice(-MAX_PREVIEW_CHARS);
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const candidate = message as { role?: string; content?: unknown };
  if (candidate.role !== "assistant" || !Array.isArray(candidate.content)) return "";
  return candidate.content
    .filter((part): part is { type: "text"; text: string } => {
      if (!part || typeof part !== "object") return false;
      const block = part as { type?: string; text?: unknown };
      return block.type === "text" && typeof block.text === "string";
    })
    .map((part) => part.text)
    .join("\n");
}

function elapsedLabel(progress: TaskProgress) {
  if (!progress.startedAt) return "";
  const end = progress.finishedAt ?? Date.now();
  return `${Math.max(0, Math.floor((end - progress.startedAt) / 1000))}s`;
}

class SubagentMonitor implements Component {
  private selectedIndex = 0;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly tasks: TaskProgress[],
  ) {}

  selectPrevious() {
    this.selectedIndex = (this.selectedIndex - 1 + this.tasks.length) % this.tasks.length;
    this.tui.requestRender();
  }

  selectNext() {
    this.selectedIndex = (this.selectedIndex + 1) % this.tasks.length;
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const safeWidth = Math.max(width, 1);
    const progress = this.tasks[this.selectedIndex]!;
    const status = (() => {
      switch (progress.status) {
        case "pending": return this.theme.fg("muted", "○ pending");
        case "running": return this.theme.fg("warning", "● running");
        case "success": return this.theme.fg("success", "✓ done");
        case "failed": return this.theme.fg("error", "✗ failed");
        case "cancelled": return this.theme.fg("warning", "■ cancelled");
      }
    })();
    const elapsed = elapsedLabel(progress);
    const switchHint = this.tasks.length > 1 ? " · Ctrl+Shift+←/→ switch" : "";
    const header =
      this.theme.fg("toolTitle", this.theme.bold("Subagents ")) +
      this.theme.fg("accent", `[${this.selectedIndex + 1}/${this.tasks.length} ${progress.agent}]`) +
      ` ${status}` +
      (elapsed ? this.theme.fg("dim", ` ${elapsed}`) : "") +
      this.theme.fg("dim", `${switchHint} · Esc cancel`);

    const previewLines = progress.preview
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => wrapTextWithAnsi(line, safeWidth))
      .slice(-2);
    if (previewLines.length === 0) {
      previewLines.push(
        progress.status === "pending"
          ? "Waiting to start…"
          : progress.status === "running"
            ? progress.activeTools.size > 0
              ? `Running ${[...progress.activeTools.values()].join(", ")}…`
              : "Waiting for output…"
            : progress.error || "No output.",
      );
    }
    while (previewLines.length < 2) previewLines.push("");

    return [
      truncateToWidth(header, safeWidth),
      truncateToWidth(this.theme.fg("toolOutput", previewLines[0]!), safeWidth),
      truncateToWidth(this.theme.fg("toolOutput", previewLines[1]!), safeWidth),
    ];
  }

  requestRender() {
    this.tui.requestRender();
  }

  invalidate() {}
}

function buildChildPrompt(definition: SubagentDefinition, input: string) {
  return `${input.trim()}\n\nYou are subagent '${definition.name}'. Return your final answer directly to the parent agent. Do not write handoff files unless the task explicitly asks you to modify project files.\n\n`;
}

function runChild(
  args: string[],
  input: string,
  cwd: string,
  signal?: AbortSignal,
  onProgress?: (event: ChildProgressEvent) => void,
): Promise<{
  output: string;
  stderr: string;
  exitCode: number | null;
  stopReason?: string;
  errorMessage?: string;
}> {
  return new Promise((resolvePromise, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn("pi", args, { cwd, stdio: ["pipe", "pipe", "pipe"], detached });
    const decoder = new StringDecoder("utf8");
    const errChunks: Buffer[] = [];
    let lineBuffer = "";
    let liveOutput = "";
    let finalOutput = "";
    let stopReason: string | undefined;
    let errorMessage: string | undefined;
    let closed = false;
    let killTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      if (killTimer && !signal?.aborted) clearTimeout(killTimer);
    };

    const killProcessTree = (killSignal: NodeJS.Signals, forceGroup = false) => {
      if (closed && !(forceGroup && detached && child.pid)) return;
      if (detached && child.pid) {
        try {
          process.kill(-child.pid, killSignal);
          return;
        } catch {
          // Fall back to the direct child when process-group signalling is unavailable.
        }
      }
      child.kill(killSignal);
    };

    const abort = () => {
      if (closed) return;
      killProcessTree("SIGTERM");
      killTimer = setTimeout(() => {
        killTimer = undefined;
        killProcessTree("SIGKILL", true);
      }, 2000);
      killTimer.unref();
    };

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: {
        type?: string;
        message?: unknown;
        assistantMessageEvent?: { type?: string; delta?: unknown };
        toolCallId?: unknown;
        toolName?: unknown;
        isError?: unknown;
      };
      try {
        event = JSON.parse(line) as typeof event;
      } catch {
        return;
      }

      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        const delta = event.assistantMessageEvent.delta;
        if (typeof delta === "string" && delta) {
          liveOutput = `${liveOutput}${delta}`.slice(-MAX_OUTPUT_BYTES);
          onProgress?.({ type: "text", delta });
        }
        return;
      }

      if (event.type === "message_end") {
        const message = event.message as { role?: string; stopReason?: unknown; errorMessage?: unknown } | undefined;
        if (message?.role === "assistant") {
          finalOutput = messageText(message);
          stopReason = typeof message.stopReason === "string" ? message.stopReason : undefined;
          errorMessage = typeof message.errorMessage === "string" ? message.errorMessage : undefined;
        }
        return;
      }

      if (
        event.type === "tool_execution_start" &&
        typeof event.toolCallId === "string" &&
        typeof event.toolName === "string"
      ) {
        onProgress?.({ type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName });
        return;
      }

      if (
        event.type === "tool_execution_end" &&
        typeof event.toolCallId === "string" &&
        typeof event.toolName === "string"
      ) {
        onProgress?.({
          type: "tool_end",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError === true,
        });
      }
    };

    const processStdout = (text: string) => {
      lineBuffer += text;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    };

    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk) => processStdout(decoder.write(Buffer.from(chunk))));
    child.stderr.on("data", (chunk) => errChunks.push(Buffer.from(chunk)));
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      closed = true;
      cleanup();
      reject(error);
    });
    child.on("close", (exitCode) => {
      closed = true;
      processStdout(decoder.end());
      if (lineBuffer.trim()) processLine(lineBuffer);
      cleanup();
      resolvePromise({
        output:
          finalOutput.trim() ||
          (stopReason === "error" || stopReason === "aborted" ? "" : liveOutput.trim()),
        stderr: Buffer.concat(errChunks).toString("utf8"),
        exitCode,
        stopReason,
        errorMessage,
      });
    });

    child.stdin.end(input);
  });
}

async function runSubagent(
  definition: SubagentDefinition,
  input: string,
  pi: ExtensionAPI,
  cwd: string,
  signal?: AbortSignal,
  onProgress?: (event: ChildProgressEvent) => void,
): Promise<ChildResult> {
  try {
    const resolvedTools = resolveTools(definition, pi);
    const args = ["--mode", "json", "-p", "--no-session", "--no-extensions"];

    for (const extensionPath of resolvedTools.extensionPaths) {
      args.push("-e", extensionPath);
    }

    if (resolvedTools.toolNames) {
      args.push("--tools", resolvedTools.toolNames.join(","));
    }

    if (definition.reasoning) {
      args.push("--thinking", definition.reasoning);
    }

    args.push("--system-prompt", definition.prompt, "Run the subagent task from stdin and return the final answer directly.");

    const result = await runChild(args, buildChildPrompt(definition, input), cwd, signal, onProgress);
    const combinedOutput = result.output.trim() || result.stderr.trim();
    const cancelled = signal?.aborted === true || result.stopReason === "aborted";
    if (cancelled) {
      return {
        agent: definition.name,
        ok: false,
        cancelled: true,
        exitCode: result.exitCode,
        output: truncateOutput(combinedOutput),
        error: result.errorMessage || "Subagent cancelled",
      };
    }
    if (result.stopReason === "error") {
      return {
        agent: definition.name,
        ok: false,
        exitCode: result.exitCode,
        output: truncateOutput(combinedOutput),
        error: result.errorMessage || "Subagent failed",
      };
    }
    if (result.exitCode === 0) {
      return { agent: definition.name, ok: true, output: truncateOutput(combinedOutput) };
    }
    return {
      agent: definition.name,
      ok: false,
      exitCode: result.exitCode,
      output: truncateOutput(combinedOutput),
      error: result.errorMessage || `pi exited with code ${result.exitCode}`,
    };
  } catch (error) {
    const cancelled = signal?.aborted === true;
    return {
      agent: definition.name,
      ok: false,
      cancelled,
      output: "",
      error: cancelled ? "Subagent cancelled" : error instanceof Error ? error.message : String(error),
    };
  }
}

function formatResults(results: ChildResult[]) {
  return results
    .map((result, index) => {
      const status = result.cancelled ? "cancelled" : result.ok ? "success" : "failed";
      const header = `=== Subagent ${index + 1}: ${result.agent} (${status}) ===`;
      const error = result.error ? `\nError: ${result.error}` : "";
      const output = result.output.trim() || "(no output)";
      return `${header}${error}\n${output}`;
    })
    .join("\n\n");
}

export default function subagentsExtension(pi: ExtensionAPI) {
  let activeMonitor: SubagentMonitor | undefined;

  pi.registerShortcut("ctrl+shift+left", {
    description: "Watch previous running subagent",
    handler: async () => activeMonitor?.selectPrevious(),
  });

  pi.registerShortcut("ctrl+shift+right", {
    description: "Watch next running subagent",
    handler: async () => activeMonitor?.selectNext(),
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const agents = await loadSubagents(ctx.cwd, ctx.isProjectTrusted());
    if (agents.size === 0) return;

    const lines = [...agents.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((agent) => `- ${agent.name}: ${agent.description ?? "No description"} (${describeTools(agent.tools)}; reasoning: ${agent.reasoning ?? "default"}; ${agent.scope})`);

    return {
      systemPrompt: `${event.systemPrompt}\n\nAvailable subagents for spawn_subagents:\n${lines.join("\n")}`,
    };
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Spawn Subagents",
    description:
      "Spawn one or more small helper agents. They run parallel. Tool waits. Results come back as text. Agent files live in ~/.pi/agent/subagents and .pi/subagents; project wins name clash.",
    promptSnippet: "Spawn helper agents. Wait for direct text results.",
    promptGuidelines: [
      "Use spawn_subagents when separate focused brain should inspect, research, review, or implement.",
      "Give each subagent full task input. Subagent sees only that input plus own prompt.",
      "spawn_subagents runs many tasks parallel and returns all results to main agent.",
    ],
    parameters: SpawnSubagentsParams,
    executionMode: "sequential",

    async execute(_toolCallId, params: SpawnSubagentsParamsType, signal, onUpdate, ctx: ExtensionContext) {
      const agents = await loadSubagents(ctx.cwd, ctx.isProjectTrusted());
      if (agents.size === 0) {
        throw new Error("No subagents found. Create markdown files in ~/.pi/agent/subagents or .pi/subagents.");
      }

      const tasks = params.tasks.map((task) => {
        const definition = agents.get(task.agent);
        if (!definition) {
          throw new Error(`Unknown subagent '${task.agent}'. Available: ${[...agents.keys()].sort().join(", ")}`);
        }
        if (!task.input.trim()) throw new Error(`Task for subagent '${task.agent}' has empty input`);
        return { definition, input: task.input };
      });

      const progress: TaskProgress[] = tasks.map((task, index) => ({
        index,
        agent: task.definition.name,
        status: "pending",
        preview: "",
        activeTools: new Map<string, string>(),
      }));
      const controller = new AbortController();
      let monitor: SubagentMonitor | undefined;
      let updateTimer: NodeJS.Timeout | undefined;
      let clockTimer: NodeJS.Timeout | undefined;

      const makeDetails = (running: boolean): SpawnProgressDetails => {
        const successes = progress.filter((task) => task.status === "success").length;
        const failures = progress.filter((task) => task.status === "failed").length;
        const cancelled = progress.filter((task) => task.status === "cancelled").length;
        return {
          running,
          total: progress.length,
          successes,
          failures,
          cancelled,
          agents: progress.map((task) => ({
            agent: task.agent,
            status: task.status,
            ok: task.status === "success",
            preview: task.preview,
            activeTool: [...task.activeTools.values()].at(-1),
            elapsedSeconds: task.startedAt
              ? Math.max(0, Math.floor(((task.finishedAt ?? Date.now()) - task.startedAt) / 1000))
              : undefined,
            error: task.error,
            exitCode: task.exitCode,
          })),
        };
      };

      const emitUpdate = () => {
        updateTimer = undefined;
        monitor?.requestRender();
        const details = makeDetails(true);
        const done = details.successes + details.failures + details.cancelled;
        const running = progress.filter((task) => task.status === "running").length;
        onUpdate?.({
          content: [{ type: "text", text: `Subagents: ${done}/${details.total} done, ${running} running` }],
          details,
        });
      };

      const scheduleUpdate = (immediate = false) => {
        if (immediate) {
          if (updateTimer) clearTimeout(updateTimer);
          emitUpdate();
          return;
        }
        if (updateTimer) return;
        updateTimer = setTimeout(emitUpdate, UPDATE_THROTTLE_MS);
      };

      const cancelAll = () => {
        if (controller.signal.aborted) return;
        const now = Date.now();
        for (const task of progress) {
          if (task.status !== "pending" && task.status !== "running") continue;
          task.status = "cancelled";
          task.finishedAt = now;
          task.error = "Cancellation requested";
          task.activeTools.clear();
        }
        controller.abort();
        scheduleUpdate(true);
      };

      const forwardAbort = cancelAll;
      if (signal?.aborted) cancelAll();
      else signal?.addEventListener("abort", forwardAbort, { once: true });

      if (ctx.mode === "tui") {
        ctx.ui.setWidget(MONITOR_WIDGET_KEY, (tui, theme) => {
          monitor = new SubagentMonitor(tui, theme, progress);
          activeMonitor = monitor;
          return monitor;
        });
        clockTimer = setInterval(() => monitor?.requestRender(), 1000);
        clockTimer.unref();
      }

      const taskPromises = tasks.map(async (task, index) => {
        const current = progress[index]!;
        if (controller.signal.aborted) {
          current.status = "cancelled";
          current.startedAt = current.startedAt ?? Date.now();
          current.finishedAt = Date.now();
          current.error = "Subagent cancelled";
          scheduleUpdate(true);
          return {
            agent: current.agent,
            ok: false,
            cancelled: true,
            output: "",
            error: "Subagent cancelled",
          } satisfies ChildResult;
        }

        current.status = "running";
        current.startedAt = Date.now();
        scheduleUpdate(true);

        const result = await runSubagent(task.definition, task.input, pi, ctx.cwd, controller.signal, (event) => {
          if (event.type === "text") {
            appendPreview(current, event.delta);
          } else if (event.type === "tool_start") {
            current.activeTools.set(event.toolCallId, event.toolName);
            appendPreview(current, `${current.preview.trim() ? "\n" : ""}→ ${event.toolName}`);
          } else {
            current.activeTools.delete(event.toolCallId);
            appendPreview(current, `\n${event.isError ? "✗" : "✓"} ${event.toolName}`);
          }
          scheduleUpdate();
        });

        current.status = result.cancelled ? "cancelled" : result.ok ? "success" : "failed";
        current.finishedAt = Date.now();
        current.exitCode = result.exitCode;
        current.error = result.error;
        current.activeTools.clear();
        if (!current.preview.trim() && result.output.trim()) appendPreview(current, result.output);
        scheduleUpdate(true);
        return result;
      });

      let results: ChildResult[];
      try {
        results = await Promise.all(taskPromises);
      } catch (error) {
        cancelAll();
        await Promise.allSettled(taskPromises);
        throw error;
      } finally {
        signal?.removeEventListener("abort", forwardAbort);
        if (updateTimer) clearTimeout(updateTimer);
        if (clockTimer) clearInterval(clockTimer);
        if (ctx.mode === "tui") ctx.ui.setWidget(MONITOR_WIDGET_KEY, undefined);
        if (activeMonitor === monitor) activeMonitor = undefined;
      }

      const text = formatResults(results);
      const details = makeDetails(false);
      return {
        content: [{ type: "text", text }],
        details,
      };
    },

    renderCall(args, theme) {
      const tasks = Array.isArray(args.tasks) ? args.tasks : [];
      const names = tasks.map((task: { agent?: string }) => task.agent).filter(Boolean).join(", ");
      return new Text(theme.fg("toolTitle", theme.bold("spawn_subagents ")) + theme.fg("muted", names || "no tasks"), 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as SpawnProgressDetails | undefined;
      if (!details || typeof details.total !== "number") {
        const text = result.content[0];
        const fallback = text?.type === "text" && text.text ? text.text : "subagents running...";
        return new Text(theme.fg("muted", fallback), 0, 0);
      }

      if (details.running) {
        const done = details.successes + details.failures + details.cancelled;
        const running = details.agents.filter((agent) => agent.status === "running").length;
        return new Text(
          theme.fg("warning", "● ") +
            theme.fg("muted", `subagents running: ${done}/${details.total} done, ${running} active`),
          0,
          0,
        );
      }

      const hasProblems = details.failures > 0 || details.cancelled > 0;
      const icon = hasProblems ? theme.fg("warning", "◐") : theme.fg("success", "✓");
      const suffix = [
        details.failures ? `${details.failures} failed` : "",
        details.cancelled ? `${details.cancelled} cancelled` : "",
      ].filter(Boolean).join(", ");
      const summary =
        `${icon} ${theme.fg(hasProblems ? "warning" : "success", `subagents complete: ${details.successes}/${details.total} succeeded`)}` +
        (suffix ? theme.fg("muted", ` (${suffix})`) : "");
      if (!expanded) return new Text(summary, 0, 0);

      const text = result.content.find((item) => item.type === "text");
      return new Text(
        `${summary}\n\n${theme.fg("toolOutput", text?.type === "text" ? text.text : "(no output)")}`,
        0,
        0,
      );
    },
  });
}
