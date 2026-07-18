import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import {
  Plus,
  FileText,
  ExternalLink,
  Pencil,
  Sparkles,
  ListChecks,
  Clock,
  Link2,
  ChevronRight,
  ArrowUpRight,
  Search,
  Loader2,
  Lock,
  BarChart2,
  Trash2,
  Wand2,
  Brain,
  Layers,
  Infinity as InfinityIcon,
} from "lucide-react";
import AppShell from "../components/AppShell";
import CopyLinkButton from "../components/CopyLinkButton";
import Footer from "../components/Footer";
import UnlockDialog from "../components/UnlockDialog";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { deleteForm } from "../lib/api";

type FormDoc = {
  id: string;
  title: string;
  responderUri: string;
  editUri: string;
  questionCount: number;
  googleFormId: string;
  expiresAt?: any;
  createdAt?: Timestamp;
};

function formatDate(ts?: Timestamp) {
  if (!ts) return "Just now";
  const d = ts.toDate();
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type QuickAction = {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  iconBg: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    to: "/dashboard/new",
    icon: <Wand2 className="h-5 w-5" />,
    title: "New Form",
    subtitle: "Paste or upload",
    iconBg: "bg-gradient-to-br from-brand to-brand/70",
  },
  {
    to: "/ai-quiz",
    icon: <Brain className="h-5 w-5" />,
    title: "AI Quiz",
    subtitle: "From study notes",
    iconBg: "bg-gradient-to-br from-violet-500 to-indigo-500",
  },
  {
    to: "/automate",
    icon: <Layers className="h-5 w-5" />,
    title: "Automate",
    subtitle: "Whole subject, unit-wise",
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-500",
  },
  {
    to: "/connect-google",
    icon: <Link2 className="h-5 w-5" />,
    title: "Google Account",
    subtitle: "Connect to create forms",
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-500",
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const DAILY_LIMIT = 5;
  const TOTAL_LIMIT = 80;

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setUnlocked(!!snap.data()?.unlocked);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const mapDocs = (snap: any): FormDoc[] => {
      const list: FormDoc[] = snap.docs.map((d: any) => ({
        id: d.id,
        ...(d.data() as Omit<FormDoc, "id">),
      }));
      list.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      return list;
    };
    const baseQ = query(collection(db, "forms"), where("uid", "==", user.uid));
    const unsub = onSnapshot(
      baseQ,
      (snap) => { setForms(mapDocs(snap)); setLoading(false); },
      (err) => { console.error("[dashboard] forms snapshot failed", err); setLoading(false); }
    );
    return () => unsub();
  }, [user]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return forms;
    return forms.filter((f) => f.title?.toLowerCase().includes(s));
  }, [forms, search]);

  const totalQuestions = useMemo(
    () => forms.reduce((sum, f) => sum + (f.questionCount || 0), 0),
    [forms]
  );

  const todayCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return forms.filter((f) => {
      const t = f.createdAt?.toDate().getTime();
      return typeof t === "number" && t >= start;
    }).length;
  }, [forms]);

  const firstName = (user?.displayName || user?.email || "there").split(/[\s@]/)[0];

  return (
    <AppShell>
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 px-4 py-8 sm:py-12">
          <div className="mx-auto w-full max-w-4xl">

            {/* ── Hero ── */}
            <div className="relative overflow-hidden rounded-3xl bg-brand-gradient p-6 text-white shadow-card sm:p-10">
              <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-peach/30 blur-3xl" />
              <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
              <div className="relative">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" /> OpenForm Studio
                </div>
                <h1 className="font-display text-2xl font-bold sm:text-3xl">
                  Welcome back, {firstName} 👋
                </h1>
                <p className="mt-2 text-sm text-white/80 sm:text-base">
                  Turn any text, PDF, or image into a real Google Form in seconds.
                </p>
              </div>
            </div>

            {/* ── Quick actions ── */}
            <div className="relative -mt-6 px-1 sm:-mt-8">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {QUICK_ACTIONS.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-brand/10 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-glow dark:border-white/10 dark:bg-[#241218]"
                  >
                    <div className="flex items-center justify-between">
                      <div className={`grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm ${action.iconBg}`}>
                        {action.icon}
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-ink/20 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand dark:text-[#F5EDE7]/20" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink dark:text-[#F5EDE7]">{action.title}</p>
                      <p className="text-xs text-ink/50 dark:text-[#F5EDE7]/50">{action.subtitle}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* ── Stats ── */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card flex flex-col gap-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50 dark:text-[#F5EDE7]/50">Forms</p>
                <p className="font-display text-2xl font-bold">{loading ? "—" : forms.length}</p>
              </div>
              <div className="card flex flex-col gap-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50 dark:text-[#F5EDE7]/50">Questions</p>
                <p className="font-display text-2xl font-bold">{loading ? "—" : totalQuestions}</p>
              </div>
              <div className="card flex flex-col gap-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50 dark:text-[#F5EDE7]/50">Last active</p>
                <p className="font-display text-base font-bold">{loading ? "—" : forms[0] ? formatDate(forms[0].createdAt) : "—"}</p>
              </div>
              <div className="card flex flex-col gap-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50 dark:text-[#F5EDE7]/50">Plan</p>
                <p className="font-display text-base font-bold">
                  {unlocked ? "∞ Unlimited" : `${Math.min(todayCount, DAILY_LIMIT)}/${DAILY_LIMIT} today`}
                </p>
                {!unlocked && (
                  <button onClick={() => setShowUnlock(true)} className="mt-1 text-left text-xs font-semibold text-brand hover:underline">
                    Unlock →
                  </button>
                )}
              </div>
            </div>

            {/* ── Forms list ── */}
            <div className="mt-8">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold">Your forms</h2>
                  <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
                    {forms.length} form{forms.length !== 1 ? "s" : ""} created
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search forms..."
                    className="input pl-9"
                  />
                </div>
              </div>

              {loading ? (
                <div className="card flex items-center justify-center gap-2 p-12 text-sm text-ink/60">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading your forms…
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState hasAny={forms.length > 0} />
              ) : (
                <div className="space-y-3">
                  {filtered.map((f) => (
                    <FormCard key={f.id} form={f} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        <Footer />
      </div>

      <UnlockDialog
        open={showUnlock}
        used={forms.length}
        limit={TOTAL_LIMIT}
        onClose={() => setShowUnlock(false)}
        onUnlocked={() => setShowUnlock(false)}
      />
    </AppShell>
  );
}

function FormCard({ form }: { form: FormDoc }) {
  const nav = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteForm(form.id, form.googleFormId);
    } catch (err: any) {
      alert(err.message || "Delete failed. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const isExpired = form.expiresAt
    ? (form.expiresAt.toDate ? form.expiresAt.toDate() : new Date(form.expiresAt)) < new Date()
    : false;

  return (
    <div className="card p-4 transition hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-bold text-ink dark:text-[#F5EDE7]">
              {form.title}
            </h3>
            {isExpired && (
              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-300">
                🔴 Closed
              </span>
            )}
            {!isExpired && form.expiresAt && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-950/30 dark:text-amber-300">
                ⏰ Expires
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-ink/50 dark:text-[#F5EDE7]/50">
            <span className="flex items-center gap-1">
              <ListChecks className="h-3 w-3" /> {form.questionCount} questions
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatDate(form.createdAt)}
            </span>
          </div>
        </div>

        <a
          href={form.responderUri}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand/90"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </a>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-brand/5 pt-3 dark:border-white/5">
        <a
          href={form.editUri}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-brand/5 hover:text-brand dark:text-[#F5EDE7]/60 transition"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </a>

        <CopyLinkButton url={form.responderUri} size="sm" label="Copy" />

        <button
          onClick={() => nav(`/dashboard/analytics/${form.id}`)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-brand/5 hover:text-brand dark:text-[#F5EDE7]/60 transition"
        >
          <BarChart2 className="h-3.5 w-3.5" /> Analytics
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {confirmDelete && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-950/30">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            Delete "{form.title}"?
          </p>
          <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">
            Removes from OpenForm and Google Forms permanently.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="btn-ghost !py-1.5 !px-3 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-peach/40 text-brand">
        <Sparkles className="h-7 w-7" />
      </div>
      <h3 className="font-display text-lg font-bold">
        {hasAny ? "No matches" : "No forms yet"}
      </h3>
      <p className="max-w-sm text-sm text-ink/60 dark:text-[#F5EDE7]/60">
        {hasAny
          ? "Try a different search term."
          : "Create your first Google Form from pasted text, an uploaded file, or a Drive link."}
      </p>
      {!hasAny && (
        <Link to="/dashboard/new" className="btn-primary mt-2">
          <Plus className="h-4 w-4" /> Create your first form
        </Link>
      )}
    </div>
  );
}