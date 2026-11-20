import { Type } from "@google/genai";
import { createHash } from "crypto";
import { geminiWithFallback, GEMINI_MODEL } from "./gemini-keys.js";
import { GroqApiError } from "./groq-keys.js";

export const QUESTIONS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["MCQ", "CHECKBOX", "TRUE_FALSE", "SHORT", "PARAGRAPH"] },
          title: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswers: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 1 },
          explanation: { type: Type.STRING },
          points: { type: Type.NUMBER },
          difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
        },
        required: ["type", "title", "correctAnswers"],
      },
    },
  },
  required: ["questions"],
};

export const QUESTIONS_SYSTEM = `You are an expert educator writing high-quality quiz questions from study material. Respond ONLY with valid JSON matching the schema.

Rules:
- Only use facts explicitly present in the material — never hallucinate.
- No duplicate or near-duplicate questions.
- EVERY question, with no exceptions, MUST have a non-empty "correctAnswers" array. A question without a correct answer is incomplete and will be rejected.
- MCQ: exactly 4 options, exactly 1 correct answer in correctAnswers, 3 realistic distractors from the same topic.
- CHECKBOX: 4-6 options, 2+ correct answers listed in correctAnswers.
- TRUE_FALSE: options ["True","False"] and exactly 1 correct answer in correctAnswers.
- SHORT / PARAGRAPH: correctAnswers = an array with exactly one canonical model answer (a short, concrete, gradable answer — not a vague summary).
- correctAnswers values must be copied EXACTLY, character-for-character, from the matching entries in "options" — never paraphrase, reword, or add labels like "A)" to them.
- If you are ever unsure of the single best answer, pick the fact most directly and explicitly stated in the material — never skip correctAnswers.
- Always include a short explanation (max 200 chars) that justifies the correct answer using the material.
- Points: Easy=1, Medium=2, Hard=3.
- Match the requested count exactly.`;

// Bump this whenever QUESTIONS_SCHEMA or QUESTIONS_SYSTEM changes materially —
// it's folded into the cache key so old cached questions (generated under the
// previous prompt/schema) are never served again; a version bump makes every
// old cache entry simply not match anymore, so generation runs fresh instead.
// (Unchanged on purpose: the Bloom feature below does not alter the old prompt.)
const PROMPT_VERSION = "v2";

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────
// Bloom's Taxonomy (JNTUK BL1–BL6) — additive. Nothing here runs unless a
// request explicitly sends levelCounts.
// ─────────────────────────────────────────────────────────────────────────

export const MAX_BLOOM_TOTAL = 30;

export const BLOOM_LEVELS = [
  { level: 1, name: "Remember", verbs: "define, list, state, identify, name, recall, match" },
  { level: 2, name: "Understand", verbs: "explain, describe, summarize, classify, illustrate, compare" },
  { level: 3, name: "Apply", verbs: "apply, solve, use, compute, demonstrate, predict the output of" },
  { level: 4, name: "Analyze", verbs: "analyze, differentiate, examine, distinguish, trace, find the error in" },
  { level: 5, name: "Evaluate", verbs: "evaluate, justify, assess, critique, choose the best, recommend" },
  { level: 6, name: "Create", verbs: "design, construct, formulate, propose, develop, compose" },
] as const;

export type LevelCounts = Record<number, number>;

export function normalizeLevel(x: unknown): number | null {
  const n = Number(x);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
}

/**
 * Returns null when the request is NOT a Bloom request (levelCounts missing).
 * Throws an Error with a teacher-readable message when it IS but is invalid.
 */
export function parseLevelCounts(raw: any): { counts: LevelCounts; total: number } | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Bloom level settings.");
  const counts: LevelCounts = {};
  let total = 0;
  for (let l = 1; l <= 6; l++) {
    const v = Math.floor(Number(raw[String(l)] ?? 0));
    const n = Number.isFinite(v) ? Math.max(0, Math.min(MAX_BLOOM_TOTAL, v)) : 0;
    if (n > 0) {
      counts[l] = n;
      total += n;
    }
  }
  if (total === 0) throw new Error("Pick at least one question for a Bloom level.");
  if (total > MAX_BLOOM_TOTAL) {
    throw new Error(`Bloom quizzes are limited to ${MAX_BLOOM_TOTAL} questions in total.`);
  }
  return { counts, total };
}

