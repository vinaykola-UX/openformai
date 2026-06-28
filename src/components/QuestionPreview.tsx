import { CheckCircle2, Circle, Square, AlignLeft, Type } from "lucide-react";
import type { ParsedQuestion } from "../lib/api";

const ICONS: Record<ParsedQuestion["type"], typeof Circle> = {
  MCQ: Circle,
  CHECKBOX: Square,
  TRUE_FALSE: CheckCircle2,
  SHORT: Type,
  PARAGRAPH: AlignLeft,
};

const LABELS: Record<ParsedQuestion["type"], string> = {
  MCQ: "Multiple choice",
  CHECKBOX: "Checkboxes",
  TRUE_FALSE: "True / False",
  SHORT: "Short answer",
  PARAGRAPH: "Paragraph",
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
  const hasMultiCorrect =
    q.type === "MCQ" && Array.isArray(q.correctAnswer) && q.correctAnswer.length > 1;
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
            {index + 1}
          </div>
          <div>
            <p className="font-semibold text-ink dark:text-[#F5EDE7]">{q.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="chip">
                <Icon className="h-3 w-3" /> {LABELS[q.type]}
                {q.points ? ` · ${q.points} pts` : ""}
              </span>
              {typeof q.estimatedSeconds === "number" && (
                <span className="chip">~{q.estimatedSeconds}s</span>
              )}
              {hasMultiCorrect && (
                <span className="chip border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  ⚠ Multiple correct in single-answer MCQ
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
      {q.options && q.options.length > 0 && (
        <ul className="ml-10 space-y-1.5">
          {q.options.map((opt, i) => {
            const isCorrect = Array.isArray(q.correctAnswer)
              ? q.correctAnswer.includes(opt)
              : q.correctAnswer === opt;
            return (
              <li
                key={i}
                className={`flex items-center gap-2 text-sm ${
                  isCorrect ? "font-semibold text-brand" : "text-ink/70 dark:text-[#F5EDE7]/70"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {opt}
                {isCorrect && <span className="text-xs">✓ correct</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
