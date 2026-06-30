export type QuestionType =
  | "multiple_choice"
  | "checkbox"
  | "true_false"
  | "short_answer"
  | "paragraph";

export interface ParsedOption {
  label: string;   // "A", "B", "C" or "1", "2"
  text: string;
}

export interface ParsedQuestion {
  index: number;
  type: QuestionType;
  text: string;
  options: ParsedOption[];
  required: boolean;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  usedAI: boolean;
  warning?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function detectQuestionType(
  questionText: string,
  options: ParsedOption[]
): QuestionType {
  const lower = questionText.toLowerCase();

  if (
    options.length === 0 &&
    (lower.includes("true or false") || lower.includes("true/false"))
  ) return "true_false";

  if (
    options.length === 2 &&
    options.every((o) =>
      ["true", "false", "yes", "no"].includes(o.text.toLowerCase())
    )
  ) return "true_false";

  if (
    /select all|choose all|mark all|all that apply/i.test(lower)
  ) return "checkbox";

  if (options.length >= 2) return "multiple_choice";

  if (
    /explain|describe|discuss|elaborate|justify|analyse|analyze|evaluate|compare/i.test(lower)
  ) return "paragraph";

  return "short_answer";
}

// ─── Option line detection ───────────────────────────────────────────────────

const OPTION_PATTERNS = [
  /^([A-Ea-e])[).:\-]\s+(.+)$/,
  /^\(([A-Ea-e])\)\s+(.+)$/,
  /^([1-5])[).:\-]\s+(.+)$/,
  /^\(([1-5])\)\s+(.+)$/,
  /^([ivxIVX]+)[).:\-]\s+(.+)$/,
];

function parseOptionLine(line: string): ParsedOption | null {
  for (const pattern of OPTION_PATTERNS) {
    const match = cleanLine(line).match(pattern);
    if (match) {
      return { label: match[1].toUpperCase(), text: match[2].trim() };
    }
  }
  return null;
}

// ─── Question number detection ───────────────────────────────────────────────

function isQuestionStart(line: string): { num: number; text: string } | null {
  const cleaned = cleanLine(line);
  const match = cleaned.match(
    /^(?:Q\.?\s*)?(\d+)[).:\-]?\s+(.+)$/i
  );
  if (match && parseInt(match[1]) <= 500) {
    return { num: parseInt(match[1]), text: match[2].trim() };
  }
  return null;
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseQuestions(rawText: string): ParseResult {
  if (!rawText || rawText.trim().length < 5) {
    return { questions: [], usedAI: false, warning: "Input text is empty." };
  }

  const lines = rawText.split(/\r?\n/);
  const questions: ParsedQuestion[] = [];

  let currentQuestion: boolean = false;
  let currentOptions: ParsedOption[] = [];
  let currentLines: string[] = [];
  let qIndex = 0;

  function flushQuestion() {
    if (!currentQuestion || !currentLines.length) return;

    const questionText = currentLines.join(" ").trim();
    if (!questionText) return;

    const type = detectQuestionType(questionText, currentOptions);

    questions.push({
      index: ++qIndex,
      type,
      text: questionText,
      options: currentOptions,
      required: true,
    });

    currentQuestion = false;
    currentOptions = [];
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = cleanLine(raw);

    if (!line) continue;

    // Skip "Answer:" lines entirely — no grading in normal forms
    if (/^(?:answer|ans|correct answer|key)\s*[:\-]/i.test(line)) {
      continue;
    }

    const qStart = isQuestionStart(line);
    if (qStart) {
      flushQuestion();
      currentQuestion = true;
      currentLines = [qStart.text];
      continue;
    }

    const option = parseOptionLine(line);
    if (option && currentQuestion) {
      currentOptions.push(option);
      continue;
    }

    if (!currentQuestion) continue;

    if (currentOptions.length === 0) {
      currentLines.push(line);
    } else {
      flushQuestion();
      currentQuestion = true;
      currentLines = [line];
    }
  }

  flushQuestion();

  if (questions.length === 0) {
    return {
      questions: [],
      usedAI: false,
      warning:
        "No questions detected. Make sure questions are numbered (e.g. '1. What is...') and options use A) B) C) format.",
    };
  }

  return { questions, usedAI: false };
}

// ─── Format for Google Forms API ─────────────────────────────────────────────

export function toFormsPayload(questions: ParsedQuestion[]) {
  return questions.map((q) => ({
    title: q.text,
    questionType: q.type,
    required: q.required,
    options: q.options.map((o) => o.text),
  }));
}