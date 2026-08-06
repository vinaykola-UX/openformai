import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Upload, Link2, Loader2, Sparkles, Wand2, Brain,
  CheckCircle2, ExternalLink, BookOpen, Target, Plus, Trash2,
  Copy, ChevronDown, Download, Globe,
} from "lucide-react";
import AppShell from "../components/AppShell";
import StudentImport from "../components/StudentImport";
import ErrorCard from "../components/ErrorCard";
import CopyLinkButton from "../components/CopyLinkButton";
import UnlockDialog from "../components/UnlockDialog";
import { extractFileText, extractDriveUrl } from "../lib/api";
import {
  analyzeMaterial, generateQuiz, createQuizForm, suggestOutlines,
  type QuizAnalysis, type QuizQuestion, type QuizOutline,
} from "../lib/quizApi";

type Step = "input" | "review" | "result";

const COUNT_OPTIONS = [5, 10, 20, 30, 50];
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Mixed"] as const;
const QTYPES = [
  { v: "Mixed", label: "Mixed" },
  { v: "MCQ", label: "Multiple Choice" },
  { v: "CHECKBOX", label: "Checkbox" },
  { v: "TRUE_FALSE", label: "True / False" },
  { v: "SHORT", label: "Short Answer" },
  { v: "PARAGRAPH", label: "Paragraph" },
];

