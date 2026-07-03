import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import { verifyAuth } from "../_lib/verify-auth.js";

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ["MCQ", "CHECKBOX", "TRUE_FALSE", "SHORT", "PARAGRAPH"],
          },
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

const SYSTEM = `You are an expert educator writing high-quality quiz questions from study material.

Rules:
- Only use facts explicitly present in the material — never hallucinate.
- No duplicate or near-duplicate questions.
- MCQ: exactly 4 options, exactly 1 correct answer, 3 realistic distractors from the same topic.
- CHECKBOX: 4-6 options, 2+ correct answers listed in correctAnswers.
- TRUE_FALSE: use MCQ format-ish but with options ["True","False"] and 1 correct answer.
- SHORT / PARAGRAPH: correctAnswers = one canonical model answer.
- Always include a short explanation (max 200 chars).
- Points: Easy=1, Medium=2, Hard=3.
- Match the requested count exactly.`;

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);
    const {
      text,
      count = 10,
      difficulty = "Mixed",
      questionType = "Mixed",
    } = (req.body || {}) as {
      text?: string;
      count?: number;
      difficulty?: string;
      questionType?: string;
    };
    if (!text || text.trim().length < 40) {
      return res.status(400).json({ error: "Need study material to generate a quiz." });
    }
    const n = Math.max(1, Math.min(100, Number(count) || 10));

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

    const ai = new GoogleGenAI({ apiKey });

    const typeInstr =
      questionType === "Mixed"
        ? "Use a mix of MCQ, CHECKBOX, TRUE_FALSE, and short-answer types (favor MCQ)."
        : `All questions must be type ${questionType}.`;
    const diffInstr =
      difficulty === "Mixed"
        ? "Mix Easy/Medium/Hard roughly evenly."
        : `All questions must be ${difficulty} difficulty.`;

    const prompt = `Generate exactly ${n} quiz questions from the study material below.
${typeInstr}
${diffInstr}

STUDY MATERIAL:
"""
${text.slice(0, 40000)}
"""`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseSchema: SCHEMA as any,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const questions = (parsed.questions || []).map((q: any) => ({
      type: q.type,
      title: q.title,
      options: q.options || [],
      correctAnswers: q.correctAnswers || [],
      explanation: q.explanation || "",
      points: q.points ?? (q.difficulty === "Hard" ? 3 : q.difficulty === "Easy" ? 1 : 2),
      difficulty: q.difficulty || "Medium",
      required: true,
    }));

    return res.status(200).json({ questions });
  } catch (err: any) {
    console.error("quiz/generate error", err);
    if (err.message?.includes("429") || err.message?.includes("quota")) {
      return res.status(429).json({ error: "AI quota exceeded. Try again shortly." });
    }
    return res.status(500).json({ error: err.message || "Quiz generation failed" });
  }
}
