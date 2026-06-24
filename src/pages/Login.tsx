import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import { Sparkles } from "lucide-react";

export default function Login() {
  const { signIn, signInGoogle } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      nav("/dashboard");
    } catch (err: any) {
      setError(err.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setError("");
    try {
      await signInGoogle();
      nav("/dashboard");
    } catch (err: any) {
      setError(err.message || "Google sign-in failed");
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
            <h1 className="font-display text-2xl font-bold">Welcome back</h1>
            <p className="mt-1 text-sm text-ink/60 dark:text-[#F5EDE7]/60">Sign in to your OpenForm account</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-ink/40">
            <div className="h-px flex-1 bg-brand/10" /> OR <div className="h-px flex-1 bg-brand/10" />
          </div>
          <button onClick={google} className="btn-secondary w-full">Continue with Google</button>
          <p className="mt-6 text-center text-sm text-ink/60 dark:text-[#F5EDE7]/60">
            New here?{" "}
            <Link to="/signup" className="font-semibold text-brand hover:underline">Create an account</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
