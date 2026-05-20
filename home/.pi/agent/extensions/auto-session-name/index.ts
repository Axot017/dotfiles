import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { complete, type Api, type Model, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

interface AutoSessionNameConfig {
  enabled: boolean;
  useCurrentModel: boolean;
  useCurrentAuth: boolean;
  provider?: string;
  model?: string;
  maxTokens: number;
  maxTitleLength: number;
  notify: boolean;
}

const DEFAULT_CONFIG: AutoSessionNameConfig = {
  enabled: true,
  useCurrentModel: false,
  useCurrentAuth: true,
  provider: "openai-codex",
  model: "gpt-5.4-mini",
  maxTokens: 64,
  maxTitleLength: 80,
  notify: true,
};

const CONFIG_PATH = join(homedir(), ".pi", "agent", "auto-session-name.json");
const PLAN_FIRST_INPUT_EVENT = "auto-session-name:first-input";

interface FirstInputEvent {
  text?: unknown;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asPositiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function loadConfig(ctx?: ExtensionContext): Promise<AutoSessionNameConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      enabled: asBool(parsed.enabled, DEFAULT_CONFIG.enabled),
      useCurrentModel: asBool(parsed.useCurrentModel, DEFAULT_CONFIG.useCurrentModel),
      useCurrentAuth: asBool(parsed.useCurrentAuth, DEFAULT_CONFIG.useCurrentAuth),
      provider: typeof parsed.provider === "string" && parsed.provider.trim() ? parsed.provider.trim() : DEFAULT_CONFIG.provider,
      model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : DEFAULT_CONFIG.model,
      maxTokens: asPositiveInt(parsed.maxTokens, DEFAULT_CONFIG.maxTokens),
      maxTitleLength: asPositiveInt(parsed.maxTitleLength, DEFAULT_CONFIG.maxTitleLength),
      notify: asBool(parsed.notify, DEFAULT_CONFIG.notify),
    };
  } catch (error) {
    if (ctx?.hasUI) {
      ctx.ui.notify(`auto-session-name: could not read ${CONFIG_PATH}: ${String(error)}`, "warning");
    }
    return { ...DEFAULT_CONFIG, enabled: false };
  }
}

function isIgnorableInput(text: string, source: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (source === "extension") return true;
  if (trimmed.startsWith("/")) return true;
  return false;
}

function sanitizeTitle(raw: string, maxLength: number): string {
  let title = raw
    .trim()
    .replace(/^[-*•\s]+/, "")
    .replace(/^#+\s*/, "")
    .replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const sentenceMatch = title.match(/^(.+?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) title = sentenceMatch[1].trim();

  title = title.replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, "").trim();

  if (title.length > maxLength) {
    title = title.slice(0, maxLength).trimEnd();
  }

  return title;
}

function resolveModel(ctx: ExtensionContext, config: AutoSessionNameConfig): Model<Api> | undefined {
  if (config.useCurrentModel || !config.provider || !config.model) return ctx.model ?? undefined;
  return ctx.modelRegistry.find(config.provider, config.model);
}

function resolveAuthModel(ctx: ExtensionContext, config: AutoSessionNameConfig, targetModel: Model<Api>): Model<Api> {
  if (config.useCurrentAuth && ctx.model) return ctx.model;
  return targetModel;
}

async function generateName(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: AutoSessionNameConfig,
  firstMessage: string,
  signal: AbortSignal,
) {
  const model = resolveModel(ctx, config);
  if (!model) {
    const name = config.useCurrentModel ? "current model" : `${config.provider}/${config.model}`;
    if (ctx.hasUI) ctx.ui.notify(`auto-session-name: model not found: ${name}`, "warning");
    return;
  }

  const authModel = resolveAuthModel(ctx, config, model);
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(authModel);
  if (!auth.ok) {
    if (ctx.hasUI) ctx.ui.notify(`auto-session-name: auth failed: ${auth.error}`, "warning");
    return;
  }

  const messages: UserMessage[] = [
    {
      role: "user",
      timestamp: Date.now(),
      content: [
        {
          type: "text",
          text: `Generate a concise single-sentence title for this pi coding-agent session based only on the user's first message.\n\nRules:\n- Return only the title.\n- No quotes.\n- No markdown.\n- No explanation.\n- Maximum 12 words.\n\nFirst message:\n${firstMessage}`,
        },
      ],
    },
  ];

  const response = await complete(
    model,
    { messages },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: config.maxTokens,
      signal,
    },
  );

  if (signal.aborted) return;

  const raw = response.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ");

  const title = sanitizeTitle(raw, config.maxTitleLength);
  if (!title) return;

  if (pi.getSessionName()) return;
  pi.setSessionName(title);
  if (config.notify && ctx.hasUI) ctx.ui.notify(`Session named: ${title}`, "info");
}

export default function (pi: ExtensionAPI) {
  let started = false;
  let controller: AbortController | undefined;
  let generationId = 0;
  let pendingFirstInput: string | undefined;

  function resetGenerationState() {
    started = false;
    pendingFirstInput = undefined;
    controller?.abort();
    controller = undefined;
    generationId += 1;
  }

  async function startGeneration(ctx: ExtensionContext, text: string): Promise<void> {
    if (started || pi.getSessionName()) return;

    const firstMessage = text.trim();
    if (!firstMessage) return;

    const config = await loadConfig(ctx);
    if (!config.enabled) return;

    started = true;
    const id = generationId;
    controller = new AbortController();
    const signal = controller.signal;

    void generateName(pi, ctx, config, firstMessage, signal).catch((error) => {
      if (signal.aborted || id !== generationId) return;
      if (ctx.hasUI) ctx.ui.notify(`auto-session-name failed: ${String(error)}`, "warning");
    });
  }

  pi.events.on(PLAN_FIRST_INPUT_EVENT, (event: unknown) => {
    if (started || pi.getSessionName()) return;

    const payload = event as FirstInputEvent | undefined;
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) return;

    pendingFirstInput = text;
  });

  pi.on("session_start", () => {
    resetGenerationState();
  });

  pi.on("session_shutdown", () => {
    resetGenerationState();
  });

  pi.on("input", async (event, ctx) => {
    if (isIgnorableInput(event.text, event.source)) {
      return { action: "continue" };
    }

    await startGeneration(ctx, event.text);

    return { action: "continue" };
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    const firstInput = pendingFirstInput;
    pendingFirstInput = undefined;

    if (!firstInput) return;

    await startGeneration(ctx, firstInput);
  });
}
