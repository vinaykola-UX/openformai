import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Loader2, AlertTriangle, Users, Layers,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Search,
} from "lucide-react";
import AppShell from "../components/AppShell";
import { useAuth } from "../contexts/AuthContext";
import { auth, waitForAuthReady } from "../lib/firebase";

type QuizAttempt = {
  formId: string;
  formTitle: string;
  percentage: number;
  correct: number;
  totalQuestions: number;
  submittedAt: string;
};

type StudentOverall = {
  rollNo: string;
  name: string;
  branch: string;
  attempts: number;
  avgPercentage: number;
  best: number;
  worst: number;
  trend: "improving" | "declining" | "stable" | "n/a";
  quizzes: QuizAttempt[];
};

type OverallData = {
  quizzesAnalyzed: number;
  totalStudents: number;
  avgAcrossAll: number;
  students: StudentOverall[];
};

async function getAuthHeader(): Promise<string> {
  let user = auth.currentUser;
  if (!user) user = await waitForAuthReady();
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  return `Bearer ${token}`;
}

function gradeColor(pct: number) {
  if (pct >= 90) return "text-green-600 dark:text-green-400";
  if (pct >= 75) return "text-brand";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function TrendBadge({ trend }: { trend: StudentOverall["trend"] }) {
  if (trend === "improving")
    return <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><TrendingUp className="h-3.5 w-3.5" /> Improving</span>;
  if (trend === "declining")
    return <span className="flex items-center gap-1 text-xs font-semibold text-red-500"><TrendingDown className="h-3.5 w-3.5" /> Declining</span>;
  if (trend === "stable")
    return <span className="flex items-center gap-1 text-xs font-semibold text-ink/50"><Minus className="h-3.5 w-3.5" /> Stable</span>;
  return <span className="text-xs text-ink/30">—</span>;
}

export default function OverallReview() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<OverallData | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"avg" | "attempts" | "name">("avg");

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/overall-review", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to load overall review."); setLoading(false); return; }
      setData(json);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = (data?.students || [])
    .filter(s => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "avg") return b.avgPercentage - a.avgPercentage;
      if (sortBy === "attempts") return b.attempts - a.attempts;
      return a.name.localeCompare(b.name);
    });

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/dashboard" className="btn-ghost mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Overall Review</h1>
            <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Every student's performance across all of your quizzes
            </p>
          </div>
        </div>

        {loading && (
          <div className="card flex items-center justify-center gap-3 p-16 text-sm text-ink/60">
            <Loader2 className="h-5 w-5 animate-spin" /> Analyzing all quizzes...
          </div>
        )}

        {!loading && error && (
          <div className="card flex flex-col items-center gap-4 p-16 text-center">
            <AlertTriangle className="h-10 w-10 text-red-400" />
            <p className="font-bold">Overall review unavailable</p>
            <p className="text-sm text-ink/60">{error}</p>
            {error.toLowerCase().includes("google") && (
              <Link to="/connect-google" className="btn-primary mt-2">Connect Google account</Link>
            )}
            <button onClick={load} className="btn-secondary">Try again</button>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Quizzes analyzed</p>
                <p className="font-display text-2xl font-bold">{data.quizzesAnalyzed}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Unique students</p>
                <p className="font-display text-2xl font-bold">{data.totalStudents}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Average across all quizzes</p>
                <p className="font-display text-2xl font-bold">{data.avgAcrossAll}%</p>
              </div>
            </div>

            {data.totalStudents === 0 ? (
              <div className="card flex flex-col items-center gap-3 p-12 text-center">
                <Users className="h-10 w-10 text-ink/20" />
                <p className="font-bold">No graded quiz data yet</p>
                <p className="text-sm text-ink/60 max-w-sm">
                  Create quizzes with an answer key (so responses can be graded), and once
                  students respond, they'll show up here matched by roll number or name.
                </p>
              </div>
            ) : (
              <>
                {/* Search + sort */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or roll no..."
                      className="input pl-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    {([
                      ["avg", "Avg score"],
                      ["attempts", "Quizzes taken"],
                      ["name", "Name"],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSortBy(key)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          sortBy === key
                            ? "bg-brand text-white"
                            : "bg-cream text-ink/60 hover:bg-brand/10 dark:bg-white/5 dark:text-[#F5EDE7]/60"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Leaderboard */}
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-brand/5 bg-cream/50 dark:border-white/5 dark:bg-white/5">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">Roll No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">Name</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">Quizzes</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">Avg</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">Best</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">Worst</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">Trend</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s, i) => {
                          const key = `${s.rollNo}-${s.name}`;
                          const isOpen = expanded === key;
                          return (
                            <>
                              <tr
                                key={key}
                                onClick={() => setExpanded(isOpen ? null : key)}
                                className="cursor-pointer border-b border-brand/5 transition hover:bg-brand/5 dark:border-white/5 dark:hover:bg-white/5"
                              >
                                <td className="px-4 py-3 text-xs text-ink/40">{i + 1}</td>
                                <td className="px-4 py-3 font-mono text-xs font-semibold">{s.rollNo}</td>
                                <td className="px-4 py-3 font-semibold">{s.name}</td>
                                <td className="px-4 py-3 text-center">{s.attempts}</td>
                                <td className={`px-4 py-3 text-center font-bold ${gradeColor(s.avgPercentage)}`}>{s.avgPercentage}%</td>
                                <td className="px-4 py-3 text-center text-xs text-ink/60">{s.best}%</td>
                                <td className="px-4 py-3 text-center text-xs text-ink/60">{s.worst}%</td>
                                <td className="px-4 py-3 text-center"><TrendBadge trend={s.trend} /></td>
                                <td className="px-4 py-3 text-center">
                                  {isOpen ? <ChevronUp className="h-4 w-4 text-ink/40" /> : <ChevronDown className="h-4 w-4 text-ink/40" />}
                                </td>
                              </tr>
                              {isOpen && (
                                <tr key={`${key}-detail`} className="border-b border-brand/5 bg-cream/30 dark:border-white/5 dark:bg-white/5">
                                  <td colSpan={9} className="px-6 py-4">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
                                      Quiz history ({s.quizzes.length})
                                    </p>
                                    <div className="space-y-1.5">
                                      {s.quizzes.map((q, qi) => (
                                        <div key={qi} className="flex items-center justify-between text-xs">
                                          <span className="text-ink/70">{q.formTitle}</span>
                                          <span className="text-ink/40">
                                            {q.submittedAt ? new Date(q.submittedAt).toLocaleDateString() : ""}
                                          </span>
                                          <span className={`font-bold ${gradeColor(q.percentage)}`}>
                                            {q.correct}/{q.totalQuestions} · {q.percentage}%
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-center">
              <button onClick={load} className="btn-secondary">🔄 Refresh</button>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}