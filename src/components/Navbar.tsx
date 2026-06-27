import { Link } from "react-router-dom";
import { Moon, Sun, LayoutDashboard, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import UserMenu from "./UserMenu";


export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-brand/5 bg-cream/80 backdrop-blur-xl dark:bg-[#1A0E12]/80 dark:border-white/5">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white shadow-card">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">OpenForm</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <button onClick={toggle} className="btn-ghost" aria-label="Toggle theme">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          {user ? (
            <>
              <Link to="/dashboard" className="btn-ghost hidden sm:inline-flex">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  nav("/");
                }}
                className="btn-ghost"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Login</Link>
              <Link to="/signup" className="btn-primary !py-2">Get started</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
