import { AlertTriangle, X, RefreshCw } from "lucide-react";

type Props = {
  error: unknown;
  title?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
};

function humanize(raw: string): { title: string; message: string; hint?: string } {
  const t = raw.trim();
  const lower = t.toLowerCase();

  if (/invalid grading|grading information/i.test(t)) {
    return {
      title: "Form couldn't be created",
      message:
        "Google Forms rejected this request because one or more questions contain invalid grading information.",
      hint: "Open the editor and make sure every quiz question has a valid correct answer and point value.",
    };
  }
  if (/invalid.*request/i.test(t)) {
    return {
      title: "Google Forms rejected the request",
      message: "Some questions couldn't be published as-is.",
      hint: "Try editing the flagged questions or regenerate the preview.",
    };
  }
  if (lower.includes("quota") || lower.includes("429")) {
    return {
      title: "AI quota reached",
      message: "The AI service is temporarily rate-limited.",
      hint: "Pasting plain text skips AI parsing entirely — try that instead.",
    };
  }
  if (lower.includes("network")) {
    return {
      title: "Network hiccup",
      message: "We couldn't reach the server.",
      hint: "Check your connection and try again.",
    };
  }
  if (lower.includes("not authenticated") || lower.includes("unauthorized") || lower.includes("401")) {
    return {
      title: "Session expired",
      message: "Your sign-in session is no longer valid.",
      hint: "Please sign in again to continue.",
    };
  }
  if (lower.includes("google") && (lower.includes("token") || lower.includes("connect"))) {
    return {
      title: "Google account not connected",
      message: "OpenForm needs permission to create Google Forms on your behalf.",
      hint: "Reconnect your Google account to continue.",
    };
  }
  if (lower.includes("file") && (lower.includes("large") || lower.includes("size"))) {
    return { title: "File too large", message: t };
  }

  const first = t.split("\n")[0].slice(0, 240);
  return { title: "Something went wrong", message: first || "An unexpected error occurred." };
}

export default function ErrorCard({ error, title, onDismiss, onRetry, className = "" }: Props) {
  if (!error) return null;
  const raw =
    typeof error === "string"
      ? error
      : (error as any)?.message || (error as any)?.error || "An unexpected error occurred.";
  const parsed = humanize(String(raw));
  const heading = title || parsed.title;

  return (
    <div
      role="alert"
      className={`relative overflow-hidden rounded-2xl border border-brand/15 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#241218] ${className}`}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden />
      <div className="flex items-start gap-3 pl-2">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-peach/60 text-brand dark:bg-brand/20">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-ink dark:text-[#F5EDE7]">{heading}</h3>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                className="-mr-1 -mt-1 rounded-full p-1 text-ink/40 hover:bg-cream hover:text-ink dark:text-[#F5EDE7]/50 dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink/75 dark:text-[#F5EDE7]/75">
            {parsed.message}
          </p>
          {parsed.hint && (
            <p className="mt-2 rounded-xl bg-cream/70 px-3 py-2 text-xs text-ink/70 dark:bg-white/5 dark:text-[#F5EDE7]/70">
              💡 {parsed.hint}
            </p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/15"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