export function makeCacheKey(
  text: string,
  count: number,
  difficulty: string,
  questionType: string,
  levelCounts?: LevelCounts
) {
  let raw = `${PROMPT_VERSION}|${text.slice(0, 40000)}|${count}|${difficulty}|${questionType}`;
  // Only Bloom requests extend the key, so every existing cache entry stays valid.
  if (levelCounts) {
    raw += `|bloom:${[1, 2, 3, 4, 5, 6].map((l) => levelCounts[l] || 0).join(",")}`;
  }
  return createHash("sha256").update(raw).digest("hex");
}

export const BLOOM_SCHEMA = {
  ...QUESTIONS_SCHEMA,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        ...QUESTIONS_SCHEMA.properties.questions.items,
        properties: {
          ...QUESTIONS_SCHEMA.properties.questions.items.properties,
          level: { type: Type.NUMBER },
        },
        required: ["type", "title", "correctAnswers", "level"],
      },
    },
  },
  required: ["questions"],
};

const BLOOM_SYSTEM_EXTRA = `

BLOOM'S TAXONOMY MODE (JNTUK, levels BL1–BL6):
- Every question MUST be type "MCQ" and MUST include an integer field "level" (1 to 6).
- Write each question at the cognitive level requested, using that level's action verbs:
${BLOOM_LEVELS.map((b) => `  BL${b.level} ${b.name}: ${b.verbs}`).join("\n")}
- BL1/BL2 may test definitions and explanations stated in the material.
- BL3 (Apply): short problems, calculations, or "what is the output" using concepts from the material.
- BL4 (Analyze): compare, trace, find the error, or identify the cause.
- BL5 (Evaluate): choose the best option and justify it; the explanation must say why the others are weaker.
- BL6 (Create): "which design / approach / formulation is correct or best" — still answerable as ONE correct option.
- Higher levels must still rely only on concepts present in the material; do not require outside facts.
- If a question involves code, put the short code snippet inside the question "title" (use line breaks). For "output" questions, put the possible outputs in the options. Keep every option to one short line.
- All 4 options must be plausible (same format and length); wrong options should reflect real student misconceptions, not obviously silly answers.
- Never write "all of the above" or "none of the above".
- Respond with JSON shaped exactly like {"questions":[{"type":"MCQ","title":"...","options":["...","...","...","..."],"correctAnswers":["..."],"explanation":"...","level":1}]}.`;

export function buildBloomPrompt(text: string, counts: LevelCounts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const lines = BLOOM_LEVELS.filter((b) => counts[b.level] > 0)
    .map((b) => `- BL${b.level} (${b.name}): exactly ${counts[b.level]} question(s), level = ${b.level}`)
    .join("\n");

  return `Generate exactly ${total} MCQ quiz questions from the study material below, distributed by Bloom's Taxonomy level like this:
${lines}

Every question must have the correct "level" value and a non-empty correctAnswers array whose value exactly matches one of its options.

STUDY MATERIAL:
"""
${text.slice(0, 40000)}
"""`;
}

/** Group by level, cap each level at the requested count, order BL1 → BL6. */
export function arrangeBloomQuestions(questions: any[], counts: LevelCounts): any[] {
  const buckets: Record<number, any[]> = {};
  for (const q of questions || []) {
    const lv = normalizeLevel(q?.level);
    if (!lv || !counts[lv]) continue;
    if (!buckets[lv]) buckets[lv] = [];
    buckets[lv].push(q);
  }
  const out: any[] = [];
  for (let l = 1; l <= 6; l++) {
    const picked = (buckets[l] || []).slice(0, counts[l] || 0);
    for (const q of picked) {
      out.push({
        ...q,
        type: "MCQ",
        level: l,
        difficulty: l <= 2 ? "Easy" : l <= 4 ? "Medium" : "Hard",
        points: l <= 2 ? 1 : l <= 4 ? 2 : 3,
      });
    }
  }
  return out;
}

