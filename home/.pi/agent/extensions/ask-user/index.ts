import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const QuestionItemSchema = Type.Object({
  question: Type.String({ description: "Question to ask the user" }),
  answers: Type.Array(Type.String({ minLength: 1 }), {
    description: "Predefined answers. The tool always adds a custom answer option.",
    minItems: 1,
  }),
});

const AskUserParams = Type.Object({
  question: Type.Optional(Type.String({ description: "Question to ask the user" })),
  answers: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      description: "Predefined answers. The tool always adds a custom answer option.",
      minItems: 1,
    }),
  ),
  questions: Type.Optional(
    Type.Array(QuestionItemSchema, {
      description: "Ask multiple questions in one UI flow. Each question has predefined answers; custom answer is always available.",
      minItems: 1,
    }),
  ),
});

interface NormalizedQuestion {
  question: string;
  answers: string[];
}

interface AnswerItem {
  question: string;
  answer: string;
  source: "predefined" | "custom";
}

interface AskUserDetails {
  mode: "single" | "multi";
  items: AnswerItem[];
}

function normalizeQuestions(params: {
  question?: string;
  answers?: string[];
  questions?: Array<{ question: string; answers: string[] }>;
}): NormalizedQuestion[] {
  if (params.questions && params.questions.length > 0) {
    if (params.question || params.answers) {
      throw new Error("Use either question+answers or questions, not both");
    }
    return params.questions.map((item, index) => {
      const question = item.question?.trim();
      const answers = item.answers.map((answer) => answer.trim()).filter(Boolean);
      if (!question) throw new Error(`Question ${index + 1} must be non-empty`);
      if (answers.length === 0) throw new Error(`Question ${index + 1} must have at least one non-empty predefined answer`);
      return { question, answers };
    });
  }

  const question = params.question?.trim();
  const answers = (params.answers ?? []).map((answer) => answer.trim()).filter(Boolean);
  if (!question) throw new Error("ask_user requires question or questions");
  if (answers.length === 0) throw new Error("ask_user requires at least one non-empty predefined answer");
  return [{ question, answers }];
}

