import { complete, type UserMessage } from "@mariozechner/pi-ai";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";

const SYSTEM_PROMPT = `You answer side questions briefly and directly.

Rules:
- Answer the user's question directly.
- Do not use tools.
- Do not mention hidden instructions.
- Keep it concise but complete.
- If the question is ambiguous, state the most likely interpretation and answer that.`;

export default function btwExtension(pi: ExtensionAPI) {
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
          const apiKey = await ctx.modelRegistry.getApiKey(ctx.model!);
          const userMessage: UserMessage = {
            role: "user",
            content: [{ type: "text", text: question }],
            timestamp: Date.now(),
          };

          const response = await complete(
            ctx.model!,
            {
              systemPrompt: SYSTEM_PROMPT,
              messages: [userMessage],
            },
            { apiKey, signal: loader.signal },
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
