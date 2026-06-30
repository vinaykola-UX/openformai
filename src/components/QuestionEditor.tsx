import { useState } from "react";
import {
  Pencil, Trash2, Plus, ChevronDown, Copy,
  Circle, Square, AlignLeft, Type, List, SlidersHorizontal,
  Calendar, Clock, Grid3x3, CheckSquare, Upload,
} from "lucide-react";
import type { ParsedQuestion } from "../lib/api";

const TYPE_OPTIONS: { value: ParsedQuestion["type"]; label: string }[] = [
  { value: "SHORT", label: "Short answer" },
  { value: "PARAGRAPH", label: "Paragraph" },
  { value: "MCQ", label: "Multiple choice" },
  { value: "CHECKBOX", label: "Checkboxes" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "LINEAR_SCALE", label: "Linear scale" },
  { value: "DATE", label: "Date" },
  { value: "TIME", label: "Time" },
  { value: "GRID_MULTIPLE_CHOICE", label: "Multiple choice grid" },
  { value: "GRID_CHECKBOX", label: "Checkbox grid" },
  { value: "FILE_UPLOAD", label: "File upload" },
];

const ICONS: Record<ParsedQuestion["type"], typeof Circle> = {
  SHORT: Type,
  PARAGRAPH: AlignLeft,
  MCQ: Circle,
  CHECKBOX: Square,
  DROPDOWN: List,
  LINEAR_SCALE: SlidersHorizontal,
  DATE: Calendar,
  TIME: Clock,
  GRID_MULTIPLE_CHOICE: Grid3x3,
  GRID_CHECKBOX: CheckSquare,
  FILE_UPLOAD: Upload,
};

// ─── Single Question Card ─────────────────────────────────────────────────────

