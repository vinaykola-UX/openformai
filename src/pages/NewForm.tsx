import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Wand2, CheckCircle2, ExternalLink, Upload, Link2, Loader2, RotateCcw } from "lucide-react";
import Navbar from "../components/Navbar";
import { generateQuestions, createForm, extractFileText, extractDriveUrl, type ParsedQuestion } from "../lib/api";
import QuestionEditor from "../components/QuestionEditor";
import QuestionPreview from "../components/QuestionPreview";
import CopyLinkButton from "../components/CopyLinkButton";
import UnlockDialog from "../components/UnlockDialog";
import ErrorCard from "../components/ErrorCard";

const EXAMPLE = `1. What is your full name?

2. What is your email address?

3. How satisfied are you with our service?

4. Select your favorite color.
a) Red
b) Blue
c) Green
d) Yellow

5. Tell us about your experience.`;

export default function NewForm() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("Untitled form");
  const [text, setText] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [sourceType, setSourceType] = useState<string>("text");
  const [importing, setImporting] = useState<"file" | "drive" | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [extractCache, setExtractCache] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<ParsedQuestion[] | null>(null);
  const [meta, setMeta] = useState<{ estimatedMinutes: number; warnings: { index: number; type: string; message: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ responderUri: string; editUri: string } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [unlock, setUnlock] = useState<{ open: boolean; used?: number; limit?: number; scope?: string; message?: string }>({ open: false });

  function fileKey(f: File) {
    return `${f.name}::${f.size}::${f.lastModified}`;
  }

  async function processFile(file: File, isRetry = false) {
    setError("");
    setImportMsg("");
    setImporting("file");

    const key = fileKey(file);
    const cached = extractCache[key];

    // Save AI tokens: if we already extracted this exact file, reuse it.
    if (isRetry && cached) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "text";
      setSourceType(["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? "image" : ext);
      setText((prev) => (prev ? prev + "\n\n" + cached : cached));
      setImportMsg(
        `♻️ Restored ${file.name} from cache (${cached.length.toLocaleString()} chars) — no AI tokens used.`
      );
      setImporting(null);
      return;
    }

    const isPdf = /\.pdf$/i.test(file.name) || file.type.includes("pdf");
    const messages = isPdf
      ? [
          "📄 Reading PDF...",
          "🔍 Extracting text from pages...",
          "🧠 Understanding content structure...",
          "✂️ Processing extracted text...",
          "✅ Almost ready...",
        ]
      : ["📂 Reading file...", "🔍 Extracting content...", "✅ Almost ready..."];

    let idx = 0;
    setUploadStatus((isRetry ? "🔁 Retrying · " : "") + messages[0]);
    const interval = setInterval(() => {
      idx = Math.min(idx + 1, messages.length - 1);
      setUploadStatus((isRetry ? "🔁 Retrying · " : "") + messages[idx]);
    }, 2500);

    try {
      const extracted = await extractFileText(file);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "text";
      setSourceType(["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? "image" : ext);
      setText((prev) => (prev ? prev + "\n\n" + extracted : extracted));
      setExtractCache((c) => ({ ...c, [key]: extracted }));
      setImportMsg(`Imported ${file.name} (${extracted.length.toLocaleString()} chars)`);
    } catch (err: any) {
      setError(err.message || "File import failed");
    } finally {
      clearInterval(interval);
      setUploadStatus("");
      setImporting(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLastFile(file);
    await processFile(file, false);
  }

  async function retryUpload() {
    if (!lastFile || importing !== null) return;
    await processFile(lastFile, true);
  }


  async function importDrive() {
    if (!driveUrl.trim()) return;
    setError("");
    setImportMsg("");
    setImporting("drive");
    try {
      const extracted = await extractDriveUrl(driveUrl.trim());
      setSourceType("pdf");
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
    setEditMode(false);
    try {
      const { questions: qs, meta: m } = await generateQuestions(text, sourceType);
      setQuestions(qs);
      setMeta(m);
    } catch (err: any) {
      if (err.message?.includes("429") || err.message?.includes("quota")) {
        setError("AI quota exceeded. Tip: paste text directly — that never uses AI.");
      } else if (err.message?.includes("FAILED_PRECONDITION") || err.message?.includes("index")) {
        // Firestore index error — ignore
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!questions) return;
    setError("");
    setCreating(true);
    try {
      const r = await createForm(title, questions, expiresAt || null);
      setResult(r);
    } catch (err: any) {
      if (err?.code === "LIMIT_REACHED" || err?.code === "DAILY_LIMIT_REACHED") {
        setUnlock({ open: true, used: err?.data?.used, limit: err?.data?.limit, scope: err?.data?.scope, message: err?.message });
      } else {
        setError(err.message || "Failed to create form. Please try again.");
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
            <p className="mt-2 text-ink/70 dark:text-[#F5EDE7]/70">Share the responder link with your respondents.</p>
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-brand/15 bg-cream/70 px-3 py-2 text-left dark:border-white/10 dark:bg-white/5">
              <input
                readOnly
                value={result.responderUri}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate bg-transparent text-xs text-ink/80 outline-none dark:text-[#F5EDE7]/80"
              />
              <CopyLinkButton url={result.responderUri} size="sm" label="Copy" />
            </div>
            {expiresAt && (
              <p className="mt-2 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                ⏰ Closes on {new Date(expiresAt).toLocaleString()}
              </p>
            )}
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
            <div>
              <label className="label">Close responses after (optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="input"
                min={new Date().toISOString().slice(0, 16)}
              />
              {expiresAt && (
                <p className="mt-1 text-xs text-ink/50">
                  Form will stop accepting responses after {new Date(expiresAt).toLocaleString()}
                </p>
              )}
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={importing !== null}
                    className="btn-secondary flex-1"
                  >
                    {importing === "file" ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting...</> : <>Choose file</>}
                  </button>
                  {lastFile && (
                    <button
                      type="button"
                      onClick={retryUpload}
                      disabled={importing !== null}
                      title={
                        extractCache[fileKey(lastFile)]
                          ? `Reuse cached extract of ${lastFile.name} (${extractCache[fileKey(lastFile)].length.toLocaleString()} chars) — no AI tokens used`
                          : `Retry uploading ${lastFile.name}`
                      }
                      className="btn-secondary shrink-0"
                    >
                      <RotateCcw className="h-4 w-4" /> Retry
                    </button>
                  )}
                </div>
                {lastFile && !importing && (
                  <p className="mt-2 text-[11px] text-ink/50 dark:text-[#F5EDE7]/50">
                    {extractCache[fileKey(lastFile)]
                      ? `♻️ Retry will reuse ${extractCache[fileKey(lastFile)].length.toLocaleString()} cached chars from "${lastFile.name}" — no AI tokens used.`
                      : `Retry will re-attempt "${lastFile.name}" without re-selecting it.`}
                  </p>
                )}
                {importing === "file" && uploadStatus && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-brand/5 px-3 py-2 text-xs font-medium text-brand animate-pulse">
                    {uploadStatus}
                  </div>
                )}
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
                onChange={(e) => {
                  setText(e.target.value);
                  setSourceType("text");
                }}
                placeholder={EXAMPLE}
                className="input font-mono text-xs leading-relaxed"
              />
              <button
                type="button"
                onClick={() => { setText(EXAMPLE); setSourceType("text"); }}
                className="mt-2 text-xs font-semibold text-brand hover:underline"
              >
                Use example
              </button>
            </div>
            {error && <ErrorCard error={error} onDismiss={() => setError("")} onRetry={questions ? publish : generate} />}
            <button onClick={generate} disabled={!text.trim() || loading} className="btn-primary">
              {loading ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  {sourceType === "image" || sourceType === "scanned_pdf" ? "Parsing with AI..." : "Parsing..."}
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
                <h2 className="font-display text-xl font-bold">
                  {editMode ? "Editor" : "Preview"} · {questions.length} questions
                </h2>
                {meta && meta.estimatedMinutes > 0 && (
                  <p className="mt-1 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                    Estimated time to complete: <span className="font-semibold text-brand">~{meta.estimatedMinutes} min</span>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditMode(!editMode)}
                  className="btn-secondary"
                >
                  {editMode ? "Preview" : "✏ Edit questions"}
                </button>
                <button onClick={publish} disabled={creating} className="btn-primary">
                  {creating ? "Creating Google Form..." : "Create Google Form"}
                </button>
              </div>
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
            {editMode ? (
              <QuestionEditor
                questions={questions}
                onChange={setQuestions}
              />
            ) : (
              <div className="space-y-3">
                {questions.map((q, i) => (
                  <QuestionPreview key={i} q={q} index={i} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <UnlockDialog
        open={unlock.open}
        used={unlock.used}
        limit={unlock.limit}
        scope={unlock.scope}
        message={unlock.message}
        onClose={() => setUnlock({ open: false })}
        onUnlocked={() => {
          setUnlock({ open: false });
          publish();
        }}
      />
    </div>
  );
}