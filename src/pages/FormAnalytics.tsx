import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Loader2,
  BarChart2,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ListChecks,
  Download,
  Share2,
} from "lucide-react";
import AppShell from "../components/AppShell";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { auth, waitForAuthReady } from "../lib/firebase";
import StudentImport from "../components/StudentImport";
import { getResponseTracker, updateExpectedStudents, type ResponseTracker } from "../lib/api";


type QuestionStat = {
  questionId: string;
  title: string;
  answerCount: number;
  skippedCount: number;
  responseRate: number;
};

type AnalyticsData = {
  totalResponses: number;
  avgCompletionRate: number;
  mostSkipped: { title: string; skippedCount: number } | null;
  questionStats: QuestionStat[];
  formTitle: string;
};

async function getAuthHeader(): Promise<string> {
  let user = auth.currentUser;
  if (!user) user = await waitForAuthReady();
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  return `Bearer ${token}`;
}

export default function FormAnalytics() {
  const { formId } = useParams<{ formId: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [tracker, setTracker] = useState<ResponseTracker | null>(null);
  const [trackerLoading, setTrackerLoading] = useState(true);
  const [trackerError, setTrackerError] = useState("");
  const [trackerTab, setTrackerTab] = useState<"not" | "yes">("not");
  const [importOpen, setImportOpen] = useState(false);
  const [draftStudents, setDraftStudents] = useState<string[]>([]);
  const [savingStudents, setSavingStudents] = useState(false);

  useEffect(() => {
    if (!formId || !user) return;
    loadAnalytics();
    loadTracker();
  }, [formId, user]);

  async function loadTracker() {
    if (!formId) return;
    setTrackerLoading(true);
    setTrackerError("");
    try {
      const data = await getResponseTracker(formId);
      setTracker(data);
    } catch (e: any) {
      setTrackerError(e.message || "Could not load response tracker.");
    } finally {
      setTrackerLoading(false);
    }
  }

  async function saveStudents() {
    if (!formId) return;
    setSavingStudents(true);
    try {
      await updateExpectedStudents(formId, draftStudents);
      setImportOpen(false);
      setDraftStudents([]);
      await loadTracker();
    } catch (e: any) {
      setTrackerError(e.message || "Could not save student list.");
    } finally {
      setSavingStudents(false);
    }
  }

  async function loadAnalytics() {
    setLoading(true);
    setError("");

    try {
      // ── Step 1: Get form metadata from Firestore ──
      const formSnap = await getDoc(doc(db, "forms", formId!));
      if (!formSnap.exists()) {
        setError("Form not found.");
        setLoading(false);
        return;
      }

      const formData = formSnap.data();
      const googleFormId = formData?.googleFormId;
      setFormTitle(formData?.title || "Untitled form");

      if (!googleFormId) {
        setError("This form has no linked Google Form ID.");
        setLoading(false);
        return;
      }

      // ── Step 2: Call analytics API ──
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/form-analytics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ googleFormId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load analytics.");
        setLoading(false);
        return;
      }

      setAnalytics(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }



  async function buildPDF(): Promise<Blob | null> {
    if (!analytics) return null;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const brand: [number, number, number] = [116, 26, 47];

    // Header
    doc.setFillColor(...brand);
    doc.rect(0, 0, 595, 60, "F");
    doc.setTextColor(255);
    doc.setFontSize(18);
    doc.text("OpenForm — Analytics Report", 40, 38);

    doc.setTextColor(43, 43, 43);
    doc.setFontSize(14);
    doc.text(formTitle || "Untitled form", 40, 88);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString()}`, 40, 104);

    // Summary cards
    autoTable(doc, {
      startY: 120,
      head: [["Total responses", "Avg completion", "Most skipped"]],
      body: [[
        String(analytics.totalResponses),
        `${analytics.avgCompletionRate}%`,
        analytics.mostSkipped ? analytics.mostSkipped.title : "None",
      ]],
      styles: { fontSize: 10, cellPadding: 10, halign: "center" },
      headStyles: { fillColor: brand, textColor: 255 },
    });

    // Per-question breakdown
    if (analytics.questionStats.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 24,
        head: [["#", "Question", "Answered", "Skipped", "Response rate"]],
        body: analytics.questionStats.map((q, i) => [
          i + 1, q.title, q.answerCount, q.skippedCount, `${q.responseRate}%`,
        ]),
        styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", valign: "top" },
        headStyles: { fillColor: brand, textColor: 255 },
        columnStyles: {
          0: { cellWidth: 24, halign: "center" },
          1: { cellWidth: 260 },
          2: { cellWidth: 60, halign: "center" },
          3: { cellWidth: 60, halign: "center" },
          4: { cellWidth: 80, halign: "center" },
        },
      });
    }

    // Footer
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`OpenForm · openformai.vercel.app · Page ${i} of ${pages}`, 40, 820);
    }
    return doc.output("blob");
  }

  async function downloadPDF() {
    const blob = await buildPDF();
    if (!blob) return;
    const safe = (formTitle || "analytics").replace(/[^\w-]+/g, "_");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${safe}_analytics.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  async function sharePDF() {
    const blob = await buildPDF();
    if (!blob) return;
    const safe = (formTitle || "analytics").replace(/[^\w-]+/g, "_");
    const file = new File([blob], `${safe}_analytics.pdf`, { type: "application/pdf" });
    const nav: any = window.navigator;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: `${formTitle} — Analytics`, text: "OpenForm analytics report" });
        return;
      } catch { /* user cancelled */ }
    }
    // Fallback: download it
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${safe}_analytics.pdf`; a.click();
    URL.revokeObjectURL(url);
  }



  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        {/* Back button */}
        <Link to="/dashboard" className="btn-ghost mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        {/* Page header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">
              {formTitle || "Form Analytics"}
            </h1>
            <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Response data from Google Forms
            </p>
          </div>
        </div>

        {/* ── Response Tracker ── */}
        <section className="mb-6">
          {trackerLoading && (
            <div className="card flex items-center gap-3 p-5 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking student responses...
            </div>
          )}

          {!trackerLoading && trackerError && (
            <div className="card p-5 text-sm text-red-700 dark:text-red-300">
              {trackerError}
              <button onClick={loadTracker} className="btn-secondary ml-3">Retry</button>
            </div>
          )}

          {!trackerLoading && !trackerError && tracker && !tracker.hasExpectedList && (
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">Response tracker</h2>
                  <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
                    Import your student roll numbers to see who hasn&apos;t responded.
                  </p>
                </div>
                <button onClick={() => setImportOpen((o) => !o)} className="btn-secondary">
                  <Users className="h-4 w-4" /> {importOpen ? "Cancel" : "Import student data"}
                </button>
              </div>
              {importOpen && (
                <div className="mt-4 space-y-3">
                  <StudentImport students={draftStudents} onChange={setDraftStudents} />
                  <button
                    onClick={saveStudents}
                    disabled={!draftStudents.length || savingStudents}
                    className="btn-primary"
                  >
                    {savingStudents ? "Saving..." : `Save ${draftStudents.length} students`}
                  </button>
                </div>
              )}
            </div>
          )}

          {!trackerLoading && !trackerError && tracker?.hasExpectedList && (
            <div className="card overflow-hidden p-0">
              <div className="border-b border-brand/10 p-5 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold">Response tracker</h2>
                  <button onClick={loadTracker} className="btn-ghost text-xs">🔄 Refresh</button>
                </div>
                {!tracker.rollFieldTitle && (
                  <p className="mt-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                    ⚠ No Roll / Register number question found in this form — matching against all text answers.
                  </p>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-brand/10 bg-cream/60 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
                      Total students
                    </div>
                    <div className="font-display text-2xl font-bold">{tracker.totalStudents}</div>
                  </div>
                  <div className="rounded-2xl border border-green-500/20 bg-green-50 p-4 dark:bg-green-950/20">
                    <div className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">
                      Responded
                    </div>
                    <div className="font-display text-2xl font-bold text-green-700 dark:text-green-300">
                      {tracker.respondedCount}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-red-500/25 bg-red-50 p-4 dark:bg-red-950/20">
                    <div className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                      Not responded
                    </div>
                    <div className="font-display text-2xl font-bold text-red-700 dark:text-red-300">
                      {tracker.notRespondedCount}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setTrackerTab("not")}
                    className={trackerTab === "not" ? "btn-primary" : "btn-secondary"}
                  >
                    🔴 Not responded — {tracker.notRespondedCount}
                  </button>
                  <button
                    onClick={() => setTrackerTab("yes")}
                    className={trackerTab === "yes" ? "btn-primary" : "btn-secondary"}
                  >
                    🟢 Responded — {tracker.respondedCount}
                  </button>
                </div>
              </div>

              <div className="p-5">
                {trackerTab === "not" ? (
                  tracker.notResponded.length === 0 ? (
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                      🎉 Everyone has responded.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tracker.notResponded.map((r) => (
                        <span
                          key={r}
                          className="rounded-lg border border-red-500/30 bg-red-50 px-2.5 py-1 font-mono text-xs font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )
                ) : tracker.responded.length === 0 ? (
                  <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">No responses yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tracker.responded.map((r) => (
                      <span
                        key={r}
                        className="rounded-lg border border-green-500/30 bg-green-50 px-2.5 py-1 font-mono text-xs font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-300"
                      >
                        ✓ {r}
                      </span>
                    ))}
                  </div>
                )}

                {tracker.unknownSubmissions.length > 0 && (
                  <p className="mt-4 text-xs text-ink/50 dark:text-[#F5EDE7]/50">
                    {tracker.unknownSubmissions.length} submitted roll number(s) are not in your imported list and were ignored.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Loading */}
        {loading && (
          <div className="card flex items-center justify-center gap-3 p-16 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading analytics...
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card flex flex-col items-center justify-center gap-4 p-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-950/30">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">
                Analytics unavailable
              </h2>
              <p className="mt-1 max-w-sm text-sm text-ink/60 dark:text-[#F5EDE7]/60">
                {error}
              </p>
              {error.toLowerCase().includes("google") && (
                <Link to="/connect-google" className="btn-primary mt-4">
                  Connect Google account
                </Link>
              )}
            </div>
            <button onClick={loadAnalytics} className="btn-secondary mt-2">
              Try again
            </button>
          </div>
        )}

        {/* Analytics data */}
        {!loading && !error && analytics && (
          <div className="space-y-6">

            {/* Stat cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card flex items-center gap-4 p-5">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/10 text-brand">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
                    Total responses
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {analytics.totalResponses}
                  </div>
                </div>
              </div>

              <div className="card flex items-center gap-4 p-5">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-green-50 text-green-600 dark:bg-green-950/30">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
                    Avg completion
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {analytics.avgCompletionRate}%
                  </div>
                </div>
              </div>

              <div className="card flex items-center gap-4 p-5">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/30">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
                    Most skipped
                  </div>
                  <div className="font-display text-sm font-bold leading-tight">
                    {analytics.mostSkipped
                      ? analytics.mostSkipped.title.length > 30
                        ? analytics.mostSkipped.title.slice(0, 30) + "..."
                        : analytics.mostSkipped.title
                      : "None"}
                  </div>
                </div>
              </div>
            </div>

            {/* No responses yet */}
            {analytics.totalResponses === 0 && (
              <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-peach/40 text-brand">
                  <ListChecks className="h-7 w-7" />
                </div>
                <h3 className="font-display text-lg font-bold">
                  No responses yet
                </h3>
                <p className="max-w-sm text-sm text-ink/60 dark:text-[#F5EDE7]/60">
                  Share the form link with your respondents. Analytics will
                  appear here once responses come in.
                </p>
              </div>
            )}

            {/* Per-question breakdown */}
            {analytics.totalResponses > 0 &&
              analytics.questionStats.length > 0 && (
                <div className="card p-6">
                  <h2 className="mb-5 font-display text-lg font-bold">
                    Question breakdown
                  </h2>
                  <div className="space-y-5">
                    {analytics.questionStats.map((q, i) => (
                      <div key={q.questionId || i}>
                        {/* Question title */}
                        <div className="mb-1.5 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                              {i + 1}
                            </span>
                            <p className="text-sm font-semibold text-ink dark:text-[#F5EDE7]">
                              {q.title}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-brand">
                            {q.responseRate}%
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="ml-7">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-cream dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-brand transition-all duration-500"
                              style={{ width: `${q.responseRate}%` }}
                            />
                          </div>
                          <div className="mt-1 flex gap-3 text-xs text-ink/50 dark:text-[#F5EDE7]/50">
                            <span>✅ {q.answerCount} answered</span>
                            <span>⏭ {q.skippedCount} skipped</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Actions */}
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={loadAnalytics} className="btn-secondary">
                🔄 Refresh
              </button>
              <button onClick={downloadPDF} className="btn-secondary">
                <Download className="h-4 w-4" /> Download PDF report
              </button>
              <button onClick={sharePDF} className="btn-primary">
                <Share2 className="h-4 w-4" /> Share report
              </button>
            </div>
          </div>
        )}

      </main>
    </AppShell>
  );
}