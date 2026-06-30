import {
  Circle, Square, AlignLeft, Type, List, SlidersHorizontal,
  Calendar, Clock, Grid3x3, CheckSquare, Upload,
} from "lucide-react";
import type { ParsedQuestion } from "../lib/api";

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

const LABELS: Record<ParsedQuestion["type"], string> = {
  SHORT: "Short answer",
  PARAGRAPH: "Paragraph",
  MCQ: "Multiple choice",
  CHECKBOX: "Checkboxes",
  DROPDOWN: "Dropdown",
  LINEAR_SCALE: "Linear scale",
  DATE: "Date",
  TIME: "Time",
  GRID_MULTIPLE_CHOICE: "Multiple choice grid",
  GRID_CHECKBOX: "Checkbox grid",
  FILE_UPLOAD: "File upload",
};

export default function QuestionPreview({
  q,
  index,
  onApplySuggestion,
}: {
  q: ParsedQuestion;
  index: number;
  onApplySuggestion?: () => void;
}) {
  const Icon = ICONS[q.type];
  const showOptions = ["MCQ", "CHECKBOX", "DROPDOWN"].includes(q.type);
  const showGrid = ["GRID_MULTIPLE_CHOICE", "GRID_CHECKBOX"].includes(q.type);

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
            {index + 1}
          </div>
          <div>
            <p className="font-semibold text-ink dark:text-[#F5EDE7]">{q.title}</p>
            {q.description && (
              <p className="mt-0.5 text-xs text-ink/50 dark:text-[#F5EDE7]/50">{q.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="chip">
                <Icon className="h-3 w-3" /> {LABELS[q.type]}
              </span>
              {q.required && (
                <span className="chip border-brand/30 bg-brand/5 text-brand-700">Required</span>
              )}
              {q.type === "FILE_UPLOAD" && (
                <span className="chip border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  ⚠ link-based fallback
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {q.suggestedTitle && (
        <div className="mb-3 ml-10 rounded-xl border border-brand/20 bg-peach/30 p-3 text-sm dark:bg-white/5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">
            Suggested rewording
          </div>
          <p className="text-ink/80 dark:text-[#F5EDE7]/80">{q.suggestedTitle}</p>
          {q.clarityNote && (
            <p className="mt-1 text-xs text-ink/60 dark:text-[#F5EDE7]/60">{q.clarityNote}</p>
          )}
          {onApplySuggestion && (
            <button
              type="button"
              onClick={onApplySuggestion}
              className="mt-2 text-xs font-semibold text-brand hover:underline"
            >
              Apply suggestion
            </button>
          )}
        </div>
      )}

      {/* MCQ / Checkbox / Dropdown options */}
      {showOptions && q.options && q.options.length > 0 && (
        <ul className="ml-10 space-y-1.5">
          {q.options.map((opt, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-ink/70 dark:text-[#F5EDE7]/70">
              <Icon className="h-3.5 w-3.5" /> {opt}
            </li>
          ))}
        </ul>
      )}

      {/* Linear scale */}
      {q.type === "LINEAR_SCALE" && (
        <div className="ml-10 flex items-center gap-3 text-sm text-ink/70 dark:text-[#F5EDE7]/70">
          <span>{q.scaleMinLabel || q.scaleMin || 1}</span>
          <div className="flex gap-1">
            {Array.from({ length: (q.scaleMax ?? 5) - (q.scaleMin ?? 1) + 1 }).map((_, i) => (
              <div key={i} className="h-3 w-3 rounded-full border border-ink/30" />
            ))}
          </div>
          <span>{q.scaleMaxLabel || q.scaleMax || 5}</span>
        </div>
      )}

      {/* Date */}
      {q.type === "DATE" && (
        <p className="ml-10 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
          📅 Date{q.includeYear === false ? " (no year)" : ""}{q.includeTime ? " + time" : ""}
        </p>
      )}

      {/* Time */}
      {q.type === "TIME" && (
        <p className="ml-10 text-sm text-ink/60 dark:text-[#F5EDE7]/60">🕐 Time of day</p>
      )}

      {/* Grid */}
      {showGrid && (
        <div className="ml-10 overflow-x-auto">
          <table className="text-sm text-ink/70 dark:text-[#F5EDE7]/70">
            <thead>
              <tr>
                <th className="pr-3 pb-1 text-left text-xs text-ink/40">Rows \ Columns</th>
                {(q.options || []).map((col, i) => (
                  <th key={i} className="px-2 pb-1 text-xs font-normal">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.rows || []).map((row, ri) => (
                <tr key={ri}>
                  <td className="pr-3 py-1 text-xs">{row}</td>
                  {(q.options || []).map((_, ci) => (
                    <td key={ci} className="px-2 py-1 text-center">
                      <Icon className="inline h-3.5 w-3.5 text-ink/30" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Short / Paragraph / File upload — no preview needed, just the type chip above */}
      {(q.type === "SHORT" || q.type === "PARAGRAPH" || q.type === "FILE_UPLOAD") && (
        <div className="ml-10">
          <div className="rounded-xl border border-dashed border-ink/15 px-3 py-2 text-xs text-ink/40 dark:text-[#F5EDE7]/40">
            {q.type === "PARAGRAPH" ? "Long answer text" : q.type === "FILE_UPLOAD" ? "Link to file" : "Short answer text"}
          </div>
        </div>
      )}
    </div>
  );
}