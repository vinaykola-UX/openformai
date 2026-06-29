import { useState } from "react";
import { Lock, Loader2, X, Mail } from "lucide-react";
import { unlockAccount } from "../lib/api";

export default function UnlockDialog({
  open,
  used,
  limit,
  scope,
  message,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  used?: number;
  limit?: number;
  scope?: string;
  message?: string;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await unlockAccount(passcode);
      setPasscode("");
      onUnlocked();
    } catch (err: any) {
      setError(err.message || "Invalid passcode");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="card relative w-full max-w-md p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-ink/50 hover:bg-cream dark:text-[#F5EDE7]/60 dark:hover:bg-white/10"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white">
          <Lock className="h-5 w-5" />
        </div>
        <h2 className="font-display text-xl font-bold">
          {scope === "daily"
            ? "Daily limit reached"
            : scope === "total"
            ? "Monthly limit reached"
            : "Unlock unlimited forms"}
        </h2>
        <p className="mt-1 text-sm text-ink/70 dark:text-[#F5EDE7]/70">
          {scope === "daily"
            ? `You've used your ${limit ?? 5} forms for today. Come back tomorrow or enter the passcode to keep going.`
            : scope === "total"
            ? "You've reached the monthly limit. Upgrade by entering the passcode to keep creating forms."
            : "Enter the unlock passcode to keep going."}
        </p>

        <div className="mt-4 rounded-2xl border border-brand/15 bg-cream/70 p-3 text-xs text-ink/70 dark:border-white/10 dark:bg-white/5 dark:text-[#F5EDE7]/70">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-brand">
            <Mail className="h-3.5 w-3.5" /> Don't have a passcode?
          </div>
          Request one by emailing{" "}
          <a
            href="mailto:teamspendly@gmail.com?subject=OpenForm%20unlock%20passcode%20request"
            className="font-semibold text-brand underline"
          >
            teamspendly@gmail.com
          </a>
          .
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label className="label">Passcode</label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoFocus
              placeholder="Enter your passcode"
              className="input"
            />
          </div>
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}
          <button type="submit" disabled={!passcode.trim() || loading} className="btn-primary w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Unlocking…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> Unlock
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
