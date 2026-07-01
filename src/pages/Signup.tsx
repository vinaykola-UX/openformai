import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import GoogleIcon from "../components/GoogleIcon";
import ErrorCard from "../components/ErrorCard";
import { Sparkles, Loader2 } from "lucide-react";

export default function Signup() {
  const { user, loading: authLoading, signInGoogle } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) nav("/dashboard", { replace: true });
  }, [user, authLoading, nav]);

  async function google() {
    setError("");
    setBusy(true);
    try {
      await signInGoogle();
      nav("/dashboard");
    } catch (err: any) {
      setError(err.message || "Google sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white">
              <Sparkles className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-bold">Create your account</h1>
            <p className="mt-1 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Get started in seconds with your Google account.
            </p>
          </div>

          {error && (
            <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            onClick={google}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-brand/15 bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm transition hover:bg-cream disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-[#F5EDE7] dark:hover:bg-white/15"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon />}
            {busy ? "Creating account…" : "Sign up with Google"}
          </button>

          <p className="mt-6 text-center text-xs text-ink/50 dark:text-[#F5EDE7]/50">
            By signing up you agree to our{" "}
            <a href="/terms" className="font-semibold text-brand hover:underline">Terms</a> and{" "}
            <a href="/privacy" className="font-semibold text-brand hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
