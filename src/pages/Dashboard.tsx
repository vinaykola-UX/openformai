import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
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
  Search,
  Loader2,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";

type FormDoc = {
  id: string;
  title: string;
  responderUri: string;
  editUri: string;
  questionCount: number;
  googleFormId: string;
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

export default function Dashboard() {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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
    const orderedQ = query(baseQ, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      orderedQ,
      (snap) => {
        setForms(mapDocs(snap));
        setLoading(false);
      },
      (err) => {
        console.warn("[dashboard] ordered query failed, falling back", err);
        // Composite index missing — fall back to unordered query, sort client-side.
        const unsub2 = onSnapshot(
          baseQ,
          (snap) => {
            setForms(mapDocs(snap));
            setLoading(false);
          },
          (err2) => {
            console.error("[dashboard] forms snapshot failed", err2);
            setLoading(false);
          }
        );
        return unsub2;
      }
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

  const firstName = (user?.displayName || user?.email || "there").split(/[\s@]/)[0];

  return (
    <div className="flex min-h-screen flex-col bg-cream dark:bg-[#1A0E12]">
      <Navbar />

      <main className="flex-1 px-4 py-8 sm:py-12">
        <div className="mx-auto w-full max-w-6xl">
          {/* Hero / header */}
          <div className="relative overflow-hidden rounded-3xl bg-brand-gradient p-6 text-white shadow-card sm:p-10">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-peach/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" /> OpenForm Studio
                </div>
                <h1 className="font-display text-2xl font-bold sm:text-4xl">
                  Welcome back, {firstName}
                </h1>
                <p className="mt-2 max-w-xl text-sm text-white/80 sm:text-base">
                  Paste exam questions, drop a file, or import from Google Drive. We turn them into real Google Forms in seconds.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/dashboard/new"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-brand shadow-card transition hover:bg-peach-50 active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" /> New form
                </Link>
                <Link
                  to="/connect-google"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  <Link2 className="h-4 w-4" /> Google account
                </Link>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={<FileText className="h-5 w-5" />}
              label="Forms created"
              value={loading ? "—" : String(forms.length)}
            />
            <StatCard
              icon={<ListChecks className="h-5 w-5" />}
              label="Total questions"
              value={loading ? "—" : String(totalQuestions)}
            />
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              label="Last activity"
              value={loading ? "—" : forms[0] ? formatDate(forms[0].createdAt) : "No forms yet"}
            />
          </div>

          {/* Quick actions */}
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <QuickAction
              to="/dashboard/new"
              title="Paste questions"
              description="Drop raw text from any exam — we'll parse the structure."
              icon={<Sparkles className="h-5 w-5" />}
            />
            <QuickAction
              to="/dashboard/new"
              title="Upload a file"
              description="PDF, DOCX, TXT or an image of a worksheet."
              icon={<FileText className="h-5 w-5" />}
            />
            <QuickAction
              to="/dashboard/new"
              title="Import from Drive"
              description="Paste a Google Drive or Docs share link."
              icon={<Link2 className="h-5 w-5" />}
            />
          </div>

          {/* Forms list */}
          <div className="mt-10">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-bold">Your forms</h2>
                <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
                  Everything you've generated, synced live from Firestore.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40 dark:text-[#F5EDE7]/40" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search forms"
                  className="input pl-9"
                />
              </div>
            </div>

            {loading ? (
              <div className="card flex items-center justify-center gap-2 p-12 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your forms…
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState hasAny={forms.length > 0} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
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
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-peach/40 text-brand">
        {icon}
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
          {label}
        </div>
        <div className="font-display text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  title,
  description,
  icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="card group flex items-start gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-glow"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-white">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold">{title}</h3>
          <ChevronRight className="h-4 w-4 text-ink/40 transition group-hover:translate-x-0.5 group-hover:text-brand dark:text-[#F5EDE7]/40" />
        </div>
        <p className="mt-1 text-sm text-ink/60 dark:text-[#F5EDE7]/60">{description}</p>
      </div>
    </Link>
  );
}

function FormCard({ form }: { form: FormDoc }) {
  return (
    <div className="card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-bold">{form.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
            <span className="chip">
              <ListChecks className="h-3 w-3" /> {form.questionCount} questions
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatDate(form.createdAt)}
            </span>
          </div>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-peach/40 text-brand">
          <FileText className="h-5 w-5" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={form.responderUri}
          target="_blank"
          rel="noreferrer"
          className="btn-primary !py-2 !px-3 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </a>
        <a
          href={form.editUri}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary !py-2 !px-3 text-xs"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </a>
      </div>
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
