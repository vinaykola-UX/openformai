import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft, Loader2, FileSpreadsheet,
  FileText, Users, Trophy, TrendingUp,
  AlertTriangle, Download, BarChart2,
  CalendarDays, CalendarRange,
} from "lucide-react";
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { auth, waitForAuthReady } from "../lib/firebase";

type StudentResult = {
  responseId: string;
  submittedAt: string;
  name: string;
  rollNo: string;
  branch: string;
  correct: number;
  wrong: number;
  score: number;
  totalPoints: number;
  totalQuestions: number;
  percentage: number;
};

type ReportData = {
  formTitle: string;
  totalStudents: number;
  totalQuestions: number;
  totalPoints: number;
  avgScore: number;
  highest: number;
  lowest: number;
  passed: number;
  failed: number;
  students: StudentResult[];
  byBranch: Record<string, StudentResult[]>;
  branches: string[];
};

async function getAuthHeader() {
  let user = auth.currentUser;
  if (!user) user = await waitForAuthReady();
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  return `Bearer ${token}`;
}

// ── Date filter helpers ─────────────────────────────────────────────────────
type DateMode = "all" | "today" | "yesterday" | "week" | "last7" | "last10" | "custom" | "range";

const DATE_MODE_LABELS: Record<DateMode, string> = {
  all: "All time",
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  last7: "Last 7 days",
  last10: "Last 10 days",
  custom: "Custom date",
  range: "Custom range",
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/** Returns [startMs, endMs] (inclusive) for the given mode, or null for "all". */
function dateRangeFor(
  mode: DateMode,
  customDate: string,
  rangeStart: string,
  rangeEnd: string
): [number, number] | null {
  const now = new Date();
  switch (mode) {
    case "today":
      return [startOfDay(now), endOfDay(now)];
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return [startOfDay(y), endOfDay(y)];
    }
    case "week": {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay()); // back to Sunday
      return [startOfDay(start), endOfDay(now)];
    }
    case "last7": {
      const start = new Date(now); start.setDate(start.getDate() - 6);
      return [startOfDay(start), endOfDay(now)];
    }
    case "last10": {
      const start = new Date(now); start.setDate(start.getDate() - 9);
      return [startOfDay(start), endOfDay(now)];
    }
    case "custom": {
      if (!customDate) return null;
      const d = new Date(customDate + "T00:00:00");
      return [startOfDay(d), endOfDay(d)];
    }
    case "range": {
      if (!rangeStart || !rangeEnd) return null;
      const s = new Date(rangeStart + "T00:00:00");
      const e = new Date(rangeEnd + "T00:00:00");
      return [startOfDay(s), endOfDay(e)];
    }
    default:
      return null;
  }
}

