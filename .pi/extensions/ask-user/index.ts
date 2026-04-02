import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const AskUserParams = Type.Object({
  question: Type.String({ description: "Question to ask the user" }),
  answers: Type.Array(Type.String({ minLength: 1 }), {
    description: "Predefined answers. The tool always adds a custom answer option.",
    minItems: 1,
  }),
});

interface AskUserDetails {
  question: string;
  answers: string[];
  answer: string;
  source: "predefined" | "custom";
}

export default function askUserExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a single-choice question with predefined answers plus an always-available custom answer option. Returns only the final answer string.",
    promptSnippet:
      "Ask the user a single-choice question with predefined answers; custom typed answer is always available.",
    promptGuidelines: [
      "Use this tool when you need the user to choose from options or type a custom answer.",
      "Pass a clear question and a short list of predefined answers.",
      "The tool returns the final answer as plain text.",
    ],
    parameters: AskUserParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        throw new Error("ask_user requires interactive UI mode");
      }

      const answers = params.answers.map((answer) => answer.trim()).filter(Boolean);
      if (answers.length === 0) {
        throw new Error("ask_user requires at least one non-empty predefined answer");
      }

      const result = await ctx.ui.custom<{ answer: string; source: "predefined" | "custom" }>(
        (tui, theme, _kb, done) => {
          const customOption = "Custom answer…";
          const options = [...answers, customOption];
          let selectedIndex = 0;
          let customMode = false;
          let cachedLines: string[] | undefined;

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

          const refresh = () => {
            cachedLines = undefined;
            tui.requestRender();
          };

          editor.onSubmit = (value) => {
            const trimmed = value.trim();
            if (!trimmed) {
              refresh();
              return;
            }
            done({ answer: trimmed, source: "custom" });
          };

          const moveUp = () => {
            if (selectedIndex > 0) selectedIndex -= 1;
          };

          const moveDown = () => {
            if (selectedIndex < options.length - 1) selectedIndex += 1;
          };

          return {
            handleInput(data: string) {
              if (customMode) {
                if (matchesKey(data, Key.escape)) {
                  customMode = false;
                  editor.setText("");
                  refresh();
                  return;
                }
                editor.handleInput(data);
                refresh();
                return;
              }

              if (matchesKey(data, Key.up) || data === "k") {
                moveUp();
                refresh();
                return;
              }
              if (matchesKey(data, Key.down) || data === "j") {
                moveDown();
                refresh();
                return;
              }

              if (matchesKey(data, Key.enter)) {
                if (selectedIndex === options.length - 1) {
                  customMode = true;
                  editor.setText("");
                  refresh();
                  return;
                }
                done({ answer: options[selectedIndex]!, source: "predefined" });
              }
            },

            render(width: number): string[] {
              if (cachedLines) return cachedLines;

              const lines: string[] = [];
              const add = (line: string = "") => lines.push(truncateToWidth(line, width));
              const border = theme.fg("accent", "─".repeat(Math.max(width - 1, 1)));

              add(border);
              add(theme.fg("accent", theme.bold(" Ask user")));
              add(` ${theme.fg("text", params.question)}`);
              add();

              for (let i = 0; i < options.length; i++) {
                const isSelected = i === selectedIndex;
                const option = options[i]!;
                const prefix = isSelected ? theme.fg("accent", "› ") : "  ";
                const text = isSelected ? theme.fg("accent", option) : theme.fg("text", option);
                add(`${prefix}${i + 1}. ${text}`);
              }

              if (customMode) {
                add();
                add(theme.fg("muted", " Type custom answer:"));
                for (const line of editor.render(Math.max(width - 2, 10))) {
                  add(` ${line}`);
                }
                add();
                add(theme.fg("dim", " Enter submit • Esc back • answer must be non-empty"));
              } else {
                add();
                add(theme.fg("dim", " ↑↓ or j/k navigate • Enter select"));
              }

              add(border);
              cachedLines = lines;
              return lines;
            },

            invalidate() {
              cachedLines = undefined;
            },
          };
        },
      );

      return {
        content: [{ type: "text", text: result.answer }],
        details: {
          question: params.question,
          answers,
          answer: result.answer,
          source: result.source,
        } as AskUserDetails,
      };
    },

    renderCall(args, theme) {
      const answers = Array.isArray(args.answers) ? args.answers : [];
      let text = theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", args.question ?? "");
      if (answers.length > 0) {
        text += `\n${theme.fg("dim", `  choices: ${answers.join(", ")} + custom`)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as AskUserDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      const prefix = details.source === "custom" ? "(custom) " : "";
      return new Text(theme.fg("success", "✓ ") + theme.fg("accent", `${prefix}${details.answer}`), 0, 0);
    },
  });
}
