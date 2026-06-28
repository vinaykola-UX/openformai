import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  deleteUser,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, deleteDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const REASONS = [
  "I no longer need OpenForm",
  "I found a better alternative",
  "Privacy concerns",
  "Too expensive",
  "Missing features I need",
  "Other",
];

type Props = { open: boolean; onClose: () => void; onDeleted: () => void };

export default function DeleteAccountDialog({ open, onClose, onDeleted }: Props) {
  const user = auth.currentUser;
  const isPassword = user?.providerData[0]?.providerId === "password";
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setFeedback("");
      setUnderstood(false);
      setTyped("");
      setPassword("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  if (!open || !user) return null;

  const canSubmit =
    !!reason && understood && typed === "DELETE" && (!isPassword || password.length > 0);

  async function reauth() {
    const u = auth.currentUser!;
    if (isPassword) {
      const cred = EmailAuthProvider.credential(u.email || "", password);
      await reauthenticateWithCredential(u, cred);
    } else {
      await reauthenticateWithPopup(u, new GoogleAuthProvider());
    }
  }

  async function submit() {
    setError("");
    if (!canSubmit) return;
    setBusy(true);
    try {
      const u = auth.currentUser!;
      // 1. log deletion request (best-effort)
      try {
        await setDoc(
          doc(db, "deletion_requests", u.uid),
          {
            uid: u.uid,
            email: u.email,
            reason,
            feedback: feedback.slice(0, 1000),
            requestedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn("[delete] failed to log request", e);
      }
      // 2. delete user profile doc (best-effort)
      try {
        await deleteDoc(doc(db, "users", u.uid));
      } catch (e) {
        console.warn("[delete] failed removing user doc", e);
      }
      // 3. delete auth user with recent-login handling
      try {
        await deleteUser(u);
      } catch (e: any) {
        if (e?.code === "auth/requires-recent-login") {
          try {
            await reauth();
          } catch (re: any) {
            if (re?.code === "auth/wrong-password") {
              throw new Error("Incorrect password. Please try again.");
            }
            if (re?.code === "auth/popup-closed-by-user") {
              throw new Error("Re-authentication cancelled. Please try again.");
            }
            throw new Error(re?.message || "Re-authentication failed.");
          }
          await deleteUser(auth.currentUser!);
        } else if (e?.code === "auth/network-request-failed") {
          throw new Error("Network error. Check your connection and try again.");
        } else if (e?.code === "auth/too-many-requests") {
          throw new Error("Too many attempts. Please wait a few minutes and try again.");
        } else {
          throw new Error(e?.message || "Failed to delete account.");
        }
      }
      onDeleted();
    } catch (e: any) {
      setError(e.message || "Failed to delete account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-cream shadow-card dark:bg-[#231016]">
        <div className="flex items-start justify-between gap-3 border-b border-brand/10 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">Delete account</h2>
              <p className="text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                This action is permanent and cannot be undone.
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="btn-ghost -mr-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 max-h-[70vh] overflow-y-auto">
          <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
            Your profile, saved forms metadata and connected Google tokens will be removed.
            Forms already created in Google Forms will remain in your Google account.
          </div>

          <div>
            <label className="label">
              Reason for leaving <span className="text-red-600">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input"
              disabled={busy}
            >
              <option value="">Select a reason…</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Anything we could improve? (optional)</label>
            <textarea
              rows={3}
              maxLength={1000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="input"
              placeholder="Your feedback helps us improve OpenForm."
              disabled={busy}
            />
          </div>

          {isPassword && (
            <div>
              <label className="label">
                Confirm your password <span className="text-red-600">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
                disabled={busy}
              />
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              disabled={busy}
              className="mt-1"
            />
            <span>I understand this will permanently delete my account and cannot be reversed.</span>
          </label>

          <div>
            <label className="label">
              Type <span className="font-mono font-bold">DELETE</span> to confirm{" "}
              <span className="text-red-600">*</span>
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input font-mono"
              placeholder="DELETE"
              disabled={busy}
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-brand/10 px-5 py-4 sm:flex-row sm:justify-end dark:border-white/10">
          <button onClick={onClose} disabled={busy} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            {busy ? "Deleting…" : "Permanently delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}
