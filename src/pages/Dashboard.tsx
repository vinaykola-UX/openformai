import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { Plus, ExternalLink, Edit3, Calendar, Link2Off } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

type FormDoc = {
  id: string;
  title: string;
  responderUri: string;
  editUri: string;
  questionCount: number;
  createdAt?: any;
};

export default function Dashboard() {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "forms"), where("uid", "==", user.uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setForms(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    });
    getDoc(doc(db, "users", user.uid)).then((d) => setGoogleConnected(!!d.data()?.googleRefreshToken));
    return () => unsub();
  }, [user]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Your forms</h1>
            <p className="mt-1 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              {forms.length} form{forms.length === 1 ? "" : "s"} created
            </p>
          </div>
          <Link to="/dashboard/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New form
          </Link>
        </div>

        {googleConnected === false && (
          <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 border-peach/40 bg-peach/20 p-5">
            <div className="flex items-center gap-3">
              <Link2Off className="h-5 w-5 text-brand" />
              <div>
                <p className="font-semibold">Connect your Google account</p>
                <p className="text-sm text-ink/70">Required to create Google Forms on your behalf.</p>
              </div>
            </div>
            <Link to="/connect-google" className="btn-primary">Connect Google</Link>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card h-40 animate-pulse" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <div className="card grid place-items-center p-16 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-peach">
              <Plus className="h-7 w-7 text-brand" />
            </div>
            <h3 className="font-display text-xl font-semibold">No forms yet</h3>
            <p className="mt-1 max-w-sm text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Paste your first set of exam questions and watch AI turn them into a Google Form.
            </p>
            <Link to="/dashboard/new" className="btn-primary mt-6">
              <Plus className="h-4 w-4" /> Create your first form
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map((f) => (
              <div key={f.id} className="card flex flex-col p-5">
                <h3 className="font-display text-lg font-semibold line-clamp-2">{f.title}</h3>
                <div className="mt-2 flex items-center gap-3 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                  <span>{f.questionCount} questions</span>
                  {f.createdAt?.toDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {f.createdAt.toDate().toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex gap-2 pt-4">
                  <a href={f.responderUri} target="_blank" rel="noreferrer" className="btn-secondary flex-1 !py-2 !text-xs">
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </a>
                  <a href={f.editUri} target="_blank" rel="noreferrer" className="btn-ghost flex-1 !py-2 !text-xs">
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
