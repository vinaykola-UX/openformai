// Helpers for the maths editor (browser side). No packages needed: the preview
// uses the very same picture URL that the Google Form will receive.

export function mathImageUrl(latex: string): string {
  const clean = latex.trim().replace(/^\$+|\$+$/g, "").trim();
  return "https://latex.codecogs.com/png.latex?" + encodeURIComponent(`\\bg_white \\dpi{200} \\large ${clean}`);
}

/** Simple symbols: typed as real text into whichever field was tapped last. */
export const TEXT_SYMBOLS: string[] = [
  "π", "θ", "α", "β", "γ", "δ", "λ", "μ", "σ", "φ", "ω", "Δ", "Σ", "Ω",
  "∞", "±", "×", "÷", "≤", "≥", "≠", "≈", "√", "∫", "∂", "∇", "∈", "→", "°",
  "²", "³", "ⁿ", "₁", "₂", "ₙ",
];

/** Stacked structures: inserted as LaTeX into the maths box (shown as a picture). */
export const LATEX_STRUCTURES: { label: string; latex: string }[] = [
  { label: "a/b", latex: "\\frac{a}{b}" },
  { label: "√x", latex: "\\sqrt{x}" },
  { label: "ⁿ√x", latex: "\\sqrt[n]{x}" },
  { label: "xⁿ", latex: "x^{n}" },
  { label: "xₙ", latex: "x_{n}" },
  { label: "∫ a..b", latex: "\\int_{a}^{b} f(x) \\, dx" },
  { label: "Σ", latex: "\\sum_{i=1}^{n} a_i" },
  { label: "lim", latex: "\\lim_{x \\to 0} f(x)" },
  { label: "dy/dx", latex: "\\frac{dy}{dx}" },
  { label: "∂f/∂x", latex: "\\frac{\\partial f}{\\partial x}" },
  { label: "vector", latex: "\\vec{v}" },
  { label: "Aᵀ", latex: "A^{T}" },
  { label: "A⁻¹", latex: "A^{-1}" },
  { label: "rank(A)", latex: "\\mathrm{rank}(A)" },
  { label: "system", latex: "\\begin{cases} x + y = 1 \\\\ x - y = 0 \\end{cases}" },
];

export type MatrixKind = "bmatrix" | "vmatrix" | "pmatrix";

/** rows × cols matrix of zeros, ready to edit. Determinant = vmatrix. */
export function matrixLatex(rows: number, cols: number, kind: MatrixKind = "bmatrix"): string {
  const r = Math.max(1, Math.min(6, Math.floor(rows) || 2));
  const c = Math.max(1, Math.min(6, Math.floor(cols) || 2));
  const line = Array.from({ length: c }, () => "0").join(" & ");
  const body = Array.from({ length: r }, () => line).join(" \\\\ ");
  return `\\begin{${kind}} ${body} \\end{${kind}}`;
}

/** Inserts text at the cursor of an input/textarea and lets React see the change. */
export function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  el.focus();
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const pos = start + text.length;
  try {
    el.setSelectionRange(pos, pos);
  } catch {
    /* some input types don't support selection */
  }
}