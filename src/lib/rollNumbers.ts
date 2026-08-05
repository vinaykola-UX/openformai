/**
 * Shared helpers for the Response Tracker feature.
 * Roll/Register numbers are compared case-insensitively with surrounding
 * whitespace removed, and duplicates are collapsed.
 */

export function normalizeRoll(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

/**
 * Extract roll numbers from arbitrary pasted / extracted text.
 * Splits on newlines, commas, semicolons, tabs and pipes.
 */
export function parseRollNumbers(raw: string): string[] {
  if (!raw) return [];
  const tokens = raw
    .split(/[\n\r,;|\t]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    // Strip common list prefixes like "1." / "1)" / "-"
    const cleaned = token.replace(/^\s*(?:\d{1,3}[.)]|[-•*])\s+/, "").trim();
    if (!cleaned) continue;
    // Ignore obvious header/label lines
    if (/^(roll|register|reg|regd|s\.?no|sno|sl\.?no|name|student)s?\b[:.]?$/i.test(cleaned)) continue;
    // A roll number must contain at least one digit and no spaces after cleanup
    const candidate = cleaned.replace(/\s+/g, "");
    if (!/\d/.test(candidate)) continue;
    if (candidate.length < 3 || candidate.length > 32) continue;
    const key = normalizeRoll(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate.trim());
  }
  return out;
}

/** Dedupe an already-parsed list (case-insensitive, trimmed). */
export function dedupeRolls(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = normalizeRoll(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

export const ROLL_FIELD_REGEX =
  /(roll|register|registration|regd|reg\.?\s*(no|num)|htno|hall\s*ticket|admission\s*(no|number))/i;
