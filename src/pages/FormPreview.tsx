import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, FileText, AlertTriangle, ListChecks, GraduationCap } from "lucide-react";

type Question = {
  title: string;
  type: string;
  options?: string[];
  required?: boolean;
  description?: string;
  points?: number;
  correctAnswer?: string | string[];
};

type FormData = {
  title: string;
  questionCount: number;
  createdAt?: string | null;
  questions?: Question[];
  isQuiz?: boolean;
};

const TYPE_LABELS: Record<string, string> = {
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

export default function FormPreview() {
  const { formId } = useParams<{ formId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormData | null>(null);

  useEffect(() => {
    if (!formId) return;
    loadForm();
  }, [formId]);

  function tryLoadDraftFromHash(): FormData | null {
    try {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const d = params.get("d");
      if (!d) return null;
      const json = decodeURIComponent(
        escape(atob(d.replace(/-/g, "+").replace(/_/g, "/")))
      );
      const parsed = JSON.parse(json);
      return {
        title: parsed.title || "Untitled draft",
        questionCount: parsed.questions?.length || 0,
        questions: parsed.questions || [],
        isQuiz: parsed.isQuiz || false,
      };
    } catch {
      return null;
    }
  }

  async function loadForm() {
    setLoading(true);
    setError("");

    // Draft mode — data is in URL hash, no network call needed
    if (formId === "draft") {
      const draft = tryLoadDraftFromHash();
      if (!draft) {
        setError("This draft preview link is invalid or incomplete.");
      } else {
        setForm(draft);
      }
      setLoading(false);
      return;
    }

    // Saved form — call public API (admin SDK, bypasses Firestore auth rules)
    try {
      const res = await fetch(`/api/preview-form?formId=${encodeURIComponent(formId!)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Form not found or this link has expired.");
      } else {
        setForm(json);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load form.");
    } finally {
      setLoading(false);
    }
  }

  const isQuiz = form?.isQuiz;

  return (
    <div className="flex min-h-screen flex-col bg-cream dark:bg-[#1A0E12]">
      {/* Minimal navbar */}
      <header className="border-b border-brand/10 bg-white px-4 py-3 dark:border-white/5 dark:bg-[#1A0E12]">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-white">
              <FileText className="h-4 w-4" />
            </div>
            <span className="font-display font-bold text-ink dark:text-[#F5EDE7]">
              OpenForm
            </span>
          </Link>
          <Link to="/signup" className="btn-primary !py-2 !px-4 text-xs">
            Create free account
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        {/* Loading */}
        {loading && (
          <div className="card flex items-center justify-center gap-3 p-16 text-sm text-ink/60">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading preview...
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card flex flex-col items-center justify-center gap-4 p-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-500">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="font-display text-lg font-bold">Form not found</h2>
            <p className="max-w-sm text-sm text-ink/60">{error}</p>
            <Link to="/" className="btn-primary mt-2">
              Go to OpenForm
            </Link>
          </div>
        )}

        {/* Preview */}
        {!loading && !error && form && (
          <div className="space-y-6">
            {/* Title card */}
            <div className="card p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-white">
                  {isQuiz ? (
                    <GraduationCap className="h-5 w-5" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h1 className="font-display text-2xl font-bold text-ink dark:text-[#F5EDE7]">
                    {form.title}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="chip">
                      <ListChecks className="h-3 w-3" />
                      {form.questionCount} questions
                    </span>
                    {isQuiz && (
                      <span className="chip bg-brand/10 text-brand-700">
                        Graded quiz
                      </span>
                    )}
                    <span className="chip bg-green-50 text-green-700">
                      Preview only
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Questions */}
            {form.questions && form.questions.length > 0 ? (
              <div className="space-y-3">
                {form.questions.map((q, i) => (
                  <div key={i} className="card p-5">
                    <div className="flex items-start gap-3">
                      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-ink dark:text-[#F5EDE7]">
                          {q.title}
                        </p>
                        {q.description && (
                          <p className="mt-1 text-xs text-ink/50 dark:text-[#F5EDE7]/50">
                            {q.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="chip text-xs">
                            {TYPE_LABELS[q.type] || q.type}
                          </span>
                          {q.required && (
                            <span className="chip bg-brand/5 text-brand-700 text-xs">
                              Required
                            </span>
                          )}
                          {isQuiz && typeof q.points === "number" && (
                            <span className="chip bg-peach text-brand-700 text-xs">
                              {q.points} {q.points === 1 ? "pt" : "pts"}
                            </span>
                          )}
                        </div>

                        {/* Options */}
                        {q.options && q.options.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {q.options.map((opt, j) => {
                              const isCorrect =
                                isQuiz &&
                                (Array.isArray(q.correctAnswer)
                                  ? q.correctAnswer.includes(opt)
                                  : q.correctAnswer === opt);
                              return (
                                <li
                                  key={j}
                                  className={`flex items-center gap-2 text-sm ${
                                    isCorrect
                                      ? "font-medium text-green-700 dark:text-green-400"
                                      : "text-ink/70 dark:text-[#F5EDE7]/70"
                                  }`}
                                >
                                  <div
                                    className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                                      isCorrect
                                        ? "border-green-500 bg-green-100"
                                        : "border-ink/30"
                                    }`}
                                  />
                                  {opt}
                                  {isCorrect && (
                                    <span className="text-xs text-green-600">✓</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {/* Model answer for short/paragraph in quiz */}
                        {isQuiz && q.correctAnswer && !q.options?.length && (
                          <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/20">
                            <p className="text-xs font-medium text-green-700 dark:text-green-400">
                              Model answer
                            </p>
                            <p className="mt-0.5 text-sm text-green-800 dark:text-green-300">
                              {Array.isArray(q.correctAnswer)
                                ? q.correctAnswer.join(", ")
                                : q.correctAnswer}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
                <p className="text-sm text-ink/60">
                  Question details not available in preview.
                </p>
                <p className="text-xs text-ink/40">
                  Open the form link to see and answer questions.
                </p>
              </div>
            )}

            {/* CTA */}
            <div className="card flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm font-semibold text-ink dark:text-[#F5EDE7]">
                Want to create {isQuiz ? "quizzes" : "forms"} like this instantly?
              </p>
              <p className="text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                OpenForm converts any text, PDF, or image into a Google Form in seconds.
              </p>
              <Link to="/signup" className="btn-primary">
                Try OpenForm free →
              </Link>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-brand/10 px-4 py-4 text-center text-xs text-ink/40 dark:border-white/5 dark:text-[#F5EDE7]/40">
        © 2026 OpenForm · Built for educators ·{" "}
        <Link to="/" className="hover:text-brand">
          openformai.vercel.app
        </Link>
      </footer>
    </div>
  );
}