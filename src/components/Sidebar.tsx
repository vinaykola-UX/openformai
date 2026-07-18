import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles,
  LayoutDashboard,
  Wand2,
  Brain,
  Layers,
  Link2,
  Shield,
  FileText,
  Moon,
  Sun,
  LogOut,
  X,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

type NavItem = { to: string; label: string; icon: React.ReactNode; end?: boolean };

const MAIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-[18px] w-[18px]" />, end: true },
  { to: "/dashboard/new", label: "New Form", icon: <Wand2 className="h-[18px] w-[18px]" /> },
  { to: "/ai-quiz", label: "AI Quiz", icon: <Brain className="h-[18px] w-[18px]" /> },
  { to: "/automate", label: "Automate", icon: <Layers className="h-[18px] w-[18px]" /> },
];

const ACCOUNT_NAV: NavItem[] = [
  { to: "/connect-google", label: "Google Account", icon: <Link2 className="h-[18px] w-[18px]" /> },
  { to: "/privacy", label: "Privacy", icon: <Shield className="h-[18px] w-[18px]" /> },
  { to: "/terms", label: "Terms", icon: <FileText className="h-[18px] w-[18px]" /> },
];

export default function Sidebar({
  className = "",
  onNavigate,
  showClose,
  onClose,
}: {
  className?: string;
  onNavigate?: () => void;
  showClose?: boolean;
  onClose?: () => void;
}) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();

  function isActive(item: NavItem) {
    if (item.end) return pathname === item.to;
    return pathname === item.to || pathname.startsWith(item.to + "/");
  }

  async function handleLogout() {
    onNavigate?.();
    await logout();
    nav("/");
  }

  return (
    <aside className={`flex h-screen w-64 flex-col bg-[#1A0E12] text-[#F5EDE7] ${className}`}>
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5">
        <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-card">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-white">OpenForm</span>
        </Link>
        {showClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          {MAIN_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} active={isActive(item)} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">
          Account
        </div>
        <div className="space-y-1">
          {ACCOUNT_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} active={isActive(item)} onNavigate={onNavigate} />
          ))}

          <button
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            {theme === "light" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      </nav>

      {/* User footer */}
      {user && (
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-white">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.displayName || "Account"}</p>
              <p className="truncate text-xs text-white/40">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-lg p-2 text-white/40 transition hover:bg-white/10 hover:text-red-400"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function SidebarLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active ? "bg-brand-gradient text-white shadow-card" : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}