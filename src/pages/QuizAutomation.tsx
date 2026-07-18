import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Loader2, FileText, X, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import AppShell from "../components/AppShell";
import ErrorCard from "../components/ErrorCard";
import { extractFileText } from "../lib/api";
import {
  planUnits,
  createDraft,
  draftGenerate,
  type PlannedUnit,
  type DraftUnitRef,
  type DraftSubtopicRef,
} from "../lib/quizApi";

type UploadMode = "multi-file" | "single-file";

type FileEntry = {
  file: File;
  unitTitle: string;
};

type SubtopicProgress = {
  unitTitle: string;
  subtopicTitle: string;
  unitId: string;
  subtopicId: string;
  status: "pending" | "generating" | "done" | "error";
  error?: string;
};

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Mixed"] as const;
const QTYPES = [
  { v: "Mixed", label: "Mixed" },
  { v: "MCQ", label: "Multiple Choice" },
  { v: "CHECKBOX", label: "Checkbox" },
  { v: "TRUE_FALSE", label: "True / False" },
  { v: "SHORT", label: "Short Answer" },
  { v: "PARAGRAPH", label: "Paragraph" },
];

export default function QuizAutomation() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<UploadMode>("multi-file");
  const [subjectTitle, setSubjectTitle] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [autoSplitSubtopics, setAutoSplitSubtopics] = useState(true);

  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<string>("Mixed");
  const [qType, setQType] = useState<string>("Mixed");

  const [stage, setStage] = useState<"input" | "extracting" | "planning" | "generating" | "done">("input");
  const [stageMsg, setStageMsg] = useState("");
  const [progress, setProgress] = useState<SubtopicProgress[]>([]);
  const [error, setError] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);

  const busy = stage === "extracting" || stage === "planning" || stage === "generating";

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const newEntries = files.map((file) => ({
      file,
      unitTitle: file.name.replace(/\.[^.]+$/, ""),
    }));
    setEntries((prev) => (mode === "single-file" ? newEntries.slice(0, 1) : [...prev, ...newEntries]));
  }

  function removeEntry(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateUnitTitle(i: number, title: string) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, unitTitle: title } : e)));
  }

  function switchMode(next: UploadMode) {
    setMode(next);
    setEntries((prev) => (next === "single-file" ? prev.slice(0, 1) : prev));
  }

  async function buildDraft() {
    if (!entries.length) {
      setError("Upload at least one PDF first.");
      return;
    }
    if (!subjectTitle.trim()) {
      setError("Give this subject a name.");
      return;
    }
    setError("");

    try {
      setStage("extracting");
      const extracted: { unitTitle: string; text: string }[] = [];
      for (let i = 0; i < entries.length; i++) {
        setStageMsg(`Extracting ${entries[i].file.name} (${i + 1}/${entries.length})...`);
        const text = await extractFileText(entries[i].file);
        extracted.push({ unitTitle: entries[i].unitTitle, text });
      }

      setStage("planning");
      let plannedUnits: PlannedUnit[] = [];

      if (mode === "single-file") {
        setStageMsg("Analyzing the subject and detecting units/subtopics...");
        const combined = extracted[0].text;
        const result = await planUnits({ text: combined, mode: "whole-subject" });
        plannedUnits = result.units || [];
      } else {
        for (let i = 0; i < extracted.length; i++) {
          const { unitTitle, text } = extracted[i];
          if (autoSplitSubtopics) {
            setStageMsg(`Detecting subtopics in "${unitTitle}" (${i + 1}/${extracted.length})...`);
            const result = await planUnits({ text, mode: "single-unit" });
            plannedUnits.push({ unitTitle, subtopics: result.subtopics || [{ subtopicTitle: unitTitle, textSlice: text }] });
          } else {
            plannedUnits.push({ unitTitle, subtopics: [{ subtopicTitle: unitTitle, textSlice: text }] });
          }
        }
      }

      if (plannedUnits.length === 0) {
        setError("Couldn't detect any structure in the uploaded material.");
        setStage("input");
        return;
      }

      setStageMsg("Saving draft...");
      const created = await createDraft({ subjectTitle, sourceMode: mode, units: plannedUnits });
      setDraftId(created.draftId);

      const flatProgress: SubtopicProgress[] = created.units.flatMap((u: DraftUnitRef) =>
        u.subtopics.map((s: DraftSubtopicRef) => ({
          unitId: u.unitId,
          unitTitle: u.unitTitle,
          subtopicId: s.subtopicId,
          subtopicTitle: s.subtopicTitle,
          status: "pending" as const,
        }))
      );
      setProgress(flatProgress);

      setStage("generating");
      for (let i = 0; i < flatProgress.length; i++) {
        const item = flatProgress[i];
        setProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "generating" } : p)));
        try {
          await draftGenerate({
            draftId: created.draftId,
            unitId: item.unitId,
            subtopicId: item.subtopicId,
            count,
            difficulty,
            questionType: qType,
          });
          setProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "done" } : p)));
        } catch (err: any) {
          setProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: "error", error: err.message || "Failed" } : p))
          );
        }
      }

      setStage("done");
    } catch (err: any) {
      setError(err.message || "Something went wrong while building the draft.");
      setStage("input");
    }
  }

  async function retrySubtopic(i: number) {
    if (!draftId) return;
    const item = progress[i];
    setProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "generating", error: undefined } : p)));
    try {
      await draftGenerate({
        draftId,
        unitId: item.unitId,
        subtopicId: item.subtopicId,
        count,
        difficulty,
        questionType: qType,
      });
      setProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "done" } : p)));
    } catch (err: any) {
      setProgress((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: "error", error: err.message || "Failed" } : p))
      );
    }
  }

  const doneCount = progress.filter((p) => p.status === "done").length;
  const errorCount = progress.filter((p) => p.status === "error").length;
  const total = progress.length;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <button onClick={() => nav("/dashboard")} className="mb-4 flex items-center gap-1 text-sm text-ink/60 hover:text-brand">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink dark:text-[#F5EDE7]">Automate a subject</h1>
            <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Upload unit PDFs — get one quiz draft, broken down by unit and subtopic.
            </p>
          </div>
        </div>

        {error && <ErrorCard error={error} className="mb-4" />}

        {stage === "input" && (
          <div className="space-y-5">
            <div className="card p-5">
              <label className="label">Subject name</label>
              <input
                value={subjectTitle}
                onChange={(e) => setSubjectTitle(e.target.value)}
                placeholder="e.g. Cell Biology — Semester 2"
                className="input mt-1"
              />
            </div>

            <div className="card p-5">
              <p className="label mb-2">Upload mode</p>
              <div className="flex gap-2">
                <ModeButton active={mode === "multi-file"} onClick={() => switchMode("multi-file")}>
                  One PDF per unit
                </ModeButton>
                <ModeButton active={mode === "single-file"} onClick={() => switchMode("single-file")}>
                  One PDF, whole subject
                </ModeButton>
              </div>

              {mode === "multi-file" && (
                <label className="mt-3 flex items-center gap-2 text-xs text-ink/70 dark:text-[#F5EDE7]/70">
                  <input
                    type="checkbox"
                    checked={autoSplitSubtopics}
                    onChange={(e) => setAutoSplitSubtopics(e.target.checked)}
                  />
                  Auto-detect subtopics within each unit (recommended)
                </label>
              )}
              {mode === "single-file" && (
                <p className="mt-3 text-xs text-ink/50">
                  AI will detect units and subtopics from the document's structure automatically.
                </p>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="label">{mode === "single-file" ? "Subject PDF" : "Unit PDFs"}</p>
                <button onClick={() => fileRef.current?.click()} className="btn-secondary !py-1.5 !px-3 text-xs">
                  <Upload className="h-3.5 w-3.5" /> {mode === "single-file" ? "Choose file" : "Add files"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  multiple={mode === "multi-file"}
                  onChange={onPickFiles}
                  className="hidden"
                />
              </div>

              {entries.length === 0 && (
                <p className="mt-4 text-center text-xs text-ink/40 py-6">No files added yet.</p>
              )}

              <div className="mt-3 space-y-2">
                {entries.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl border border-brand/10 px-3 py-2 dark:border-white/10">
                    <FileText className="h-4 w-4 shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-ink/50">{entry.file.name}</p>
                      {mode === "multi-file" ? (
                        <input
                          value={entry.unitTitle}
                          onChange={(e) => updateUnitTitle(i, e.target.value)}
                          className="mt-0.5 w-full rounded-lg border border-brand/10 bg-white dark:bg-[#241218] px-2 py-1 text-sm outline-none focus:border-brand"
                          placeholder="Unit name"
                        />
                      ) : (
                        <p className="text-sm font-semibold">{entry.unitTitle}</p>
                      )}
                    </div>
                    <button onClick={() => removeEntry(i)} className="shrink-0 text-ink/30 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <p className="label mb-3">Questions per subtopic</p>
              <div className="flex flex-wrap gap-2">
                {[3, 5, 10].map((n) => (
                  <ModeButton key={n} active={count === n} onClick={() => setCount(n)}>
                    {n}
                  </ModeButton>
                ))}
              </div>

              <p className="label mb-2 mt-4">Difficulty</p>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((d) => (
                  <ModeButton key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                    {d}
                  </ModeButton>
                ))}
              </div>

              <p className="label mb-2 mt-4">Question type</p>
              <div className="flex flex-wrap gap-2">
                {QTYPES.map((t) => (
                  <ModeButton key={t.v} active={qType === t.v} onClick={() => setQType(t.v)}>
                    {t.label}
                  </ModeButton>
                ))}
              </div>
            </div>

            <button onClick={buildDraft} disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Build draft
            </button>
          </div>
        )}

        {(stage === "extracting" || stage === "planning") && (
          <div className="card flex flex-col items-center justify-center gap-3 p-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
            <p className="text-sm text-ink/70 dark:text-[#F5EDE7]/70">{stageMsg}</p>
          </div>
        )}

        {(stage === "generating" || stage === "done") && (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {stage === "generating" ? "Generating questions..." : "Draft ready"}
                </p>
                <p className="text-xs text-ink/50">
                  {doneCount}/{total} subtopics{errorCount > 0 ? ` · ${errorCount} failed` : ""}
                </p>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-peach/40">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              {progress.map((p, i) => (
                <div key={p.subtopicId} className="card flex items-center gap-3 p-3">
                  {p.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
                  {p.status === "generating" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />}
                  {p.status === "pending" && <div className="h-4 w-4 shrink-0 rounded-full border-2 border-ink/20" />}
                  {p.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-ink/50">{p.unitTitle}</p>
                    <p className="truncate text-sm">{p.subtopicTitle}</p>
                    {p.status === "error" && <p className="text-xs text-red-500">{p.error}</p>}
                  </div>
                  {p.status === "error" && (
                    <button onClick={() => retrySubtopic(i)} className="btn-secondary !py-1 !px-2 text-xs shrink-0">
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </div>

            {stage === "done" && draftId && (
              <button onClick={() => nav(`/quiz-draft/${draftId}`)} className="btn-primary w-full">
                Review draft →
              </button>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active ? "bg-brand text-white" : "bg-peach/40 text-brand-700 hover:bg-peach/60"
      }`}
    >
      {children}
    </button>
  );
}