export default function AIQuiz() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("input");
  const [title, setTitle] = useState("AI Generated Quiz");
  const [text, setText] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [importing, setImporting] = useState<"file" | "drive" | null>(null);
  const [importMsg, setImportMsg] = useState("");

  const [analysis, setAnalysis] = useState<QuizAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [command, setCommand] = useState("");
  const [researching, setResearching] = useState(false);
  const [outlines, setOutlines] = useState<QuizOutline[] | null>(null);

  const [count, setCount] = useState<number>(10);
  const [customCount, setCustomCount] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("Mixed");
  const [qType, setQType] = useState<string>("Mixed");
  const [mode, setMode] = useState<"quiz" | "form">("quiz");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [expectedStudents, setExpectedStudents] = useState<string[]>([]);

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ responderUri: string; editUri: string } | null>(null);
  const [unlock, setUnlock] = useState<{ open: boolean; used?: number; limit?: number; scope?: string; message?: string }>({ open: false });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setImportMsg(""); setImporting("file");
    try {
      const extracted = await extractFileText(file);
      setText((p) => (p ? p + "\n\n" + extracted : extracted));
      setImportMsg(`Imported ${file.name} (${extracted.length.toLocaleString()} chars)`);
    } catch (err: any) {
      setError(err.message || "File import failed");
    } finally {
      setImporting(null);
    }
  }

  async function importDrive() {
    if (!driveUrl.trim()) return;
    setError(""); setImportMsg(""); setImporting("drive");
    try {
      const extracted = await extractDriveUrl(driveUrl.trim());
      setText((p) => (p ? p + "\n\n" + extracted : extracted));
      setImportMsg(`Imported from Drive (${extracted.length.toLocaleString()} chars)`);
      setDriveUrl("");
    } catch (err: any) {
      setError(err.message || "Drive import failed");
    } finally {
      setImporting(null);
    }
  }

  async function runAnalyze(overrideText?: string) {
    const material = overrideText ?? text;
    setError(""); setAnalyzing(true);
    try {
      const a = await analyzeMaterial(material);
      setAnalysis(a);
      if (a.mainTopic) setTitle(`${a.mainTopic} — Quiz`);
    } catch (err: any) {
      setError(err.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runResearch() {
    if (!command.trim()) return;
    setError(""); setResearching(true); setOutlines(null);
    try {
      const { outlines: found } = await suggestOutlines(command.trim());
      setOutlines(found);
    } catch (err: any) {
      setError(err.message || "Research failed");
    } finally {
      setResearching(false);
    }
  }

  function pickOutline(o: QuizOutline) {
    setText(o.content);
    setOutlines(null);
    if (o.title) setTitle(`${o.title} — Quiz`);
    runAnalyze(o.content);
  }

  async function runGenerate() {
    setError(""); setGenerating(true);
    try {
      const n = customCount ? Math.max(1, Math.min(100, Number(customCount) || 10)) : count;
      const { questions: qs } = await generateQuiz({ text, count: n, difficulty, questionType: qType });
      const defaults: QuizQuestion[] = [
        { type: "SHORT", title: "Email ID", required: true, points: 0 },
        { type: "SHORT", title: "Full Name", required: true, points: 0 },
        { type: "SHORT", title: "Roll Number", required: true, points: 0 },
      ];
      setQuestions([...defaults, ...qs]);
      setStep("review");
    } catch (err: any) {
      setError(err.message || "Quiz generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    if (!questions?.length) return;
    setError(""); setCreating(true);
    try {
      const r = await createQuizForm({
        title, questions, mode, expiresAt: expiresAt || null, expectedStudents,
      });
      setResult(r);
      setStep("result");
    } catch (err: any) {
      if (err?.code === "LIMIT_REACHED" || err?.code === "DAILY_LIMIT_REACHED") {
        setUnlock({ open: true, used: err?.data?.used, limit: err?.data?.limit, scope: err?.data?.scope, message: err?.message });
      } else {
        setError(err.message || "Failed to create form.");
        if (err.message?.toLowerCase().includes("google")) {
          setTimeout(() => nav("/connect-google"), 1500);
        }
      }
    } finally {
      setCreating(false);
    }
  }

  function downloadFile(name: string, content: string, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportQuiz(format: "json" | "txt" | "md" | "csv" | "pdf" | "xlsx") {
    if (!questions) return;
    const safe = title.replace(/[^\w-]+/g, "_");
    if (format === "json") {
      downloadFile(`${safe}.json`, JSON.stringify({ title, mode, questions }, null, 2), "application/json");
    } else if (format === "txt") {
      const body = questions.map((q, i) => {
        const opts = q.options?.length ? "\n" + q.options.map((o, j) => `  ${String.fromCharCode(65 + j)}) ${o}`).join("\n") : "";
        const ans = q.correctAnswers?.length ? `\nAnswer: ${q.correctAnswers.join(", ")}` : "";
        const exp = q.explanation ? `\nExplanation: ${q.explanation}` : "";
        return `${i + 1}. ${q.title}${opts}${ans}${exp}`;
      }).join("\n\n");
      downloadFile(`${safe}.txt`, `${title}\n\n${body}`);
    } else if (format === "md") {
      const body = questions.map((q, i) => {
        const opts = q.options?.length ? "\n" + q.options.map((o) => `- ${o}`).join("\n") : "";
        const ans = q.correctAnswers?.length ? `\n\n**Answer:** ${q.correctAnswers.join(", ")}` : "";
        const exp = q.explanation ? `\n\n_${q.explanation}_` : "";
        return `### ${i + 1}. ${q.title}${opts}${ans}${exp}`;
      }).join("\n\n");
      downloadFile(`${safe}.md`, `# ${title}\n\n${body}`, "text/markdown");
    } else if (format === "csv") {
      const rows = [["#", "Type", "Question", "Options", "Answer", "Points", "Explanation"]];
      questions.forEach((q, i) => rows.push([
        String(i + 1), q.type, q.title,
        (q.options || []).join(" | "),
        (q.correctAnswers || []).join(" | "),
        String(q.points ?? 1),
        q.explanation || "",
      ]));
      const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
      downloadFile(`${safe}.csv`, csv, "text/csv");
    } else if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const header = ["#", "Type", "Question", "Option A", "Option B", "Option C", "Option D", "Option E", "Option F", "Answer", "Points", "Difficulty", "Explanation"];
      const data = questions.map((q, i) => {
        const opts = q.options || [];
        return [
          i + 1, q.type, q.title,
          opts[0] || "", opts[1] || "", opts[2] || "", opts[3] || "", opts[4] || "", opts[5] || "",
          (q.correctAnswers || []).join(" | "),
          q.points ?? 1,
          q.difficulty || "",
          q.explanation || "",
        ];
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
      ws["!cols"] = [{ wch: 4 }, { wch: 10 }, { wch: 50 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 40 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Questions");
      XLSX.writeFile(wb, `${safe}.xlsx`);
    } else if (format === "pdf") {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      doc.setFontSize(18);
      doc.text(title, 40, 50);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`${questions.length} questions • ${mode === "quiz" ? "Quiz" : "Form"}`, 40, 68);
      const body = questions.map((q, i) => {
        const opts = q.options?.length
          ? q.options.map((o, j) => `${String.fromCharCode(65 + j)}) ${o}`).join("\n")
          : "—";
        const ans = q.correctAnswers?.length ? q.correctAnswers.join(", ") : "—";
        return [String(i + 1), q.title, opts, ans, q.explanation || ""];
      });
      autoTable(doc, {
        startY: 84,
        head: [["#", "Question", "Options", "Answer", "Explanation"]],
        body,
        styles: { fontSize: 9, cellPadding: 6, valign: "top", overflow: "linebreak" },
        headStyles: { fillColor: [116, 26, 47], textColor: 255 },
        columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 150 }, 2: { cellWidth: 160 }, 3: { cellWidth: 70 }, 4: { cellWidth: 110 } },
      });
      doc.save(`${safe}.pdf`);
    }
  }


  // ─── Result screen ─────────────────────────────────────────────
  if (step === "result" && result) {
    return (
      <AppShell>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
          <div className="card p-10 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold">Your {mode === "quiz" ? "quiz" : "form"} is live!</h1>
            <p className="mt-2 text-ink/70 dark:text-[#F5EDE7]/70">
              {mode === "quiz" ? "Grading and correct answers are enabled." : "Share the link with respondents."}
            </p>
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-brand/15 bg-cream/70 px-3 py-2 text-left dark:border-white/10 dark:bg-white/5">
              <input readOnly value={result.responderUri} onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate bg-transparent text-xs text-ink/80 outline-none dark:text-[#F5EDE7]/80" />
              <CopyLinkButton url={result.responderUri} size="sm" label="Copy" />
            </div>
            {expiresAt && (
              <p className="mt-2 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                ⏰ Closes on {new Date(expiresAt).toLocaleString()}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-3">
              <a href={result.responderUri} target="_blank" rel="noreferrer" className="btn-primary">
                <ExternalLink className="h-4 w-4" /> Open form
              </a>
              <a href={result.editUri} target="_blank" rel="noreferrer" className="btn-secondary">
                Edit in Google Forms
              </a>
              <Link to="/dashboard" className="btn-ghost">Back to dashboard</Link>
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/dashboard" className="btn-ghost mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white shadow-card">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">AI Quiz Generator</h1>
            <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Turn study material into a graded Google Form quiz.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorCard error={error} onDismiss={() => setError("")} />
          </div>
        )}
{step === "input" && (
          <>
            <div className="card p-6 sm:p-8">
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <Globe className="h-4 w-4 text-brand" /> Or describe what you want
              </h2>
              <p className="mt-1 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                Skip pasting material — tell it what to make and it'll research the web and propose two starting points to pick from.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input value={command} onChange={(e) => setCommand(e.target.value)}
                  placeholder='e.g. "Make a quiz on BR23 workplace safety regulations"'
                  className="input flex-1" />
                <button type="button" onClick={runResearch} disabled={!command.trim() || researching} className="btn-primary shrink-0">
                  {researching ? <><Loader2 className="h-4 w-4 animate-spin" /> Researching...</> : <><Globe className="h-4 w-4" /> Research</>}
                </button>
              </div>

              {outlines && outlines.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {outlines.map((o, i) => (
                    <div key={i} className="rounded-2xl border border-brand/15 bg-cream/60 p-4 dark:border-white/10 dark:bg-white/5">
                      <p className="text-sm font-bold text-ink dark:text-[#F5EDE7]">{o.title}</p>
                      <p className="mt-1 text-xs text-ink/60 dark:text-[#F5EDE7]/60">{o.angle}</p>
                      {o.topics.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {o.topics.map((t, j) => (
                            <span key={j} className="rounded-full bg-peach/40 px-2 py-0.5 text-[10px] text-brand-700">{t}</span>
                          ))}
                        </div>
                      )}
                      <button type="button" onClick={() => pickOutline(o)} className="btn-secondary mt-3 w-full">
                        Use this
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card mt-6 p-6 sm:p-8">
              <h2 className="font-display text-lg font-bold">1. Add study material</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-dashed border-brand/20 bg-cream/60 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
                    <Upload className="h-3.5 w-3.5" /> Upload file
                  </div>
                  <p className="mb-3 text-xs text-ink/60 dark:text-[#F5EDE7]/60">PDF, DOCX, TXT, or image.</p>
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,image/*" className="hidden" onChange={onFile} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={importing !== null} className="btn-secondary w-full">
                    {importing === "file" ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting...</> : "Choose file"}
                  </button>
                </div>
                <div className="rounded-2xl border border-dashed border-brand/20 bg-cream/60 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
                    <Link2 className="h-3.5 w-3.5" /> Google Drive / Docs
                  </div>
                  <p className="mb-3 text-xs text-ink/60 dark:text-[#F5EDE7]/60">Share as "Anyone with the link".</p>
                  <div className="flex gap-2">
                    <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/..." className="input flex-1" />
                    <button type="button" onClick={importDrive} disabled={!driveUrl.trim() || importing !== null} className="btn-secondary shrink-0">
                      {importing === "drive" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
                    </button>
                  </div>
                </div>
              </div>
              {importMsg && <p className="mt-3 rounded-xl bg-peach/30 px-3 py-2 text-xs font-medium text-brand-700">{importMsg}</p>}
              <div className="mt-4">
                <label className="label">Or paste study material</label>
                <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Paste notes, textbook excerpts, articles..."
                  className="input font-mono text-xs leading-relaxed" />
              </div>
              <button onClick={() => runAnalyze()} disabled={!text.trim() || analyzing} className="btn-primary mt-4">
                {analyzing ? <><Sparkles className="h-4 w-4 animate-pulse" /> Analyzing...</> : <><BookOpen className="h-4 w-4" /> Analyze content</>}
              </button>
            </div>

            {analysis && (
              <div className="card mt-6 p-6 sm:p-8">
                <h2 className="font-display text-lg font-bold">2. Content summary</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SummaryRow label="Subject" value={analysis.subject} />
                  <SummaryRow label="Main topic" value={analysis.mainTopic} />
                  <SummaryRow label="Word count" value={analysis.wordCount.toLocaleString()} />
                  <SummaryRow label="Reading time" value={`~${analysis.readingMinutes} min`} />
                  {analysis.difficulty && <SummaryRow label="Difficulty" value={analysis.difficulty} />}
                </div>
                {analysis.subtopics?.length > 0 && <ChipList title="Subtopics" items={analysis.subtopics} />}
                {analysis.concepts && analysis.concepts.length > 0 && <ChipList title="Key concepts" items={analysis.concepts} />}
                {analysis.keywords && analysis.keywords.length > 0 && <ChipList title="Keywords" items={analysis.keywords} />}
                {analysis.formulas && analysis.formulas.length > 0 && <ChipList title="Formulas" items={analysis.formulas} />}
                {analysis.learningObjectives && analysis.learningObjectives.length > 0 && (
                  <ChipList title="Learning objectives" items={analysis.learningObjectives} />
                )}

                <div className="mt-6 border-t border-brand/10 pt-6 dark:border-white/10">
                  <h3 className="font-display text-base font-bold flex items-center gap-2"><Target className="h-4 w-4 text-brand" /> Quiz options</h3>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="label">Number of questions</label>
                      <div className="flex flex-wrap gap-2">
                        {COUNT_OPTIONS.map((n) => (
                          <button key={n} type="button" onClick={() => { setCount(n); setCustomCount(""); }}
                            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                              !customCount && count === n ? "bg-brand text-white" : "bg-peach/40 text-brand-700 hover:bg-peach/60"
                            }`}>{n}</button>
                        ))}
                        <input type="number" min={1} max={100} value={customCount}
                          onChange={(e) => setCustomCount(e.target.value)}
                          placeholder="Custom"
                          className="w-24 rounded-full border border-brand/20 bg-white dark:bg-[#241218] px-3 py-1.5 text-xs outline-none focus:border-brand" />
                      </div>
                    </div>
                    <PillGroup label="Difficulty" value={difficulty} options={DIFFICULTIES.map((d) => ({ v: d, label: d }))} onChange={setDifficulty} />
                    <PillGroup label="Question types" value={qType} options={QTYPES} onChange={setQType} />
                    <PillGroup label="Form mode" value={mode}
                      options={[{ v: "quiz", label: "Google Quiz (graded)" }, { v: "form", label: "Normal Google Form" }]}
                      onChange={(v) => setMode(v as "quiz" | "form")} />
                  </div>
                  <button onClick={runGenerate} disabled={generating} className="btn-primary mt-6">
                    {generating ? <><Sparkles className="h-4 w-4 animate-pulse" /> Generating quiz...</> : <><Wand2 className="h-4 w-4" /> Generate quiz</>}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {step === "review" && questions && (
          <>
            <div className="card p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">3. Review & edit</h2>
                  <p className="text-xs text-ink/60 dark:text-[#F5EDE7]/60">{questions.length} questions · {mode === "quiz" ? "Quiz mode" : "Normal form"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setStep("input")} className="btn-ghost">← Back</button>
                  <ExportMenu onExport={exportQuiz} />
                  <button onClick={publish} disabled={creating} className="btn-primary">
                    {creating ? "Creating..." : "Create Google Form"}
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <label className="label">Form title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
              </div>
              <div className="mt-4">
                <label className="label">Close responses after (optional)</label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="input"
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="mt-1 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                  Leave empty to keep the form open indefinitely.
                </p>
              </div>
              <div className="mt-4">
                <StudentImport students={expectedStudents} onChange={setExpectedStudents} />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {questions.map((q, i) => (
                <QuizCard
                  key={i}
                  q={q}
                  index={i}
                  total={questions.length}
                  onChange={(nq) => setQuestions(questions.map((x, j) => (j === i ? nq : x)))}
                  onDelete={() => setQuestions(questions.filter((_, j) => j !== i))}
                  onDuplicate={() => {
                    const next = [...questions];
                    next.splice(i + 1, 0, { ...q });
                    setQuestions(next);
                  }}
                  onMoveUp={() => {
                    if (i === 0) return;
                    const next = [...questions];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    setQuestions(next);
                  }}
                  onMoveDown={() => {
                    if (i === questions.length - 1) return;
                    const next = [...questions];
                    [next[i], next[i + 1]] = [next[i + 1], next[i]];
                    setQuestions(next);
                  }}
                />
              ))}
              <button
                onClick={() => setQuestions([...questions, {
                  type: "MCQ", title: "New question", options: ["Option 1", "Option 2", "Option 3", "Option 4"],
                  correctAnswers: ["Option 1"], points: 1, difficulty: "Medium", required: true,
                }])}
                className="w-full rounded-2xl border-2 border-dashed border-brand/20 py-4 text-sm font-semibold text-brand/60 hover:border-brand hover:text-brand transition"
              >
                <Plus className="inline h-4 w-4 mr-1" /> Add question
              </button>
            </div>
          </>
        )}
      </main>

      <UnlockDialog
        open={unlock.open}
        used={unlock.used}
        limit={unlock.limit}
        scope={unlock.scope}
        message={unlock.message}
        onClose={() => setUnlock({ open: false })}
        onUnlocked={() => { setUnlock({ open: false }); publish(); }}
      />
    </AppShell>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cream/60 px-3 py-2 dark:bg-white/5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/50 dark:text-[#F5EDE7]/50">{label}</p>
      <p className="text-sm font-semibold text-ink dark:text-[#F5EDE7]">{value || "—"}</p>
    </div>
  );
}

function ChipList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-ink/60 dark:text-[#F5EDE7]/60">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((s, i) => (
          <span key={i} className="rounded-full bg-peach/40 px-3 py-1 text-xs text-brand-700">{s}</span>
        ))}
      </div>
    </div>
  );
}

function PillGroup<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              value === o.v ? "bg-brand text-white" : "bg-peach/40 text-brand-700 hover:bg-peach/60"
            }`}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function ExportMenu({ onExport }: { onExport: (f: "json" | "txt" | "md" | "csv" | "pdf" | "xlsx") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="btn-secondary">
        <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-brand/10 bg-white shadow-glow dark:bg-[#241218] dark:border-white/10">
          {([
            ["pdf", "PDF"],
            ["xlsx", "Excel (editable)"],
            ["csv", "CSV"],
            ["json", "JSON"],
            ["txt", "TXT"],
            ["md", "Markdown"],
          ] as const).map(([f, label]) => (
            <button key={f} onClick={() => { onExport(f); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-peach/30 dark:text-[#F5EDE7]">
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function QuizCard({
  q, index, total, onChange, onDelete, onDuplicate, onMoveUp, onMoveDown,
}: {
  q: QuizQuestion; index: number; total: number;
  onChange: (q: QuizQuestion) => void;
  onDelete: () => void; onDuplicate: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const hasOptions = q.type === "MCQ" || q.type === "CHECKBOX" || q.type === "TRUE_FALSE";
  const opts = q.type === "TRUE_FALSE" ? ["True", "False"] : (q.options || []);
  const isMulti = q.type === "CHECKBOX";

  function toggleCorrect(opt: string) {
    const current = new Set(q.correctAnswers || []);
    if (isMulti) {
      current.has(opt) ? current.delete(opt) : current.add(opt);
    } else {
      current.clear();
      current.add(opt);
    }
    onChange({ ...q, correctAnswers: Array.from(current) });
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1">
          <button onClick={onMoveUp} disabled={index === 0} className="text-ink/30 hover:text-brand disabled:opacity-20 text-xs">▲</button>
          <div className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">{index + 1}</div>
          <button onClick={onMoveDown} disabled={index === total - 1} className="text-ink/30 hover:text-brand disabled:opacity-20 text-xs">▼</button>
        </div>

        <div className="flex-1 min-w-0">
          <textarea rows={2} value={q.title} onChange={(e) => onChange({ ...q, title: e.target.value })}
            className="input text-sm font-semibold w-full" />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={q.type} onChange={(e) => {
              const nt = e.target.value as QuizQuestion["type"];
              const updates: Partial<QuizQuestion> = { type: nt };
              if ((nt === "MCQ" || nt === "CHECKBOX") && !q.options?.length) {
                updates.options = ["Option 1", "Option 2", "Option 3", "Option 4"];
              }
              if (nt === "TRUE_FALSE") { updates.options = ["True", "False"]; updates.correctAnswers = ["True"]; }
              onChange({ ...q, ...updates });
            }}
              className="rounded-full bg-peach/40 px-3 py-1 text-xs font-semibold text-brand-700 outline-none">
              <option value="MCQ">Multiple choice</option>
              <option value="CHECKBOX">Checkbox</option>
              <option value="TRUE_FALSE">True / False</option>
              <option value="SHORT">Short answer</option>
              <option value="PARAGRAPH">Paragraph</option>
            </select>

            <label className="flex items-center gap-1 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
              Points
              <input type="number" min={0} max={100} value={q.points ?? 1}
                onChange={(e) => onChange({ ...q, points: Number(e.target.value) })}
                className="w-14 rounded-lg border border-brand/10 bg-white dark:bg-[#241218] px-2 py-0.5 text-xs outline-none" />
            </label>

            <button type="button" onClick={() => onChange({ ...q, required: !q.required })}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${q.required ? "bg-brand text-white" : "bg-peach/40 text-brand-700"}`}>
              {q.required ? "Required" : "Optional"}
            </button>

            {(q.correctAnswers || []).length === 0 && (
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-300">
                ⚠ No answer set
              </span>
            )}
          </div>

          {hasOptions && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-ink/50">Options (click to mark correct)</p>
              {opts.map((opt, i) => {
                const isCorrect = (q.correctAnswers || []).includes(opt);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <button type="button" onClick={() => toggleCorrect(opt)}
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
                        isCorrect ? "border-brand bg-brand text-white" : "border-ink/20"
                      }`}>
                      {isCorrect && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                    <input value={opt} disabled={q.type === "TRUE_FALSE"}
                      onChange={(e) => {
                        const next = [...(q.options || [])];
                        const oldVal = next[i];
                        next[i] = e.target.value;
                        const nextCorrect = (q.correctAnswers || []).map((c) => (c === oldVal ? e.target.value : c));
                        onChange({ ...q, options: next, correctAnswers: nextCorrect });
                      }}
                      className="flex-1 rounded-xl border border-brand/10 bg-white dark:bg-[#241218] px-3 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-70" />
                    {q.type !== "TRUE_FALSE" && (
                      <button onClick={() => {
                        const removed = opts[i];
                        onChange({
                          ...q,
                          options: (q.options || []).filter((_, j) => j !== i),
                          correctAnswers: (q.correctAnswers || []).filter((c) => c !== removed),
                        });
                      }} disabled={(q.options?.length ?? 0) <= 2} className="text-ink/30 hover:text-red-500 disabled:opacity-20">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {q.type !== "TRUE_FALSE" && (
                <button onClick={() => onChange({ ...q, options: [...(q.options || []), `Option ${(q.options?.length ?? 0) + 1}`] })}
                  className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                  <Plus className="h-3 w-3" /> Add option
                </button>
              )}
            </div>
          )}

          {(q.type === "SHORT" || q.type === "PARAGRAPH") && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink/50">Model answer</p>
              <input value={(q.correctAnswers || [])[0] || ""}
                onChange={(e) => onChange({ ...q, correctAnswers: e.target.value ? [e.target.value] : [] })}
                placeholder="Correct answer..."
                className="input mt-1 text-sm" />
            </div>
          )}

          <div className="mt-3">
            <p className="text-xs font-semibold text-ink/50">Explanation (optional)</p>
            <textarea rows={2} value={q.explanation || ""}
              onChange={(e) => onChange({ ...q, explanation: e.target.value })}
              placeholder="Why is this the correct answer?"
              className="input mt-1 text-xs" />
          </div>
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={onDuplicate} className="rounded-xl p-1.5 text-ink/40 hover:bg-brand/10 hover:text-brand">
            <Copy className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="rounded-xl p-1.5 text-ink/40 hover:bg-red-50 hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}