/** "[BL3] question text" — used only when the form is built. Never double-tags. */
export function withLevelTag(title: string, level: unknown): string {
  const lv = normalizeLevel(level);
  if (!lv) return title;
  if (/^\s*\[BL[1-6]\]/i.test(title)) return title;
  return `[BL${lv}] ${title}`;
}

export function buildQuestionsPrompt(
  text: string,
  n: number,
  difficulty: string,
  questionType: string,
  subtopicTitle?: string
) {
  const typeInstr =
    questionType === "Mixed"
      ? "Use a mix of MCQ, CHECKBOX, TRUE_FALSE, and short-answer types (favor MCQ)."
      : `All questions must be type ${questionType}.`;
  const diffInstr =
    difficulty === "Mixed" ? "Mix Easy/Medium/Hard roughly evenly." : `All questions must be ${difficulty} difficulty.`;
  const topicLine = subtopicTitle
    ? `Generate exactly ${n} quiz questions about the subtopic "${subtopicTitle}", using ONLY the material below.`
    : `Generate exactly ${n} quiz questions from the study material below.`;

  return `${topicLine}
${typeInstr}
${diffInstr}

Remember: every single question must include a non-empty correctAnswers array, and each value in it must exactly match one of that question's options. Do not return any question without one.

STUDY MATERIAL:
"""
${text.slice(0, 40000)}
"""`;
}

export function parseQuestions(raw: any[], keepLevel = false): any[] {
  return (raw || []).map((q: any) => {
    const options: string[] = q.options || [];
    let correctAnswers: string[] = (q.correctAnswers || []).filter(
      (a: any) => typeof a === "string" && a.trim().length > 0
    );

    // Safety net: if the model's correctAnswers don't exactly match any option
    // text (e.g. it paraphrased instead of copying verbatim), try a
    // case/whitespace-insensitive match against the real option strings so a
    // near-miss still ends up ticked correctly in the editor.
    if (options.length && correctAnswers.length) {
      correctAnswers = correctAnswers.map((ans) => {
        const exact = options.find((o) => o === ans);
        if (exact) return exact;
        const loose = options.find((o) => o.trim().toLowerCase() === ans.trim().toLowerCase());
        return loose || ans;
      });
    }

    const lv = keepLevel ? normalizeLevel(q.level) : null;

    return {
      type: q.type,
      title: q.title,
      options,
      correctAnswers,
      explanation: q.explanation || "",
      points: q.points ?? (q.difficulty === "Hard" ? 3 : q.difficulty === "Easy" ? 1 : 2),
      difficulty: q.difficulty || "Medium",
      required: true,
      ...(lv ? { level: lv } : {}),
    };
  });
}

export async function runGeminiQuestions(prompt: string, opts?: { bloom?: boolean }): Promise<any[]> {
  const bloom = !!opts?.bloom;
  const response = await geminiWithFallback((ai) =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: bloom ? QUESTIONS_SYSTEM + BLOOM_SYSTEM_EXTRA : QUESTIONS_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: (bloom ? BLOOM_SCHEMA : QUESTIONS_SCHEMA) as any,
      },
    })
  );
  const parsed = JSON.parse(response.text || "{}");
  return parseQuestions(parsed.questions, bloom);
}

export async function runGroqQuestions(
  prompt: string,
  apiKey: string,
  opts?: { bloom?: boolean }
): Promise<any[]> {
  const bloom = !!opts?.bloom;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: bloom ? QUESTIONS_SYSTEM + BLOOM_SYSTEM_EXTRA : QUESTIONS_SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new GroqApiError(res.status, err?.error?.message || "Request failed");
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  return parseQuestions(JSON.parse(content).questions, bloom);
}