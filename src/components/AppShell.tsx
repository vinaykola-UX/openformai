import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, Sparkles } from "lucide-react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream dark:bg-[#1A0E12]">
      {/* Desktop sidebar — fixed, always visible on lg+ */}
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-brand/10 bg-cream/90 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#1A0E12]/90 lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-display text-base font-bold">OpenForm</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-ink/70 hover:bg-brand/5 dark:text-[#F5EDE7]/70 dark:hover:bg-white/5"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <Sidebar
              className="w-full"
              onNavigate={() => setMobileOpen(false)}
              showClose
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Content area — offset for the fixed desktop sidebar */}
      <div className="lg:pl-64">{children}</div>
    </div>
  );
}