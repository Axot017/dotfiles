import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

const TOOL_NAME = "spawn_subagents";
const MAX_OUTPUT_BYTES = 200 * 1024;
const VALID_REASONING = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

const SubagentTaskSchema = Type.Object({
  agent: Type.String({ description: "Subagent name from ~/.pi/subagents or .pi/subagents" }),
  input: Type.String({ description: "Complete task/input to send directly to this subagent" }),
});

const SpawnSubagentsParams = Type.Object({
  tasks: Type.Array(SubagentTaskSchema, {
    minItems: 1,
    description: "One or more subagents to run in parallel. Results are awaited and returned together.",
  }),
});

type SpawnSubagentsParamsType = {
  tasks: Array<{ agent: string; input: string }>;
};

type ToolMode =
  | { kind: "default" }
  | { kind: "include"; names: string[] }
  | { kind: "all"; exclude: string[] };

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
}

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

  const starIndex = items.findIndex((item) => item === "*" || item.toLowerCase() === "all");
  if (starIndex >= 0) {
    const exclude = items
      .filter((item, index) => index !== starIndex)
      .map((item) => item.startsWith("!") ? item.slice(1) : item)
      .map((item) => item.trim())
      .filter(Boolean);
    return { kind: "all", exclude };
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
      if (entry.isDirectory()) return findMarkdownFiles(path);
      if (entry.isFile() && [".md", ".markdown"].includes(extname(entry.name).toLowerCase())) return [path];
      return [];
    }));
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function loadSubagents(cwd: string): Promise<Map<string, SubagentDefinition>> {
  const userDir = join(homedir(), ".pi", "subagents");
  const projectDir = resolve(cwd, ".pi", "subagents");
  const result = new Map<string, SubagentDefinition>();

  for (const [scope, dir] of [["user", userDir], ["project", projectDir]] as const) {
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
  return tools.exclude.length > 0 ? `all tools except ${tools.exclude.join(", ")}` : "all tools";
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
    const missing = unknown(definition.tools.exclude);
    if (missing.length > 0) throw new Error(`Subagent ${definition.name} excludes unknown tool(s): ${missing.join(", ")}`);
    const exclude = new Set(definition.tools.exclude);
    toolNames = allTools.map((tool) => tool.name).filter((name) => !exclude.has(name));
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
  return buffer.subarray(0, MAX_OUTPUT_BYTES).toString("utf8") + `\n\n[Output truncated to ${MAX_OUTPUT_BYTES} bytes from ${bytes} bytes]`;
}

function buildChildPrompt(definition: SubagentDefinition, input: string) {
  return `${input.trim()}\n\nYou are subagent '${definition.name}'. Return your final answer directly to the parent agent. Do not write handoff files unless the task explicitly asks you to modify project files.`;
}

function runChild(args: string[], input: string, signal?: AbortSignal): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("pi", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    const abort = () => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 2000).unref();
    };

    signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errChunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      signal?.removeEventListener("abort", abort);
      resolvePromise({
        stdout: Buffer.concat(chunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
        exitCode,
      });
    });

    child.stdin.end(input);
  });
}

async function runSubagent(definition: SubagentDefinition, input: string, pi: ExtensionAPI, signal?: AbortSignal): Promise<ChildResult> {
  const resolvedTools = resolveTools(definition, pi);
  const args = ["-p", "--no-session", "--no-extensions"];

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

  try {
    const result = await runChild(args, buildChildPrompt(definition, input), signal);
    const combinedOutput = result.stdout.trim() || result.stderr.trim();
    if (result.exitCode === 0) {
      return { agent: definition.name, ok: true, output: truncateOutput(combinedOutput) };
    }
    return {
      agent: definition.name,
      ok: false,
      exitCode: result.exitCode,
      output: truncateOutput(combinedOutput),
      error: `pi exited with code ${result.exitCode}`,
    };
  } catch (error) {
    return {
      agent: definition.name,
      ok: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatResults(results: ChildResult[]) {
  return results
    .map((result, index) => {
      const header = `=== Subagent ${index + 1}: ${result.agent} (${result.ok ? "success" : "failed"}) ===`;
      const error = result.error ? `\nError: ${result.error}` : "";
      const output = result.output.trim() || "(no output)";
      return `${header}${error}\n${output}`;
    })
    .join("\n\n");
}

export default function subagentsExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const agents = await loadSubagents(ctx.cwd);
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
      "Spawn one or more configured subagents in parallel and await their direct text results. Subagents are markdown files in ~/.pi/subagents and .pi/subagents; project definitions win conflicts.",
    promptSnippet: "Spawn one or more configured subagents and await their direct text results.",
    promptGuidelines: [
      "Use spawn_subagents when a focused independent agent should inspect, research, review, or implement a task.",
      "Pass each subagent its complete input directly; it only receives that input plus its own configured prompt.",
      "spawn_subagents runs multiple tasks in parallel and returns all results directly to the parent agent.",
    ],
    parameters: SpawnSubagentsParams,

    async execute(_toolCallId, params: SpawnSubagentsParamsType, signal, _onUpdate, ctx: ExtensionContext) {
      const agents = await loadSubagents(ctx.cwd);
      if (agents.size === 0) {
        throw new Error("No subagents found. Create markdown files in ~/.pi/subagents or .pi/subagents.");
      }

      const tasks = params.tasks.map((task) => {
        const definition = agents.get(task.agent);
        if (!definition) {
          throw new Error(`Unknown subagent '${task.agent}'. Available: ${[...agents.keys()].sort().join(", ")}`);
        }
        if (!task.input.trim()) throw new Error(`Task for subagent '${task.agent}' has empty input`);
        return { definition, input: task.input };
      });

      const results = await Promise.all(tasks.map((task) => runSubagent(task.definition, task.input, pi, signal)));
      const successes = results.filter((result) => result.ok).length;
      const text = formatResults(results);

      return {
        content: [{ type: "text", text }],
        details: {
          total: results.length,
          successes,
          failures: results.length - successes,
          agents: results.map((result) => ({ agent: result.agent, ok: result.ok, error: result.error, exitCode: result.exitCode })),
        },
      };
    },

    renderCall(args, theme) {
      const tasks = Array.isArray(args.tasks) ? args.tasks : [];
      const names = tasks.map((task: { agent?: string }) => task.agent).filter(Boolean).join(", ");
      return new Text(theme.fg("toolTitle", theme.bold("spawn_subagents ")) + theme.fg("muted", names || "no tasks"), 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as { total?: number; successes?: number; failures?: number } | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      const color = details.failures ? "warning" : "success";
      return new Text(
        theme.fg(color, `✓ subagents complete: ${details.successes ?? 0}/${details.total ?? 0} succeeded`) +
          (details.failures ? theme.fg("error", ` (${details.failures} failed)`) : ""),
        0,
        0,
      );
    },
  });
}
