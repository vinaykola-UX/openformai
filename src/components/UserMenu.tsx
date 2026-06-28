import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MoreVertical,
  LogOut,
  LayoutDashboard,
  Link2,
  Shield,
  FileText,
  UserX,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import DeleteAccountDialog from "./DeleteAccountDialog";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) return null;

  async function handleLogout() {
    setBusy("logout");
    try {
      await logout();
      nav("/");
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  async function handleDeactivate() {
    if (!user) return;
    const ok = window.confirm(
      "Deactivate your account?\n\nYou'll be signed out immediately. Your forms are kept, and you can reactivate by signing in again and contacting support."
    );
    if (!ok) return;
    setBusy("deactivate");
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          status: "deactivated",
          deactivatedAt: serverTimestamp(),
          email: user.email,
        },
        { merge: true }
      );
      await logout();
      nav("/");
    } catch (e: any) {
      alert(e.message || "Failed to deactivate account");
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  async function reauth() {
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const providerId = u.providerData[0]?.providerId;
    if (providerId === "google.com") {
      await reauthenticateWithPopup(u, new GoogleAuthProvider());
    } else {
      const pw = window.prompt("Please re-enter your password to confirm deletion:");
      if (!pw) throw new Error("Password required to delete account");
      const cred = EmailAuthProvider.credential(u.email || "", pw);
      await reauthenticateWithCredential(u, cred);
    }
  }

  async function handleDelete() {
    if (!user) return;
    const confirm1 = window.confirm(
      "Permanently delete your account?\n\nThis cannot be undone. Your profile and forms metadata will be removed."
    );
    if (!confirm1) return;
    const typed = window.prompt('Type "DELETE" to confirm permanent deletion:');
    if (typed !== "DELETE") {
      alert("Deletion cancelled.");
      return;
    }
    setBusy("delete");
    try {
      const u = auth.currentUser!;
      try {
        await deleteDoc(doc(db, "users", u.uid));
      } catch (e) {
        console.warn("[delete] failed removing user doc", e);
      }
      try {
        await deleteUser(u);
      } catch (e: any) {
        if (e?.code === "auth/requires-recent-login") {
          await reauth();
          await deleteUser(auth.currentUser!);
        } else {
          throw e;
        }
      }
      nav("/");
    } catch (e: any) {
      alert(e.message || "Failed to delete account");
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl border border-brand/10 bg-cream shadow-card dark:border-white/10 dark:bg-[#231016]"
        >
          <div className="flex items-center gap-3 border-b border-brand/10 px-4 py-3 dark:border-white/10">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white">
              <UserIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {user.displayName || "Account"}
              </div>
              <div className="truncate text-xs text-ink/60 dark:text-[#F5EDE7]/60">
                {user.email}
              </div>
            </div>
          </div>

          <div className="py-1">
            <MenuLink to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Dashboard
            </MenuLink>
            <MenuLink to="/connect-google" icon={<Link2 className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Google account
            </MenuLink>
            <MenuLink to="/privacy" icon={<Shield className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Privacy policy
            </MenuLink>
            <MenuLink to="/terms" icon={<FileText className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Terms of service
            </MenuLink>
          </div>

          <div className="border-t border-brand/10 py-1 dark:border-white/10">
            <MenuButton
              onClick={handleLogout}
              icon={<LogOut className="h-4 w-4" />}
              disabled={!!busy}
            >
              {busy === "logout" ? "Signing out…" : "Log out"}
            </MenuButton>
            <MenuButton
              onClick={handleDeactivate}
              icon={<UserX className="h-4 w-4" />}
              disabled={!!busy}
            >
              {busy === "deactivate" ? "Deactivating…" : "Deactivate account"}
            </MenuButton>
            <MenuButton
              onClick={handleDelete}
              icon={<Trash2 className="h-4 w-4" />}
              danger
              disabled={!!busy}
            >
              {busy === "delete" ? "Deleting…" : "Delete account"}
            </MenuButton>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to,
  icon,
  children,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      role="menuitem"
      className="flex items-center gap-3 px-4 py-2 text-sm text-ink hover:bg-peach/40 dark:text-[#F5EDE7] dark:hover:bg-white/5"
    >
      <span className="text-brand dark:text-[#F4A98C]">{icon}</span>
      {children}
    </Link>
  );
}

function MenuButton({
  onClick,
  icon,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-peach/40 disabled:opacity-50 dark:hover:bg-white/5 ${
        danger ? "text-red-600 dark:text-red-400" : "text-ink dark:text-[#F5EDE7]"
      }`}
    >
      <span className={danger ? "text-red-600 dark:text-red-400" : "text-brand dark:text-[#F4A98C]"}>
        {icon}
      </span>
      {children}
    </button>
  );
}
