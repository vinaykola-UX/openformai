import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Wand2, CheckCircle2, ExternalLink, Upload, Link2, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";
import { generateQuestions, createForm, extractFileText, extractDriveUrl, type ParsedQuestion } from "../lib/api";
import QuestionPreview from "../components/QuestionPreview";
import CopyLinkButton from "../components/CopyLinkButton";
import UnlockDialog from "../components/UnlockDialog";

const EXAMPLE = `1. What is the capital of France?
a) London
b) Paris
c) Madrid
d) Rome
Answer: b

2. The Earth is flat. (True/False)
Answer: False

3. Explain photosynthesis in your own words.`;

export default function NewForm() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("Untitled quiz");
  const [text, setText] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [importing, setImporting] = useState<"file" | "drive" | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [questions, setQuestions] = useState<ParsedQuestion[] | null>(null);
  const [meta, setMeta] = useState<{ estimatedMinutes: number; warnings: { index: number; type: string; message: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ responderUri: string; editUri: string } | null>(null);
  const [unlock, setUnlock] = useState<{ open: boolean; used?: number; limit?: number }>({ open: false });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setImportMsg("");
    setImporting("file");
    try {
      const extracted = await extractFileText(file);
      setText((prev) => (prev ? prev + "\n\n" + extracted : extracted));
      setImportMsg(`Imported ${file.name} (${extracted.length.toLocaleString()} chars)`);
    } catch (err: any) {
      setError(err.message || "File import failed");
    } finally {
      setImporting(null);
    }
  }

  async function importDrive() {
    if (!driveUrl.trim()) return;
    setError("");
    setImportMsg("");
    setImporting("drive");
    try {
      const extracted = await extractDriveUrl(driveUrl.trim());
      setText((prev) => (prev ? prev + "\n\n" + extracted : extracted));
      setImportMsg(`Imported from Drive (${extracted.length.toLocaleString()} chars)`);
      setDriveUrl("");
    } catch (err: any) {
      setError(err.message || "Drive import failed");
    } finally {
      setImporting(null);
    }
  }

  async function generate() {
    setError("");
    setLoading(true);
    try {
      const { questions: qs, meta: m } = await generateQuestions(text);
      setQuestions(qs);
      setMeta(m);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion(i: number) {
    setQuestions((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const q = next[i];
      if (q.suggestedTitle) {
        next[i] = { ...q, title: q.suggestedTitle, suggestedTitle: undefined, clarityNote: undefined };
      }
      return next;
    });
  }

  async function publish() {
    if (!questions) return;
    setError("");
    setCreating(true);
    try {
      const r = await createForm(title, questions);
      setResult(r);
    } catch (err: any) {
      if (err?.code === "LIMIT_REACHED") {
        setUnlock({ open: true, used: err?.data?.used, limit: err?.data?.limit });
      } else {
        setError(err.message);
        if (err.message?.toLowerCase().includes("google")) {
          setTimeout(() => nav("/connect-google"), 1500);
        }
      }
    } finally {
      setCreating(false);
    }
  }

  if (result) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
          <div className="card p-10 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold">Your form is live!</h1>
            <p className="mt-2 text-ink/70 dark:text-[#F5EDE7]/70">Share the responder link with your students.</p>
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-brand/15 bg-cream/70 px-3 py-2 text-left dark:border-white/10 dark:bg-white/5">
              <input
                readOnly
                value={result.responderUri}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate bg-transparent text-xs text-ink/80 outline-none dark:text-[#F5EDE7]/80"
              />
              <CopyLinkButton url={result.responderUri} size="sm" label="Copy" />
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <a href={result.responderUri} target="_blank" rel="noreferrer" className="btn-primary">
                <ExternalLink className="h-4 w-4" /> Open responder link
              </a>
              <a href={result.editUri} target="_blank" rel="noreferrer" className="btn-secondary">
                Edit in Google Forms
              </a>
              <Link to="/dashboard" className="btn-ghost">Back to dashboard</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/dashboard" className="btn-ghost mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="card p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold">New form</h1>
          <p className="mt-1 text-sm text-ink/60 dark:text-[#F5EDE7]/60">Paste your questions below — any format works.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="label">Form title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-dashed border-brand/20 bg-cream/60 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
                  <Upload className="h-3.5 w-3.5" /> Upload file
                </div>
                <p className="mb-3 text-xs text-ink/60 dark:text-[#F5EDE7]/60">PDF, DOCX, XLSX, TXT or image (max 15 MB).</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv,image/*"
                  className="hidden"
                  onChange={onFile}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={importing !== null}
                  className="btn-secondary w-full"
                >
                  {importing === "file" ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting...</> : <>Choose file</>}
                </button>
              </div>
              <div className="rounded-2xl border border-dashed border-brand/20 bg-cream/60 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
                  <Link2 className="h-3.5 w-3.5" /> Google Drive link
                </div>
                <p className="mb-3 text-xs text-ink/60 dark:text-[#F5EDE7]/60">Share as "Anyone with the link".</p>
                <div className="flex gap-2">
                  <input
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={importDrive}
                    disabled={!driveUrl.trim() || importing !== null}
                    className="btn-secondary shrink-0"
                  >
                    {importing === "drive" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
                  </button>
                </div>
              </div>
            </div>
            {importMsg && (
              <p className="rounded-xl bg-peach/30 px-3 py-2 text-xs font-medium text-brand-700">{importMsg}</p>
            )}
            <div>
              <label className="label">Questions</label>
              <textarea
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={EXAMPLE}
                className="input font-mono text-xs leading-relaxed"
              />
              <button
                type="button"
                onClick={() => setText(EXAMPLE)}
                className="mt-2 text-xs font-semibold text-brand hover:underline"
              >
                Use example
              </button>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <button onClick={generate} disabled={!text.trim() || loading} className="btn-primary">
              {loading ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" /> Parsing with AI...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" /> Generate preview
                </>
              )}
            </button>
          </div>
        </div>

        {questions && (
          <div className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Preview · {questions.length} questions</h2>
                {meta && meta.estimatedMinutes > 0 && (
                  <p className="mt-1 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                    Estimated time to complete: <span className="font-semibold text-brand">~{meta.estimatedMinutes} min</span>
                  </p>
                )}
              </div>
              <button onClick={publish} disabled={creating} className="btn-primary">
                {creating ? "Creating Google Form..." : "Create Google Form"}
              </button>
            </div>
            {meta && meta.warnings.length > 0 && (
              <div className="mb-4 space-y-2">
                {meta.warnings.map((w, i) => (
                  <div key={i} className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                    ⚠ {w.message}
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {questions.map((q, i) => (
                <QuestionPreview key={i} q={q} index={i} onApplySuggestion={() => applySuggestion(i)} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
