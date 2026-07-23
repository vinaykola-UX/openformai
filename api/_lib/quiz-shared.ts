import { Type } from "@google/genai";
import { createHash } from "crypto";
import { geminiWithFallback } from "./gemini-keys.js";

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
const PROMPT_VERSION = "v2";

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function makeCacheKey(text: string, count: number, difficulty: string, questionType: string) {
  const raw = `${PROMPT_VERSION}|${text.slice(0, 40000)}|${count}|${difficulty}|${questionType}`;
  return createHash("sha256").update(raw).digest("hex");
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

export function parseQuestions(raw: any[]): any[] {
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

    return {
      type: q.type,
      title: q.title,
      options,
      correctAnswers,
      explanation: q.explanation || "",
      points: q.points ?? (q.difficulty === "Hard" ? 3 : q.difficulty === "Easy" ? 1 : 2),
      difficulty: q.difficulty || "Medium",
      required: true,
    };
  });
}

export async function runGeminiQuestions(prompt: string): Promise<any[]> {
  const response = await geminiWithFallback((ai) =>
    ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: QUESTIONS_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: QUESTIONS_SCHEMA as any,
      },
    })
  );
  const parsed = JSON.parse(response.text || "{}");
  return parseQuestions(parsed.questions);
}

export async function runGroqQuestions(prompt: string, apiKey: string): Promise<any[]> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: QUESTIONS_SYSTEM }, { role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error ${res.status}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  return parseQuestions(JSON.parse(content).questions);
}