import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { CheckCircle2, Link as LinkIcon, ArrowLeft } from "lucide-react";
import AppShell from "../components/AppShell";
import ErrorCard from "../components/ErrorCard";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { getGoogleAuthUrl } from "../lib/api";

export default function ConnectGoogle() {
  const { user } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((d) => setConnected(!!d.data()?.googleRefreshToken));
  }, [user]);

  async function connect() {
    setError("");
    setLoading(true);
    try {
      const url = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/dashboard" className="btn-ghost mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="card p-8 sm:p-10">
          <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-peach text-brand">
            {connected ? <CheckCircle2 className="h-7 w-7" /> : <LinkIcon className="h-7 w-7" />}
          </div>
          <h1 className="font-display text-2xl font-bold">
            {connected ? "Google account connected" : "Connect your Google account"}
          </h1>
          <p className="mt-2 text-ink/70 dark:text-[#F5EDE7]/70">
            OpenForm needs permission to create Google Forms on your behalf. The form is created on your Google Drive — we never see student responses.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-ink/70 dark:text-[#F5EDE7]/70">
            <li>✓ Scope requested: <code className="rounded bg-brand/5 px-1.5 py-0.5">forms.body</code></li>
            <li>✓ You can revoke access anytime from your Google account</li>
          </ul>
          {error && <div className="mt-4"><ErrorCard error={error} onDismiss={() => setError("")} /></div>}
          <button onClick={connect} disabled={loading} className="btn-primary mt-6">
            {loading ? "Redirecting..." : connected ? "Reconnect" : "Connect Google"}
          </button>
        </div>
      </main>
    </AppShell>
  );
}