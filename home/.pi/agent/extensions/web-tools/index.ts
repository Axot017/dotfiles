import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import TurndownService from "turndown";

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const EXA_SECRET_PATH = join(homedir(), ".pi", "secret", "exa");

function stringEnum<const T extends readonly string[]>(values: T, options?: { description?: string; default?: T[number] }) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...(options?.description ? { description: options.description } : {}),
    ...(options?.default ? { default: options.default } : {}),
  });
}

const WebSearchParams = Type.Object({
  query: Type.String({ description: "Web search query" }),
  numResults: Type.Optional(Type.Number({ description: "Number of search results to return (default: 8)" })),
  livecrawl: Type.Optional(
    stringEnum(["fallback", "preferred"] as const, {
      description:
        "Live crawl mode. 'fallback': use live crawling as backup if cached content is unavailable. 'preferred': prioritize live crawling. Default: 'fallback'.",
    }),
  ),
  type: Type.Optional(
    stringEnum(["auto", "fast", "deep"] as const, {
      description: "Search type. 'auto': balanced, 'fast': quick results, 'deep': comprehensive. Default: 'auto'.",
    }),
  ),
  contextMaxCharacters: Type.Optional(
    Type.Number({ description: "Maximum characters for Exa's LLM-optimized context string (default: 10000)" }),
  ),
});

const WebFetchParams = Type.Object({
  url: Type.String({ description: "The fully-formed URL to fetch content from" }),
  format: Type.Optional(
    stringEnum(["text", "markdown", "html"] as const, {
      description: "The format to return content in. Defaults to markdown.",
    }),
  ),
  timeout: Type.Optional(Type.Number({ description: "Optional timeout in seconds (max 120)" })),
});

type WebSearchDetails = {
  query: string;
  usedApiKey: boolean;
  bytes: number;
};

type WebFetchDetails = {
  url: string;
  format: "text" | "markdown" | "html";
  status: number;
  contentType: string;
  bytes: number;
  image: boolean;
};

async function readExaApiKey(): Promise<string | undefined> {
  try {
    const key = (await readFile(EXA_SECRET_PATH, "utf8")).trim();
    return key || undefined;
  } catch {
    return undefined;
  }
}

async function callExaMcp(args: {
  query: string;
  type: "auto" | "fast" | "deep";
  numResults: number;
  livecrawl: "fallback" | "preferred";
  contextMaxCharacters?: number;
}, signal?: AbortSignal): Promise<{ text: string | undefined; usedApiKey: boolean }> {
  const apiKey = await readExaApiKey();
  const url = apiKey ? `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(apiKey)}` : "https://mcp.exa.ai/mcp";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("websearch request timed out after 25 seconds")), 25_000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search_exa",
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Exa websearch failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 500)}` : ""}`);
    }

    return { text: parseMcpSse(await response.text()), usedApiKey: Boolean(apiKey) };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function parseMcpSse(body: string): string | undefined {
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const data = JSON.parse(line.slice(6));
      const text = data?.result?.content?.[0]?.text;
      if (typeof text === "string" && text.length > 0) return text;
    } catch {
      // Ignore non-JSON SSE lines.
    }
  }

  try {
    const data = JSON.parse(body);
    const text = data?.result?.content?.[0]?.text;
    if (typeof text === "string" && text.length > 0) return text;
  } catch {
    // Body was not a JSON-RPC object.
  }

  return undefined;
}

function getAcceptHeader(format: "text" | "markdown" | "html") {
  switch (format) {
    case "markdown":
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
    case "text":
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
    case "html":
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
  }
}

async function fetchWithTimeout(url: string, format: "text" | "markdown" | "html", timeoutSeconds: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`webfetch request timed out after ${timeoutSeconds} seconds`)), timeoutSeconds * 1000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    Accept: getAcceptHeader(format),
    "Accept-Language": "en-US,en;q=0.9",
  };

  try {
    let response = await fetch(url, { signal: controller.signal, headers });

    if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
      response = await fetch(url, { signal: controller.signal, headers: { ...headers, "User-Agent": "pi" } });
    }

    return response;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function readLimitedArrayBuffer(response: Response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
    throw new Error("Response too large (exceeds 5MB limit)");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
    throw new Error("Response too large (exceeds 5MB limit)");
  }
  return arrayBuffer;
}

function isImageMime(mime: string) {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime);
}

function convertHTMLToMarkdown(html: string) {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  turndownService.remove(["script", "style", "meta", "link", "noscript", "iframe", "object", "embed"]);
  return turndownService.turndown(html).trim();
}