export default function askUserExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user one or more questions with predefined answers plus an always-available custom answer option. For one question it returns the final answer string; for multiple questions it returns a JSON array string of answers in order.",
    promptSnippet:
      "Ask the user one or more questions with predefined answers; custom typed answer is always available.",
    promptGuidelines: [
      "Use this tool when you need the user to choose from options or type a custom answer.",
      "For a single question pass question + answers.",
      "For multiple questions pass questions: [{ question, answers }].",
      "The tool returns a plain string for one question, or a JSON array string for multiple questions.",
    ],
    parameters: AskUserParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        throw new Error("ask_user requires interactive UI mode");
      }

      const questions = normalizeQuestions(params);
      const result = await ctx.ui.custom<AnswerItem[]>((tui, theme, _kb, done) => {
        const customOption = "Custom answer…";
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

        let activeQuestionIndex = 0;
        let selectedIndex = 0;
        let customMode = false;
        let reviewMode = false;
        let cachedLines: string[] | undefined;
        const answers: Array<AnswerItem | undefined> = new Array(questions.length);

        const refresh = () => {
          cachedLines = undefined;
          tui.requestRender();
        };

        const getOptions = (questionIndex: number) => [...questions[questionIndex]!.answers, customOption];
        const isAnswered = (questionIndex: number) => Boolean(answers[questionIndex]);
        const allAnswered = () => answers.every(Boolean);

        const syncSelectionToExistingAnswer = () => {
          const existingAnswer = answers[activeQuestionIndex];
          const predefinedIndex = existingAnswer && existingAnswer.source === "predefined"
            ? questions[activeQuestionIndex]!.answers.indexOf(existingAnswer.answer)
            : -1;
          selectedIndex = predefinedIndex >= 0 ? predefinedIndex : getOptions(activeQuestionIndex).length - 1;
        };

        const goToQuestion = (questionIndex: number) => {
          activeQuestionIndex = Math.max(0, Math.min(questionIndex, questions.length - 1));
          customMode = false;
          reviewMode = false;
          editor.setText("");
          syncSelectionToExistingAnswer();
        };

        const saveAnswer = (answer: string, source: "predefined" | "custom") => {
          answers[activeQuestionIndex] = {
            question: questions[activeQuestionIndex]!.question,
            answer,
            source,
          };

          if (activeQuestionIndex < questions.length - 1) {
            goToQuestion(activeQuestionIndex + 1);
          } else if (allAnswered()) {
            reviewMode = true;
            customMode = false;
            selectedIndex = questions.length;
          }
          refresh();
        };

        editor.onSubmit = (value) => {
          const trimmed = value.trim();
          if (!trimmed) {
            refresh();
            return;
          }
          saveAnswer(trimmed, "custom");
        };

        return {
          handleInput(data: string) {
            if (customMode) {
              if (matchesKey(data, Key.escape)) {
                customMode = false;
                const existingAnswer = answers[activeQuestionIndex];
                editor.setText(existingAnswer?.source === "custom" ? existingAnswer.answer : "");
                refresh();
                return;
              }
              editor.handleInput(data);
              refresh();
              return;
            }

            if (reviewMode) {
              if (matchesKey(data, Key.up) || data === "k") {
                if (selectedIndex > 0) selectedIndex -= 1;
                refresh();
                return;
              }
              if (matchesKey(data, Key.down) || data === "j") {
                if (selectedIndex < questions.length) selectedIndex += 1;
                refresh();
                return;
              }
              if (matchesKey(data, Key.enter)) {
                if (selectedIndex === questions.length) {
                  done(answers as AnswerItem[]);
                  return;
                }
                goToQuestion(selectedIndex);
                refresh();
              }
              return;
            }

            if (matchesKey(data, Key.left) || data === "h") {
              if (activeQuestionIndex > 0) {
                goToQuestion(activeQuestionIndex - 1);
                refresh();
              }
              return;
            }
            if (matchesKey(data, Key.right) || data === "l") {
              if (activeQuestionIndex < questions.length - 1) {
                goToQuestion(activeQuestionIndex + 1);
                refresh();
              }
              return;
            }
            if (matchesKey(data, Key.up) || data === "k") {
              if (selectedIndex > 0) selectedIndex -= 1;
              refresh();
              return;
            }
            if (matchesKey(data, Key.down) || data === "j") {
              if (selectedIndex < getOptions(activeQuestionIndex).length - 1) selectedIndex += 1;
              refresh();
              return;
            }
            if (matchesKey(data, Key.enter)) {
              const options = getOptions(activeQuestionIndex);
              if (selectedIndex === options.length - 1) {
                customMode = true;
                const existingAnswer = answers[activeQuestionIndex];
                editor.setText(existingAnswer?.source === "custom" ? existingAnswer.answer : "");
                refresh();
                return;
              }
              saveAnswer(options[selectedIndex]!, "predefined");
            }
          },

          render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const lines: string[] = [];
            const add = (line: string = "") => lines.push(truncateToWidth(line, width));
            const border = theme.fg("accent", "─".repeat(Math.max(width - 1, 1)));

            add(border);
            add(theme.fg("accent", theme.bold(questions.length === 1 ? " Ask user" : ` Ask user (${questions.length} questions)`)));

            if (questions.length > 1) {
              const tabs = questions
                .map((item, index) => {
                  const active = index === activeQuestionIndex && !reviewMode;
                  const answered = isAnswered(index);
                  const marker = answered ? "●" : "○";
                  const label = `${index + 1}:${marker}`;
                  if (active) return theme.bg("selectedBg", ` ${label} `);
                  return theme.fg(answered ? "success" : "muted", ` ${label} `);
                })
                .join(" ");
              add(` ${tabs}`);
              add();
            }

            if (reviewMode) {
              add(theme.fg("text", " Review answers"));
              add();
              for (let i = 0; i < questions.length; i++) {
                const isSelected = i === selectedIndex;
                const prefix = isSelected ? theme.fg("accent", "› ") : "  ";
                const item = answers[i]!;
                const source = item.source === "custom" ? theme.fg("muted", "(custom) ") : "";
                add(`${prefix}${i + 1}. ${theme.fg("text", questions[i]!.question)}`);
                add(`   ${source}${theme.fg("accent", item.answer)}`);
              }
              const submitSelected = selectedIndex === questions.length;
              add();
              add(`${submitSelected ? theme.fg("accent", "› ") : "  "}${theme.fg(submitSelected ? "accent" : "success", "Submit answers")}`);
              add();
              add(theme.fg("dim", " ↑↓ or j/k navigate • Enter edit/submit"));
              add(border);
              cachedLines = lines;
              return lines;
            }

            add(` ${theme.fg("text", questions[activeQuestionIndex]!.question)}`);
            add();

            const options = getOptions(activeQuestionIndex);
            for (let i = 0; i < options.length; i++) {
              const isSelected = i === selectedIndex;
              const option = options[i]!;
              const prefix = isSelected ? theme.fg("accent", "› ") : "  ";
              const text = isSelected ? theme.fg("accent", option) : theme.fg("text", option);
              add(`${prefix}${i + 1}. ${text}`);
            }

            const currentAnswer = answers[activeQuestionIndex];
            if (currentAnswer) {
              add();
              add(`${theme.fg("muted", " Current answer:")} ${theme.fg("accent", currentAnswer.answer)}`);
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
              if (questions.length === 1) {
                add(theme.fg("dim", " ↑↓ or j/k navigate • Enter select"));
              } else {
                add(theme.fg("dim", " ↑↓ or j/k navigate • ←→ or h/l switch questions • Enter select"));
              }
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

      const details: AskUserDetails = {
        mode: result.length === 1 ? "single" : "multi",
        items: result,
      };

      const text = result.length === 1
        ? result[0]!.answer
        : JSON.stringify(result.map((item) => item.answer));

      return {
        content: [{ type: "text", text }],
        details,
      };
    },

    renderCall(args, theme) {
      const questions = Array.isArray(args.questions)
        ? args.questions
        : args.question && Array.isArray(args.answers)
          ? [{ question: args.question, answers: args.answers }]
          : [];

      if (questions.length <= 1) {
        const question = questions[0]?.question ?? args.question ?? "";
        const answers = Array.isArray(questions[0]?.answers) ? questions[0].answers : [];
        let text = theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", question);
        if (answers.length > 0) {
          text += `\n${theme.fg("dim", `  choices: ${answers.join(", ")} + custom`)}`;
        }
        return new Text(text, 0, 0);
      }

      return new Text(
        theme.fg("toolTitle", theme.bold("ask_user ")) +
          theme.fg("muted", `${questions.length} questions`) +
          `\n${theme.fg("dim", `  questions: ${questions.map((q: { question: string }) => q.question).join(" | ")}`)}`,
        0,
        0,
      );
    },

    renderResult(result, _options, theme) {
      const details = result.details as AskUserDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      if (details.mode === "single") {
        const item = details.items[0]!;
        const prefix = item.source === "custom" ? "(custom) " : "";
        return new Text(theme.fg("success", "✓ ") + theme.fg("accent", `${prefix}${item.answer}`), 0, 0);
      }
      return new Text(
        details.items
          .map((item, index) => {
            const prefix = item.source === "custom" ? theme.fg("muted", "(custom) ") : "";
            return `${theme.fg("success", "✓ ")}${theme.fg("muted", `${index + 1}. `)}${prefix}${theme.fg("accent", item.answer)}`;
          })
          .join("\n"),
        0,
        0,
      );
    },
  });
}