function gradeColor(pct: number) {
  if (pct >= 90) return "text-green-600 dark:text-green-400";
  if (pct >= 75) return "text-brand";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function gradeBg(pct: number) {
  if (pct >= 90) return "bg-green-50 dark:bg-green-950/30";
  if (pct >= 75) return "bg-brand/5";
  if (pct >= 50) return "bg-amber-50 dark:bg-amber-950/30";
  return "bg-red-50 dark:bg-red-950/30";
}

export default function FormReport() {
  const { formId } = useParams<{ formId: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [activeBranch, setActiveBranch] = useState<string>("ALL");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [customDate, setCustomDate] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!formId || !user) return;
    loadReport();
  }, [formId, user]);

  async function loadReport() {
    setLoading(true);
    setError("");
    try {
      const formSnap = await getDoc(doc(db, "forms", formId!));
      if (!formSnap.exists()) { setError("Form not found."); setLoading(false); return; }
      const googleFormId = formSnap.data()?.googleFormId;
      if (!googleFormId) { setError("No Google Form linked."); setLoading(false); return; }

      const authHeader = await getAuthHeader();
      const res = await fetch("/api/form-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ googleFormId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load report."); setLoading(false); return; }
      setReport(data);
      if (data.branches.length > 0) setActiveBranch("ALL");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // ── Export Excel ──────────────────────────────────────────────────────────
  async function exportExcel() {
    if (!report) return;
    setExporting("excel");
    try {
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs" as any);

      const wb = XLSX.utils.book_new();

      // Overall sheet
      const overallData = [
        ["Form Title", report.formTitle],
        ["Total Students", report.totalStudents],
        ["Total Questions", report.totalQuestions],
        ["Average Score", `${report.avgScore}%`],
        ["Highest Score", `${report.highest}%`],
        ["Lowest Score", `${report.lowest}%`],
        ["Passed (≥50%)", report.passed],
        ["Failed (<50%)", report.failed],
        [],
        ["Roll No", "Name", "Branch", "Correct", "Wrong", "Score", "Total", "%"],
        ...report.students.map(s => [
          s.rollNo, s.name, s.branch, s.correct, s.wrong,
          s.score, s.totalPoints, `${s.percentage}%`
        ]),
      ];
      const wsAll = XLSX.utils.aoa_to_sheet(overallData);
XLSX.utils.book_append_sheet(wb, wsAll, "All Students");

      // Per-branch sheets
      report.branches.forEach(branch => {
        const students = report.byBranch[branch] || [];
        const data = [
          ["Branch", branch],
          ["Students", students.length],
          [],
          ["Roll No", "Name", "Correct", "Wrong", "Score", "Total", "%"],
          ...students.map(s => [
            s.rollNo, s.name, s.correct, s.wrong,
            s.score, s.totalPoints, `${s.percentage}%`
          ]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, branch.slice(0, 31));
      });

      XLSX.writeFile(wb, `${report.formTitle.replace(/[^a-z0-9]/gi, "_")}_report.xlsx`);
    } catch (err: any) {
      alert("Excel export failed: " + err.message);
    } finally {
      setExporting(null);
    }
  }

  // ── Export PDF ────────────────────────────────────────────────────────────
  function exportPDF() {
    window.print();
  }

  const branchStudents = activeBranch === "ALL"
    ? report?.students || []
    : report?.byBranch[activeBranch] || [];

  const activeRange = dateRangeFor(dateMode, customDate, rangeStart, rangeEnd);

  const displayStudents = activeRange
    ? branchStudents.filter(s => {
        const t = new Date(s.submittedAt).getTime();
        return t >= activeRange[0] && t <= activeRange[1];
      })
    : branchStudents;

  const periodStats = (() => {
    const n = displayStudents.length;
    if (n === 0) return { count: 0, avg: 0, highest: 0, lowest: 0, passed: 0 };
    const sum = displayStudents.reduce((s, r) => s + r.percentage, 0);
    return {
      count: n,
      avg: Math.round(sum / n),
      highest: Math.max(...displayStudents.map(r => r.percentage)),
      lowest: Math.min(...displayStudents.map(r => r.percentage)),
      passed: displayStudents.filter(r => r.percentage >= 50).length,
    };
  })();

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .card { box-shadow: none; border: 1px solid #ddd; }
        }
      `}</style>

      <div className="flex min-h-screen flex-col bg-cream dark:bg-[#1A0E12]">
        <div className="no-print">
          <Navbar />
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6" ref={printRef}>
          {/* Back + actions */}
          <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link to="/dashboard" className="btn-ghost -ml-2">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            {report && (
              <div className="flex gap-2">
                <button
                  onClick={exportExcel}
                  disabled={exporting !== null}
                  className="btn-secondary gap-2"
                >
                  {exporting === "excel"
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <FileSpreadsheet className="h-4 w-4" />}
                  Export Excel
                </button>
                <button onClick={exportPDF} className="btn-primary gap-2">
                  <FileText className="h-4 w-4" /> Export PDF
                </button>
              </div>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="card flex items-center justify-center gap-3 p-16">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
              <span className="text-sm text-ink/60">Loading report...</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="card flex flex-col items-center gap-4 p-16 text-center">
              <AlertTriangle className="h-10 w-10 text-red-400" />
              <p className="font-bold">Report unavailable</p>
              <p className="text-sm text-ink/60">{error}</p>
              <button onClick={loadReport} className="btn-secondary">Try again</button>
            </div>
          )}

          {/* Report */}
          {!loading && !error && report && (
            <div className="space-y-6">

              {/* Cover / Header */}
              <div className="card overflow-hidden">
                <div className="bg-brand-gradient p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                        OpenForm Report
                      </p>
                      <h1 className="mt-1 font-display text-2xl font-bold">
                        {report.formTitle}
                      </h1>
                      <p className="mt-1 text-sm text-white/70">
                        Generated on {new Date().toLocaleDateString(undefined, {
                          weekday: "long", year: "numeric", month: "long", day: "numeric"
                        })}
                      </p>
                    </div>
                    <BarChart2 className="h-10 w-10 text-white/30" />
                  </div>
                </div>
              </div>

              {/* Overall stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Users, label: "Total students", value: report.totalStudents },
                  { icon: TrendingUp, label: "Average score", value: `${report.avgScore}%` },
                  { icon: Trophy, label: "Highest score", value: `${report.highest}%` },
                  { icon: BarChart2, label: "Pass rate", value: `${Math.round((report.passed / Math.max(report.totalStudents, 1)) * 100)}%` },
                ].map((s, i) => (
                  <div key={i} className="card p-4">
                    <s.icon className="h-4 w-4 text-brand mb-2" />
                    <p className="text-xs text-ink/50 uppercase tracking-wide">{s.label}</p>
                    <p className="font-display text-xl font-bold">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Pass / Fail */}
              <div className="card p-4">
                <div className="mb-2 flex justify-between text-xs font-semibold">
                  <span className="text-green-600">✅ Passed: {report.passed}</span>
                  <span className="text-red-500">❌ Failed: {report.failed}</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-red-100 dark:bg-red-950/30">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${Math.round((report.passed / Math.max(report.totalStudents, 1)) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Date filter */}
              <div className="no-print card p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <CalendarDays className="h-4 w-4 text-brand" /> Filter by date
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["all", "today", "yesterday", "week", "last7", "last10"] as DateMode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setDateMode(m)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        dateMode === m
                          ? "bg-brand text-white"
                          : "bg-cream text-ink/60 hover:bg-brand/10 dark:bg-white/5 dark:text-[#F5EDE7]/60"
                      }`}
                    >
                      {DATE_MODE_LABELS[m]}
                    </button>
                  ))}
                  <button
                    onClick={() => setDateMode("custom")}
                    className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      dateMode === "custom"
                        ? "bg-brand text-white"
                        : "bg-cream text-ink/60 hover:bg-brand/10 dark:bg-white/5 dark:text-[#F5EDE7]/60"
                    }`}
                  >
                    <CalendarDays className="h-3.5 w-3.5" /> Pick a date
                  </button>
<button
                    onClick={() => setDateMode("range")}
                    className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      dateMode === "range"
                        ? "bg-brand text-white"
                        : "bg-cream text-ink/60 hover:bg-brand/10 dark:bg-white/5 dark:text-[#F5EDE7]/60"
                    }`}
                  >
                    <CalendarRange className="h-3.5 w-3.5" /> Date range
                  </button>
                </div>

                {dateMode === "custom" && (
                  <div className="mt-3">
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="input w-full sm:w-56"
                    />
                  </div>
                )}
                {dateMode === "range" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="input w-full sm:w-48"
                    />
                    <span className="text-xs text-ink/50">to</span>
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="input w-full sm:w-48"
                    />
                  </div>
                )}

                {/* Period summary — only when a filter narrower than "all" is active */}
                {dateMode !== "all" && (
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-brand/5 pt-3 dark:border-white/5 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-ink/50 uppercase tracking-wide">Filled</p>
                      <p className="font-display text-lg font-bold">{periodStats.count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink/50 uppercase tracking-wide">Avg score</p>
                      <p className="font-display text-lg font-bold">{periodStats.avg}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink/50 uppercase tracking-wide">Highest</p>
                      <p className="font-display text-lg font-bold">{periodStats.highest}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink/50 uppercase tracking-wide">Passed</p>
                      <p className="font-display text-lg font-bold">{periodStats.passed}/{periodStats.count}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Branch tabs */}
              {report.branches.length > 1 && (
                <div className="no-print flex flex-wrap gap-2">
                  {["ALL", ...report.branches].map(b => (
                    <button
                      key={b}
                      onClick={() => setActiveBranch(b)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                        activeBranch === b
                          ? "bg-brand text-white"
                          : "bg-white text-ink/60 hover:bg-brand/5 dark:bg-[#241218] dark:text-[#F5EDE7]/60"
                      }`}
                    >
                      {b === "ALL" ? "All branches" : b}
                      {b !== "ALL" && (
                        <span className="ml-1 opacity-60">
                          ({report.byBranch[b]?.length || 0})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Student table */}
              {report.totalStudents === 0 ? (
                <div className="card flex flex-col items-center gap-3 p-12 text-center">
                  <Users className="h-10 w-10 text-ink/20" />
                  <p className="font-bold">No responses yet</p>
                  <p className="text-sm text-ink/60">
                    Share the form link with students. Results will appear here once they submit.
                  </p>
                </div>
              ) : displayStudents.length === 0 ? (
                <div className="card flex flex-col items-center gap-3 p-12 text-center">
                  <CalendarDays className="h-10 w-10 text-ink/20" />
                  <p className="font-bold">No responses in this period</p>
                  <p className="text-sm text-ink/60">
                    Try a different date, range, or select "All time".
                  </p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-brand/5 px-5 py-3 dark:border-white/5">
                    <h2 className="font-display font-bold">
                      {activeBranch === "ALL" ? "All students" : activeBranch}
                      <span className="ml-2 text-sm font-normal text-ink/50">
                        ({displayStudents.length} students)
                      </span>
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-brand/5 bg-cream/50 dark:border-white/5 dark:bg-white/5">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">Roll No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">Branch</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">✅ Correct</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">❌ Wrong</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">Score</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayStudents.map((s, i) => (
                          <tr
                            key={s.responseId}
                            className="border-b border-brand/5 transition hover:bg-brand/5 dark:border-white/5 dark:hover:bg-white/5"
                          >
                            <td className="px-4 py-3 text-xs text-ink/40">{i + 1}</td>
                            <td className="px-4 py-3 font-mono text-xs font-semibold">{s.rollNo}</td>
                            <td className="px-4 py-3 font-semibold">{s.name}</td>
                            <td className="px-4 py-3 text-xs text-ink/60">{s.branch}</td>
                            <td className="px-4 py-3 text-center font-semibold text-green-600">{s.correct}</td>
                            <td className="px-4 py-3 text-center font-semibold text-red-500">{s.wrong}</td>
                            <td className="px-4 py-3 text-center font-semibold">
                              {s.score}/{s.totalPoints}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${gradeBg(s.percentage)} ${gradeColor(s.percentage)}`}>
                                {s.percentage}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-branch breakdown for PDF */}
              {report.branches.length > 1 && (
                <div className="space-y-4">
                  <h2 className="font-display text-lg font-bold">Branch-wise Summary</h2>
                  {report.branches.map(branch => {
                    const students = report.byBranch[branch] || [];
                    const avg = students.length > 0
                      ? Math.round(students.reduce((s, r) => s + r.percentage, 0) / students.length)
                      : 0;
                    const passed = students.filter(s => s.percentage >= 50).length;
                    return (
                      <div key={branch} className="card p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-display font-bold">{branch}</h3>
                            <p className="text-xs text-ink/50">{students.length} students</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-display text-lg font-bold ${gradeColor(avg)}`}>{avg}% avg</p>
                            <p className="text-xs text-ink/50">{passed}/{students.length} passed</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-cream dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-brand transition-all"
                            style={{ width: `${avg}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="text-center text-xs text-ink/30">
                © {new Date().getFullYear()} OpenForm · Generated automatically
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}