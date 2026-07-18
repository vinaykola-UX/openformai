import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Navbar from "../components/Navbar";
import ErrorCard from "../components/ErrorCard";
import { db } from "../lib/firebase";
import { createQuizForm, draftGenerate, type QuizQuestion } from "../lib/quizApi";

type Subtopic = {
  subtopicId: string;
  subtopicTitle: string;
  order: number;
  status: "pending" | "generating" | "done" | "error";
  questions: QuizQuestion[];
  error?: string | null;
};

type Unit = {
  unitId: string;
  unitTitle: string;
  order: number;
  subtopics: Subtopic[];
};

type Granularity = "per-unit" | "per-subtopic";

type FormJobStatus = "pending" | "creating" | "done" | "error";
type FormJob = {
  label: string;
  questions: QuizQuestion[];
  status: FormJobStatus;
  error?: string;
  responderUri?: string;
  editUri?: string;
};

export default function QuizDraftReview() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subjectTitle, setSubjectTitle] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [granularity, setGranularity] = useState<Granularity>("per-unit");

  const [jobs, setJobs] = useState<FormJob[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!draftId) return;
    loadDraft(draftId);
  }, [draftId]);

  async function loadDraft(id: string) {
    setLoading(true);
    setError("");
    try {
      const draftSnap = await getDoc(doc(db, "quiz_drafts", id));
      if (!draftSnap.exists()) {
        setError("This draft doesn't exist or you don't have access to it.");
        setLoading(false);
        return;
      }
      setSubjectTitle(draftSnap.data().subjectTitle || "Untitled subject");

      const unitsSnap = await getDocs(
        query(collection(db, "quiz_drafts", id, "units"), orderBy("order"))
      );

      const loadedUnits: Unit[] = [];
      for (const unitDoc of unitsSnap.docs) {
        const subtopicsSnap = await getDocs(
          query(collection(db, "quiz_drafts", id, "units", unitDoc.id, "subtopics"), orderBy("order"))
        );
        const subtopics: Subtopic[] = subtopicsSnap.docs.map((d) => {
          const data = d.data();
          return {
            subtopicId: d.id,
            subtopicTitle: data.subtopicTitle,
            order: data.order,
            status: data.status,
            questions: data.questions || [],
            error: data.error,
          };
        });
        loadedUnits.push({
          unitId: unitDoc.id,
          unitTitle: unitDoc.data().unitTitle,
          order: unitDoc.data().order,
          subtopics,
        });
      }

      setUnits(loadedUnits);
      setExpanded(Object.fromEntries(loadedUnits.map((u) => [u.unitId, true])));
    } catch (err: any) {
      setError(err.message || "Failed to load draft.");
    } finally {
      setLoading(false);
    }
  }

  function toggleUnit(unitId: string) {
    setExpanded((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  }

  function removeQuestion(unitId: string, subtopicId: string, qIndex: number) {
    setUnits((prev) =>
      prev.map((u) =>
        u.unitId !== unitId
          ? u
          : {
              ...u,
              subtopics: u.subtopics.map((s) =>
                s.subtopicId !== subtopicId
                  ? s
                  : { ...s, questions: s.questions.filter((_, i) => i !== qIndex) }
              ),
            }
      )
    );
  }

  async function regenerateSubtopic(unitId: string, subtopicId: string) {
    if (!draftId) return;
    setUnits((prev) =>
      prev.map((u) =>
        u.unitId !== unitId
          ? u
          : {
              ...u,
              subtopics: u.subtopics.map((s) =>
                s.subtopicId !== subtopicId ? s : { ...s, status: "generating", error: null }
              ),
            }
      )
    );
    try {
      const result = await draftGenerate({ draftId, unitId, subtopicId });
      setUnits((prev) =>
        prev.map((u) =>
          u.unitId !== unitId
            ? u
            : {
                ...u,
                subtopics: u.subtopics.map((s) =>
                  s.subtopicId !== subtopicId ? s : { ...s, status: "done", questions: result.questions, error: null }
                ),
              }
        )
      );
    } catch (err: any) {
      setUnits((prev) =>
        prev.map((u) =>
          u.unitId !== unitId
            ? u
            : {
                ...u,
                subtopics: u.subtopics.map((s) =>
                  s.subtopicId !== subtopicId ? s : { ...s, status: "error", error: err.message || "Failed" }
                ),
              }
        )
      );
    }
  }

  const totalQuestions = units.reduce(
    (sum, u) => sum + u.subtopics.reduce((s2, s) => s2 + s.questions.length, 0),
    0
  );

  function buildJobs(): FormJob[] {
    if (granularity === "per-unit") {
      return units
        .map((u) => ({
          label: `${subjectTitle} — ${u.unitTitle}`,
          questions: u.subtopics.flatMap((s) => s.questions),
        }))
        .filter((j) => j.questions.length > 0)
        .map((j) => ({ ...j, status: "pending" as const }));
    }
    return units
      .flatMap((u) =>
        u.subtopics.map((s) => ({
          label: `${subjectTitle} — ${u.unitTitle} — ${s.subtopicTitle}`,
          questions: s.questions,
        }))
      )
      .filter((j) => j.questions.length > 0)
      .map((j) => ({ ...j, status: "pending" as const }));
  }

  async function createForms() {
    const built = buildJobs();
    if (built.length === 0) {
      setError("No questions to create forms from.");
      return;
    }
    setError("");
    setJobs(built);
    setCreating(true);

    for (let i = 0; i < built.length; i++) {
      setJobs((prev) => prev!.map((j, idx) => (idx === i ? { ...j, status: "creating" } : j)));
      try {
        const result = await createQuizForm({
          title: built[i].label,
          questions: built[i].questions,
          mode: "quiz",
        });
        setJobs((prev) =>
          prev!.map((j, idx) =>
            idx === i
              ? { ...j, status: "done", responderUri: result.responderUri, editUri: result.editUri }
              : j
          )
        );
      } catch (err: any) {
        setJobs((prev) =>
          prev!.map((j, idx) => (idx === i ? { ...j, status: "error", error: err.message || "Failed" } : j))
        );
        // Daily/total limit hit — stop the loop, don't keep failing.
        if (err.code === "DAILY_LIMIT_REACHED" || err.code === "LIMIT_REACHED") {
          setError(err.message);
          break;
        }
      }
    }
    setCreating(false);
  }

  async function retryJob(i: number) {
    if (!jobs) return;
    setJobs((prev) => prev!.map((j, idx) => (idx === i ? { ...j, status: "creating", error: undefined } : j)));
    try {
      const result = await createQuizForm({
        title: jobs[i].label,
        questions: jobs[i].questions,
        mode: "quiz",
      });
      setJobs((prev) =>
        prev!.map((j, idx) =>
          idx === i ? { ...j, status: "done", responderUri: result.responderUri, editUri: result.editUri } : j
        )
      );
    } catch (err: any) {
      setJobs((prev) => prev!.map((j, idx) => (idx === i ? { ...j, status: "error", error: err.message || "Failed" } : j)));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream dark:bg-[#1A0E12]">
        <Navbar />
        <div className="flex items-center justify-center p-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream dark:bg-[#1A0E12]">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <button onClick={() => nav("/dashboard")} className="mb-4 flex items-center gap-1 text-sm text-ink/60 hover:text-brand">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {error && <ErrorCard error={error} className="mb-4" />}

        {!jobs && (
          <>
            <div className="mb-6">
              <h1 className="font-display text-2xl font-bold text-ink dark:text-[#F5EDE7]">{subjectTitle}</h1>
              <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
                {units.length} units · {totalQuestions} questions total
              </p>
            </div>

            <div className="card mb-4 p-5">
              <p className="label mb-2">When you create the Google Forms:</p>
              <div className="flex gap-2">
                <GranularityButton active={granularity === "per-unit"} onClick={() => setGranularity("per-unit")}>
                  One form per unit
                </GranularityButton>
                <GranularityButton active={granularity === "per-subtopic"} onClick={() => setGranularity("per-subtopic")}>
                  One form per subtopic
                </GranularityButton>
              </div>
            </div>

            <div className="space-y-3">
              {units.map((u) => (
                <div key={u.unitId} className="card overflow-hidden">
                  <button
                    onClick={() => toggleUnit(u.unitId)}
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <div>
                      <p className="font-semibold">{u.unitTitle}</p>
                      <p className="text-xs text-ink/50">
                        {u.subtopics.length} subtopics ·{" "}
                        {u.subtopics.reduce((s, st) => s + st.questions.length, 0)} questions
                      </p>
                    </div>
                    {expanded[u.unitId] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {expanded[u.unitId] && (
                    <div className="space-y-3 border-t border-brand/10 p-4 dark:border-white/10">
                      {u.subtopics.map((s) => (
                        <div key={s.subtopicId} className="rounded-xl border border-brand/10 p-3 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">{s.subtopicTitle}</p>
                            <div className="flex items-center gap-2">
                              {s.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                              {s.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
                              {s.status === "generating" && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
                              <button
                                onClick={() => regenerateSubtopic(u.unitId, s.subtopicId)}
                                className="text-ink/40 hover:text-brand"
                                title="Regenerate"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {s.status === "error" && <p className="mt-1 text-xs text-red-500">{s.error}</p>}

                          {s.questions.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {s.questions.map((q, qi) => (
                                <li key={qi} className="flex items-start justify-between gap-2 text-xs text-ink/70 dark:text-[#F5EDE7]/70">
                                  <span className="flex-1">
                                    {qi + 1}. {q.title}
                                  </span>
                                  <button
                                    onClick={() => removeQuestion(u.unitId, s.subtopicId, qi)}
                                    className="shrink-0 text-ink/30 hover:text-red-500"
                                  >
                                    ✕
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={createForms} disabled={creating} className="btn-primary mt-5 w-full">
              <Sparkles className="h-4 w-4" />
              Create Google Forms ({granularity === "per-unit" ? units.length : units.reduce((s, u) => s + u.subtopics.length, 0)})
            </button>
          </>
        )}

        {jobs && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">
              {creating ? "Creating forms..." : "Done"} — {jobs.filter((j) => j.status === "done").length}/{jobs.length}
            </p>
            {jobs.map((j, i) => (
              <div key={i} className="card flex items-center gap-3 p-3">
                {j.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
                {j.status === "creating" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />}
                {j.status === "pending" && <div className="h-4 w-4 shrink-0 rounded-full border-2 border-ink/20" />}
                {j.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{j.label}</p>
                  {j.status === "error" && <p className="text-xs text-red-500">{j.error}</p>}
                  {j.status === "done" && j.responderUri && (
                    <a href={j.responderUri} target="_blank" rel="noreferrer" className="text-xs text-brand underline">
                      Open form
                    </a>
                  )}
                </div>
                {j.status === "error" && (
                  <button onClick={() => retryJob(i)} className="btn-secondary !py-1 !px-2 text-xs shrink-0">
                    Retry
                  </button>
                )}
              </div>
            ))}
            {!creating && (
              <button onClick={() => nav("/dashboard")} className="btn-primary w-full">
                Go to Dashboard
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function GranularityButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
        active ? "bg-brand text-white" : "bg-peach/40 text-brand-700 hover:bg-peach/60"
      }`}
    >
      {children}
    </button>
  );
}