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

export default function QuestionPreview({ q, index }: { q: ParsedQuestion; index: number }) {
  const Icon = ICONS[q.type];
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
            {index + 1}
          </div>
          <div>
            <p className="font-semibold text-ink dark:text-[#F5EDE7]">{q.title}</p>
            <span className="chip mt-2">
              <Icon className="h-3 w-3" /> {LABELS[q.type]}
              {q.points ? ` · ${q.points} pts` : ""}
            </span>
          </div>
        </div>
      </div>
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
