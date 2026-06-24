export default function Footer() {
  return (
    <footer className="border-t border-brand/5 bg-cream/50 py-8 dark:bg-[#1A0E12]/50 dark:border-white/5">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-ink/60 dark:text-[#F5EDE7]/60 sm:px-6">
        © {new Date().getFullYear()} OpenForm · Built for educators
      </div>
    </footer>
  );
}
