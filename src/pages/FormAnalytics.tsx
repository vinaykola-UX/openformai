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
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { auth, waitForAuthReady } from "../lib/firebase";


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

  useEffect(() => {
    if (!formId || !user) return;
    loadAnalytics();
  }, [formId, user]);

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

  return (
    <div className="flex min-h-screen flex-col bg-cream dark:bg-[#1A0E12]">
      <Navbar />

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
    </div>
  );
}