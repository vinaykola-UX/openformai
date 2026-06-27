import { useState } from "react";
import { Link as LinkIcon, Check } from "lucide-react";

type Props = {
  url: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
};

export default function CopyLinkButton({ url, label = "Copy link", className = "", size = "md" }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error("[copy-link] failed", e);
    }
  }

  const sizing = size === "sm" ? "!py-2 !px-3 text-xs" : "";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Link copied" : label}
      className={`btn-secondary ${sizing} ${copied ? "!bg-brand !text-white" : ""} ${className}`}
    >
      {copied ? (
        <>
          <Check className={iconSize} /> Copied!
        </>
      ) : (
        <>
          <LinkIcon className={iconSize} /> {label}
        </>
      )}
    </button>
  );
}