function extractTextFromHTML(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateForRender(text: string, max = 120) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default function webToolsExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description: `Search the web using Exa AI for up-to-date information and current events. The current year is ${new Date().getFullYear()}; include it in searches for recent information. Uses ~/.pi/secret/exa as an optional Exa API key when present, otherwise calls Exa without a key.`,
    promptSnippet: "Search the web using Exa AI for current or external information.",
    promptGuidelines: [
      "Use websearch when you need information beyond your knowledge cutoff, current events, recent data, or external sources.",
      `When using websearch for recent/current information, include the current year ${new Date().getFullYear()} in the query.`,
      "websearch supports livecrawl 'fallback' or 'preferred', search type 'auto', 'fast', or 'deep', and configurable result/context limits.",
    ],
    parameters: WebSearchParams,

    async execute(_toolCallId, params, signal, onUpdate) {
      const query = params.query.trim();
      if (!query) throw new Error("websearch query must be non-empty");

      onUpdate?.({ content: [{ type: "text", text: `Searching web for: ${query}` }], details: { query, usedApiKey: false, bytes: 0 } });

      const result = await callExaMcp(
        {
          query,
          type: params.type ?? "auto",
          numResults: params.numResults ?? 8,
          livecrawl: params.livecrawl ?? "fallback",
          contextMaxCharacters: params.contextMaxCharacters,
        },
        signal,
      );

      const text = result.text ?? "No search results found. Please try a different query.";
      return {
        content: [{ type: "text", text }],
        details: { query, usedApiKey: result.usedApiKey, bytes: Buffer.byteLength(text, "utf8") },
      };
    },

    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("websearch ")) + theme.fg("muted", truncateForRender(args.query ?? "")), 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as WebSearchDetails;
      return new Text(
        `${theme.fg("success", "✓ ")}${theme.fg("accent", "search complete")} ${theme.fg("muted", `(${details.bytes} bytes${details.usedApiKey ? ", Exa key" : ", no Exa key"})`)}`,
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "webfetch",
    label: "Web Fetch",
    description:
      "Fetch content from a URL and return it as markdown (default), text, or html. Can also fetch common image types. Read-only; does not modify files.",
    promptSnippet: "Fetch and inspect a URL as markdown, text, html, or image content.",
    promptGuidelines: [
      "Use webfetch when you need to retrieve and analyze a specific URL.",
      "webfetch requires a fully-formed http:// or https:// URL.",
      "webfetch defaults to markdown; request html only when raw markup is needed.",
    ],
    parameters: WebFetchParams,

    async execute(_toolCallId, params, signal, onUpdate) {
      const url = params.url.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new Error("URL must start with http:// or https://");
      }

      const format = params.format ?? "markdown";
      const timeout = Math.min(Math.max(params.timeout ?? DEFAULT_TIMEOUT_SECONDS, 1), MAX_TIMEOUT_SECONDS);

      onUpdate?.({
        content: [{ type: "text", text: `Fetching ${url}` }],
        details: { url, format, status: 0, contentType: "", bytes: 0, image: false },
      });

      const response = await fetchWithTimeout(url, format, timeout, signal);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`webfetch failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 500)}` : ""}`);
      }

      const arrayBuffer = await readLimitedArrayBuffer(response);
      const contentType = response.headers.get("content-type") ?? "";
      const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
      const details: WebFetchDetails = {
        url,
        format,
        status: response.status,
        contentType,
        bytes: arrayBuffer.byteLength,
        image: isImageMime(mime),
      };

      if (isImageMime(mime)) {
        return {
          content: [
            { type: "text", text: "Image fetched successfully" },
            { type: "image", data: Buffer.from(arrayBuffer).toString("base64"), mimeType: mime },
          ],
          details,
        };
      }

      const content = new TextDecoder().decode(arrayBuffer);
      const isHtml = contentType.includes("text/html") || /<html[\s>]/i.test(content);

      if (format === "html") {
        return { content: [{ type: "text", text: content }], details };
      }

      if (format === "text") {
        return { content: [{ type: "text", text: isHtml ? extractTextFromHTML(content) : content }], details };
      }

      return { content: [{ type: "text", text: isHtml ? convertHTMLToMarkdown(content) : content }], details };
    },

    renderCall(args, theme) {
      const format = args.format ? theme.fg("dim", ` (${args.format})`) : "";
      return new Text(theme.fg("toolTitle", theme.bold("webfetch ")) + theme.fg("muted", truncateForRender(args.url ?? "")) + format, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as WebFetchDetails;
      return new Text(
        `${theme.fg("success", "✓ ")}${theme.fg("accent", details.image ? "image fetched" : "content fetched")} ${theme.fg("muted", `HTTP ${details.status}, ${details.bytes} bytes${details.contentType ? `, ${details.contentType}` : ""}`)}`,
        0,
        0,
      );
    },
  });
}
