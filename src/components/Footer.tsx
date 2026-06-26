// src/components/Footer.tsx
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-brand/5 bg-cream/50 py-8 dark:bg-[#1A0E12]/50 dark:border-white/5">
      <div className="mx-auto max-w-6xl px-4 flex flex-col items-center gap-3 text-sm text-ink/60 dark:text-[#F5EDE7]/60 sm:px-6 sm:flex-row sm:justify-between">
        <span>
          © {new Date().getFullYear()} OpenForm · Built for educators
        </span>

        <div className="flex items-center gap-5">
          <Link
            to="/privacy"
            className="hover:text-brand dark:hover:text-[#F4A98C] transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms"
            className="hover:text-brand dark:hover:text-[#F4A98C] transition-colors"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  );
}