// ─────────────────────────────────────────────────────────────────────────
// Maths notation (matrices, stacked expressions) for AI quizzes.
// Pure helpers only — no network calls, no new packages. Google Forms can't
// show LaTeX, so stacked maths is turned into a picture when the form is
// created (Google copies the picture into the form at that moment).
// ─────────────────────────────────────────────────────────────────────────

export const MAX_MATH_QUESTIONS = 10;
const MAX_LATEX_LEN = 600;

const BLOCKED =
  /\\(input|include|write|openout|openin|read|immediate|catcode|def|edef|gdef|xdef|let|newcommand|renewcommand|usepackage|documentclass|verb|csname|expandafter|special|jobname)(?![A-Za-z])/i;

/** Strips $ wrappers, rejects unsafe / unbalanced / too-long LaTeX. Returns "" when unusable. */
export function cleanLatex(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  s = s.replace(/^\$\$?/, "").replace(/\$\$?$/, "");
  s = s.replace(/^\\\(/, "").replace(/\\\)$/, "").replace(/^\\\[/, "").replace(/\\\]$/, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s || s.length > MAX_LATEX_LEN) return "";
  if (BLOCKED.test(s)) return "";
  let depth = 0;
  for (const ch of s.replace(/\\[{}]/g, "")) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) return "";
    }
  }
  return depth === 0 ? s : "";
}

/** Picture URL for a LaTeX string (white background, readable size). */
export function mathImageUrl(latex: string): string {
  return "https://latex.codecogs.com/png.latex?" + encodeURIComponent(`\\bg_white \\dpi{200} \\large ${latex}`);
}

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ",
  pi: "π", rho: "ρ", sigma: "σ", phi: "φ", omega: "ω", Delta: "Δ", Sigma: "Σ", Omega: "Ω",
  infty: "∞", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", pm: "±", times: "×",
  div: "÷", cdot: "·", to: "→", rightarrow: "→", int: "∫", sum: "Σ", prod: "Π", partial: "∂",
  nabla: "∇", approx: "≈", in: "∈", cdots: "…", ldots: "…", dots: "…",
  lim: "lim", sin: "sin", cos: "cos", tan: "tan", log: "log", ln: "ln", det: "det",
  left: "", right: "", mathbf: "", mathrm: "", text: "", displaystyle: "", quad: " ", qquad: "  ",
};

/** Readable plain-text version, used as alt text and as the fallback when an image can't be used. */
export function latexToPlain(latex: string): string {
  let s = latex;
  s = s.replace(
    /\\begin\{(b|p|v|V|B)?matrix\}([\s\S]*?)\\end\{(?:b|p|v|V|B)?matrix\}/g,
    (_m, kind, body) => {
      const rows = String(body)
        .split("\\\\")
        .map((r) => r.split("&").map((c) => c.trim()).join(" ").trim())
        .filter(Boolean);
      const [l, r] = kind === "v" || kind === "V" ? ["|", "|"] : kind === "p" ? ["(", ")"] : ["[", "]"];
      return `${l}${rows.join("; ")}${r}`;
    }
  );
  s = s.replace(/\\([{}|])/g, "$1");
  s = s.replace(/\\[,;:!]/g, " ");
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\([A-Za-z]+)/g, (_m, w: string) => (w in SYMBOLS ? SYMBOLS[w] : w));
  s = s.replace(/\^2(?![0-9])/g, "²").replace(/\^3(?![0-9])/g, "³");
  s = s.replace(/\^\{([^{}]*)\}/g, "^($1)").replace(/_\{([^{}]*)\}/g, "_($1)");
  s = s.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  return s;
}

export function hasMath(q: any): boolean {
  return !!q && (!!q.math || (Array.isArray(q.optionMath) && q.optionMath.some(Boolean)));
}

/** Gives every picture option a unique, non-empty text label (that label is what grading compares). */
function relabelMathOptions(q: any): any {
  const om: (string | null)[] = q.optionMath;
  const oldOpts: string[] = q.options || [];
  const seen = new Set<string>();
  const next = oldOpts.map((label, i) => {
    let l = typeof label === "string" ? label.trim() : "";
    if (om[i] && (!l || seen.has(l))) l = `Option ${i + 1}`;
    if (seen.has(l)) l = `${l} (${i + 1})`;
    seen.add(l);
    return l;
  });
  const correct = (q.correctAnswers || []).map((a: string) => {
    const idx = oldOpts.indexOf(a);
    return idx >= 0 ? next[idx] : a;
  });
  return { ...q, options: next, correctAnswers: correct };
}

/** Cleans the math fields of one question (server trust boundary). Questions without maths are returned untouched. */
export function sanitizeMathQuestion(q: any): any {
  if (!q || (q.math === undefined && q.optionMath === undefined)) return q;
  const isChoice = q.type === "MCQ" || q.type === "CHECKBOX";
  const body = cleanLatex(q.math);

  let om: (string | null)[] | undefined;
  if (isChoice && Array.isArray(q.optionMath) && Array.isArray(q.options)) {
    om = (q.options as string[]).map((_o, i) => cleanLatex(q.optionMath[i]) || null);
    if (!om.some(Boolean)) om = undefined;
  }

  const { math: _m, optionMath: _om, ...rest } = q;
  let out: any = { ...rest };
  if (body) out.math = body;
  if (om) {
    out.optionMath = om;
    out = relabelMathOptions(out);
  }
  return out;
}

/** Turns a maths question back into plain text (used when a picture can't be used). */
export function degradeMathQuestion(q: any): any {
  if (!hasMath(q)) return q;
  const { math, optionMath, ...rest } = q;
  const out: any = { ...rest };
  if (math) out.title = `${q.title}\n${latexToPlain(math)}`;
  if (Array.isArray(optionMath) && Array.isArray(q.options)) {
    const oldOpts: string[] = q.options;
    const next = oldOpts.map((label, i) => (optionMath[i] ? latexToPlain(optionMath[i]) : label));
    out.options = next;
    out.correctAnswers = (q.correctAnswers || []).map((a: string) => {
      const idx = oldOpts.indexOf(a);
      return idx >= 0 ? next[idx] : a;
    });
  }
  return out;
}

export function degradeAllMath(questions: any[]): any[] {
  return questions.map(degradeMathQuestion);
}

/** Sanitizes every question; maths questions beyond the cap are turned into plain text. */
export function prepareMathForForm(questions: any[]): any[] {
  let used = 0;
  return questions.map((raw) => {
    const q = sanitizeMathQuestion(raw);
    if (!hasMath(q)) return q;
    used += 1;
    return used > MAX_MATH_QUESTIONS ? degradeMathQuestion(q) : q;
  });
}

/** Generation side: cleans AI output and keeps at most `maxMath` maths questions. */
export function finalizeMathQuestions(questions: any[], maxMath: number): any[] {
  let used = 0;
  const out: any[] = [];
  for (const raw of questions) {
    const q = sanitizeMathQuestion(raw);
    if (hasMath(q)) {
      if (used >= maxMath) continue;
      used += 1;
    }
    out.push(q);
  }
  return out;
}

/** 0..MAX_MATH_QUESTIONS, anything else becomes 0. */
export function parseMathCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_MATH_QUESTIONS, n);
}