import { useState } from "react";
import {
  Pencil, Trash2, Plus, GripVertical, ChevronDown,
  CheckCircle2, Circle, Square, AlignLeft, Type, Check
} from "lucide-react";
import type { ParsedQuestion } from "../lib/api";

const TYPE_OPTIONS: { value: ParsedQuestion["type"]; label: string }[] = [
  { value: "MCQ", label: "Multiple choice" },
  { value: "CHECKBOX", label: "Checkboxes" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "SHORT", label: "Short answer" },
  { value: "PARAGRAPH", label: "Paragraph" },
];

const ICONS: Record<ParsedQuestion["type"], typeof Circle> = {
  MCQ: Circle,
  CHECKBOX: Square,
  TRUE_FALSE: CheckCircle2,
  SHORT: Type,
  PARAGRAPH: AlignLeft,
};

// ─── Single Question Card ─────────────────────────────────────────────────────

function QuestionCard({
  q,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  q: ParsedQuestion;
  index: number;
  total: number;
  onChange: (q: ParsedQuestion) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const Icon = ICONS[q.type];

  function setField<K extends keyof ParsedQuestion>(key: K, val: ParsedQuestion[K]) {
    onChange({ ...q, [key]: val });
  }

  function addOption() {
    const opts = [...(q.options || []), "New option"];
    onChange({ ...q, options: opts });
  }

  function updateOption(i: number, val: string) {
    const opts = [...(q.options || [])];
    opts[i] = val;
    onChange({ ...q, options: opts });
  }

  function removeOption(i: number) {
    const opts = (q.options || []).filter((_, idx) => idx !== i);
    onChange({ ...q, options: opts });
  }

  function toggleCorrect(opt: string) {
    if (q.type === "CHECKBOX") {
      const current = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
      const next = current.includes(opt)
        ? current.filter((x) => x !== opt)
        : [...current, opt];
      setField("correctAnswer", next);
    } else {
      setField("correctAnswer", opt);
    }
  }

  const showOptions = q.type === "MCQ" || q.type === "CHECKBOX" || q.type === "TRUE_FALSE";

  return (
    <div className="card p-4 transition-shadow hover:shadow-glow">
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Drag handle + number */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-ink/30 hover:text-brand disabled:opacity-20 text-xs"
          >
            ▲
          </button>
          <div className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">
            {index + 1}
          </div>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="text-ink/30 hover:text-brand disabled:opacity-20 text-xs"
          >
            ▼
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Question text */}
          {editing ? (
            <textarea
              rows={2}
              value={q.title}
              onChange={(e) => setField("title", e.target.value)}
              className="input text-sm font-semibold w-full"
              autoFocus
            />
          ) : (
            <p
              className="font-semibold text-ink dark:text-[#F5EDE7] cursor-pointer hover:text-brand"
              onClick={() => setEditing(true)}
            >
              {q.title || "Click to edit question"}
            </p>
          )}

          {/* Type selector + meta */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Type dropdown */}
            <div className="relative">
              <select
                value={q.type}
                onChange={(e) => {
                  const newType = e.target.value as ParsedQuestion["type"];
                  const updates: Partial<ParsedQuestion> = { type: newType };
                  // Auto-add True/False options
                  if (newType === "TRUE_FALSE") {
                    updates.options = ["True", "False"];
                    updates.correctAnswer = undefined;
                  }
                  // Clear options for short/paragraph
                  if (newType === "SHORT" || newType === "PARAGRAPH") {
                    updates.options = [];
                    updates.correctAnswer = undefined;
                  }
                  // Add default options for MCQ/CHECKBOX if none
                  if ((newType === "MCQ" || newType === "CHECKBOX") && !q.options?.length) {
                    updates.options = ["Option A", "Option B"];
                  }
                  onChange({ ...q, ...updates });
                }}
                className="appearance-none rounded-full bg-peach/40 pl-3 pr-7 py-1 text-xs font-semibold text-brand-700 border-none outline-none cursor-pointer"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-brand-700" />
            </div>

            {/* Points */}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={q.points ?? 1}
                onChange={(e) => setField("points", Number(e.target.value))}
                className="w-12 rounded-full bg-peach/40 px-2 py-1 text-xs font-semibold text-brand-700 text-center border-none outline-none"
              />
              <span className="text-xs text-ink/50">pts</span>
            </div>

            {/* Required toggle */}
            <button
              type="button"
              onClick={() => setField("required", !q.required)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                q.required
                  ? "bg-brand text-white"
                  : "bg-peach/40 text-brand-700"
              }`}
            >
              {q.required ? "Required" : "Optional"}
            </button>
          </div>

          {/* Options */}
          {showOptions && (
            <div className="mt-3 space-y-2">
              {(q.type === "TRUE_FALSE" ? ["True", "False"] : q.options || []).map((opt, i) => {
                const isCorrect = Array.isArray(q.correctAnswer)
                  ? q.correctAnswer.includes(opt)
                  : q.correctAnswer === opt;
                const isTF = q.type === "TRUE_FALSE";

                return (
                  <div key={i} className="flex items-center gap-2">
                    {/* Correct answer toggle */}
                    <button
                      type="button"
                      onClick={() => toggleCorrect(opt)}
                      className={`shrink-0 h-4 w-4 rounded-full border-2 transition flex items-center justify-center ${
                        isCorrect
                          ? "border-brand bg-brand text-white"
                          : "border-ink/30"
                      }`}
                    >
                      {isCorrect && <Check className="h-2.5 w-2.5" />}
                    </button>

                    {/* Option text */}
                    {isTF ? (
                      <span className="text-sm text-ink/80 dark:text-[#F5EDE7]/80">{opt}</span>
                    ) : (
                      <input
                        value={opt}
                        onChange={(e) => updateOption(i, e.target.value)}
                        className="flex-1 rounded-xl border border-brand/10 bg-white dark:bg-[#241218] px-3 py-1.5 text-sm outline-none focus:border-brand"
                      />
                    )}

                    {/* Remove option */}
                    {!isTF && (
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        disabled={(q.options?.length ?? 0) <= 1}
                        className="text-ink/30 hover:text-red-500 disabled:opacity-20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add option button */}
              {!["TRUE_FALSE"].includes(q.type) && (
                <button
                  type="button"
                  onClick={addOption}
                  className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add option
                </button>
              )}
            </div>
          )}

          {/* Short/Paragraph answer hint */}
          {(q.type === "SHORT" || q.type === "PARAGRAPH") && (
            <div className="mt-3">
              <input
                value={typeof q.correctAnswer === "string" ? q.correctAnswer : ""}
                onChange={(e) => setField("correctAnswer", e.target.value)}
                placeholder="Expected answer (optional)"
                className="input text-sm"
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="rounded-xl p-1.5 text-ink/40 hover:bg-brand/10 hover:text-brand transition"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl p-1.5 text-ink/40 hover:bg-red-50 hover:text-red-500 transition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Question Editor List ─────────────────────────────────────────────────────

export default function QuestionEditor({
  questions,
  onChange,
}: {
  questions: ParsedQuestion[];
  onChange: (questions: ParsedQuestion[]) => void;
}) {
  function updateQuestion(i: number, q: ParsedQuestion) {
    const next = [...questions];
    next[i] = q;
    onChange(next);
  }

  function deleteQuestion(i: number) {
    onChange(questions.filter((_, idx) => idx !== i));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...questions];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  }

  function moveDown(i: number) {
    if (i === questions.length - 1) return;
    const next = [...questions];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChange(next);
  }

  function addQuestion() {
    const newQ: ParsedQuestion = {
      type: "MCQ",
      title: "New question",
      options: ["Option A", "Option B"],
      correctAnswer: undefined,
      points: 1,
      required: true,
    };
    onChange([...questions, newQ]);
  }

  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <QuestionCard
          key={i}
          q={q}
          index={i}
          total={questions.length}
          onChange={(updated) => updateQuestion(i, updated)}
          onDelete={() => deleteQuestion(i)}
          onMoveUp={() => moveUp(i)}
          onMoveDown={() => moveDown(i)}
        />
      ))}

      {/* Add new question */}
      <button
        type="button"
        onClick={addQuestion}
        className="w-full rounded-2xl border-2 border-dashed border-brand/20 py-4 text-sm font-semibold text-brand/60 hover:border-brand hover:text-brand transition"
      >
        <Plus className="inline h-4 w-4 mr-1" /> Add question
      </button>
    </div>
  );
}