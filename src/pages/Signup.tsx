import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import { Sparkles } from "lucide-react";

export default function Signup() {
  const { user, loading: authLoading, signUp, signInGoogle } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) nav("/dashboard", { replace: true });
  }, [user, authLoading, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(email, password, name);
      nav("/dashboard");
    } catch (err: any) {
      setError(err.message || "Sign-up failed");
    } finally {
      setLoading(false);
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
            <p className="mt-1 text-sm text-ink/60 dark:text-[#F5EDE7]/60">Start turning questions into forms</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-ink/40">
            <div className="h-px flex-1 bg-brand/10" /> OR <div className="h-px flex-1 bg-brand/10" />
          </div>
          <button onClick={() => signInGoogle().then(() => nav("/dashboard"))} className="btn-secondary w-full">
            Continue with Google
          </button>
          <p className="mt-6 text-center text-sm text-ink/60 dark:text-[#F5EDE7]/60">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