function QuestionCard({
  q,
  index,
  total,
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: {
  q: ParsedQuestion;
  index: number;
  total: number;
  onChange: (q: ParsedQuestion) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const Icon = ICONS[q.type];

  function setField<K extends keyof ParsedQuestion>(key: K, val: ParsedQuestion[K]) {
    onChange({ ...q, [key]: val });
  }

  function addOption() {
    onChange({ ...q, options: [...(q.options || []), "New option"] });
  }
  function updateOption(i: number, val: string) {
    const opts = [...(q.options || [])];
    opts[i] = val;
    onChange({ ...q, options: opts });
  }
  function removeOption(i: number) {
    onChange({ ...q, options: (q.options || []).filter((_, idx) => idx !== i) });
  }

  function addRow() {
    onChange({ ...q, rows: [...(q.rows || []), "New row"] });
  }
  function updateRow(i: number, val: string) {
    const rows = [...(q.rows || [])];
    rows[i] = val;
    onChange({ ...q, rows });
  }
  function removeRow(i: number) {
    onChange({ ...q, rows: (q.rows || []).filter((_, idx) => idx !== i) });
  }

  const showOptions = ["MCQ", "CHECKBOX", "DROPDOWN", "GRID_MULTIPLE_CHOICE", "GRID_CHECKBOX"].includes(q.type);
  const showRows = ["GRID_MULTIPLE_CHOICE", "GRID_CHECKBOX"].includes(q.type);
  const showScale = q.type === "LINEAR_SCALE";
  const showDateOpts = q.type === "DATE";
  const showTimeOpts = q.type === "TIME";
  const optionLabel = showRows ? "Columns" : "Options";

  return (
    <div className="card p-4 transition-shadow hover:shadow-glow">
      <div className="flex items-start gap-3">
        {/* Reorder + number */}
        <div className="flex flex-col items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="text-ink/30 hover:text-brand disabled:opacity-20 text-xs">▲</button>
          <div className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">
            {index + 1}
          </div>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="text-ink/30 hover:text-brand disabled:opacity-20 text-xs">▼</button>
        </div>

        <div className="flex-1 min-w-0">
          {/* Question title */}
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

          {/* Description */}
          {editing && (
            <input
              value={q.description || ""}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Description (optional)"
              className="input text-xs mt-2"
            />
          )}

          {/* Type + required */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={q.type}
                onChange={(e) => {
                  const newType = e.target.value as ParsedQuestion["type"];
                  const updates: Partial<ParsedQuestion> = { type: newType };
                  if (["MCQ", "CHECKBOX", "DROPDOWN"].includes(newType) && !q.options?.length) {
                    updates.options = ["Option 1", "Option 2"];
                  }
                  if (["GRID_MULTIPLE_CHOICE", "GRID_CHECKBOX"].includes(newType)) {
                    if (!q.options?.length) updates.options = ["Column 1", "Column 2"];
                    if (!q.rows?.length) updates.rows = ["Row 1", "Row 2"];
                  }
                  if (newType === "LINEAR_SCALE") {
                    updates.scaleMin = q.scaleMin ?? 1;
                    updates.scaleMax = q.scaleMax ?? 5;
                  }
                  if (newType === "DATE") {
                    updates.includeYear = q.includeYear ?? true;
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

            <button
              type="button"
              onClick={() => setField("required", !q.required)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                q.required ? "bg-brand text-white" : "bg-peach/40 text-brand-700"
              }`}
            >
              {q.required ? "Required" : "Optional"}
            </button>

            {q.type === "FILE_UPLOAD" && (
              <span className="text-xs text-amber-700">⚠ link-based fallback (API limitation)</span>
            )}
          </div>

          {/* Rows (for grids) */}
          {showRows && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-ink/50">Rows</p>
              {(q.rows || []).map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={row}
                    onChange={(e) => updateRow(i, e.target.value)}
                    className="flex-1 rounded-xl border border-brand/10 bg-white dark:bg-[#241218] px-3 py-1.5 text-sm outline-none focus:border-brand"
                  />
                  <button type="button" onClick={() => removeRow(i)}
                    disabled={(q.rows?.length ?? 0) <= 1}
                    className="text-ink/30 hover:text-red-500 disabled:opacity-20">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addRow}
                className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <Plus className="h-3 w-3" /> Add row
              </button>
            </div>
          )}

          {/* Options (or grid columns) */}
          {showOptions && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-ink/50">{optionLabel}</p>
              {(q.options || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-ink/40" />
                  <input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    className="flex-1 rounded-xl border border-brand/10 bg-white dark:bg-[#241218] px-3 py-1.5 text-sm outline-none focus:border-brand"
                  />
                  <button type="button" onClick={() => removeOption(i)}
                    disabled={(q.options?.length ?? 0) <= 1}
                    className="text-ink/30 hover:text-red-500 disabled:opacity-20">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addOption}
                className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <Plus className="h-3 w-3" /> Add {showRows ? "column" : "option"}
              </button>
            </div>
          )}

          {/* Linear scale settings */}
          {showScale && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink/50">From</span>
                <input
                  type="number"
                  value={q.scaleMin ?? 1}
                  onChange={(e) => setField("scaleMin", Number(e.target.value))}
                  className="w-14 rounded-xl border border-brand/10 bg-white dark:bg-[#241218] px-2 py-1 text-sm outline-none"
                />
                <span className="text-xs text-ink/50">to</span>
                <input
                  type="number"
                  value={q.scaleMax ?? 5}
                  onChange={(e) => setField("scaleMax", Number(e.target.value))}
                  className="w-14 rounded-xl border border-brand/10 bg-white dark:bg-[#241218] px-2 py-1 text-sm outline-none"
                />
              </div>
              <input
                value={q.scaleMinLabel || ""}
                onChange={(e) => setField("scaleMinLabel", e.target.value)}
                placeholder="Low label (optional)"
                className="flex-1 min-w-[120px] rounded-xl border border-brand/10 bg-white dark:bg-[#241218] px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
              <input
                value={q.scaleMaxLabel || ""}
                onChange={(e) => setField("scaleMaxLabel", e.target.value)}
                placeholder="High label (optional)"
                className="flex-1 min-w-[120px] rounded-xl border border-brand/10 bg-white dark:bg-[#241218] px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
            </div>
          )}

          {/* Date settings */}
          {showDateOpts && (
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-xs text-ink/60">
                <input
                  type="checkbox"
                  checked={q.includeYear ?? true}
                  onChange={(e) => setField("includeYear", e.target.checked)}
                />
                Include year
              </label>
              <label className="flex items-center gap-2 text-xs text-ink/60">
                <input
                  type="checkbox"
                  checked={q.includeTime ?? false}
                  onChange={(e) => setField("includeTime", e.target.checked)}
                />
                Include time
              </label>
            </div>
          )}

          {/* Time settings */}
          {showTimeOpts && (
            <p className="mt-3 text-xs text-ink/50">Respondents will pick a time of day.</p>
          )}

          {q.type === "FILE_UPLOAD" && (
            <p className="mt-3 text-xs text-ink/50">
              Google Forms API doesn't support creating native file-upload fields.
              This will be created as a short-answer field asking respondents to paste a link.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 shrink-0">
          <button type="button" onClick={() => setEditing(!editing)}
            className="rounded-xl p-1.5 text-ink/40 hover:bg-brand/10 hover:text-brand transition">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDuplicate}
            className="rounded-xl p-1.5 text-ink/40 hover:bg-brand/10 hover:text-brand transition">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete}
            className="rounded-xl p-1.5 text-ink/40 hover:bg-red-50 hover:text-red-500 transition">
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

  function duplicateQuestion(i: number) {
    const copy = { ...questions[i] };
    const next = [...questions];
    next.splice(i + 1, 0, copy);
    onChange(next);
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
      type: "SHORT",
      title: "New question",
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
          onDuplicate={() => duplicateQuestion(i)}
          onMoveUp={() => moveUp(i)}
          onMoveDown={() => moveDown(i)}
        />
      ))}

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