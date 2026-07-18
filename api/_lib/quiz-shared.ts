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
          correctAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
          explanation: { type: Type.STRING },
          points: { type: Type.NUMBER },
          difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
        },
        required: ["type", "title"],
      },
    },
  },
  required: ["questions"],
};

export const QUESTIONS_SYSTEM = `You are an expert educator writing high-quality quiz questions from study material. Respond ONLY with valid JSON matching the schema.

Rules:
- Only use facts explicitly present in the material — never hallucinate.
- No duplicate or near-duplicate questions.
- MCQ: exactly 4 options, exactly 1 correct answer, 3 realistic distractors from the same topic.
- CHECKBOX: 4-6 options, 2+ correct answers listed in correctAnswers.
- TRUE_FALSE: options ["True","False"] and 1 correct answer.
- SHORT / PARAGRAPH: correctAnswers = one canonical model answer.
- Always include a short explanation (max 200 chars).
- Points: Easy=1, Medium=2, Hard=3.
- Match the requested count exactly.`;

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function makeCacheKey(text: string, count: number, difficulty: string, questionType: string) {
  const raw = `${text.slice(0, 40000)}|${count}|${difficulty}|${questionType}`;
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

STUDY MATERIAL:
"""
${text.slice(0, 40000)}
"""`;
}

export function parseQuestions(raw: any[]): any[] {
  return (raw || []).map((q: any) => ({
    type: q.type,
    title: q.title,
    options: q.options || [],
    correctAnswers: q.correctAnswers || [],
    explanation: q.explanation || "",
    points: q.points ?? (q.difficulty === "Hard" ? 3 : q.difficulty === "Easy" ? 1 : 2),
    difficulty: q.difficulty || "Medium",
    required: true,
  }));
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