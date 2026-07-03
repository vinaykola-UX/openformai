import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import { createHash } from "crypto";
import { verifyAuth } from "../_lib/verify-auth.js";
import { getAdmin } from "../_lib/firebase-admin.js";

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
- TRUE_FALSE: options ["True","False"] and 1 correct answer.
- SHORT / PARAGRAPH: correctAnswers = one canonical model answer.
- Always include a short explanation (max 200 chars).
- Points: Easy=1, Medium=2, Hard=3.
- Match the requested count exactly.`;

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

// ─── Cache key ───────────────────────────────────────────────────────────────

function makeCacheKey(text: string, count: number, difficulty: string, questionType: string) {
  const raw = `${text.slice(0, 40000)}|${count}|${difficulty}|${questionType}`;
  return createHash("sha256").update(raw).digest("hex");
}

// ─── Cache TTL: 7 days ───────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);

    const {
      text,
      count = 5,
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

    // Cap at 20 questions max — prevents large quota burns
    const n = Math.max(1, Math.min(20, Number(count) || 5));

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

    const { db } = getAdmin();

    // ── Check cache ──────────────────────────────────────────────────────────
    const cacheKey = makeCacheKey(text, n, difficulty, questionType);
    const cacheRef = db.collection("quiz_cache").doc(cacheKey);
    const cacheSnap = await cacheRef.get();

    if (cacheSnap.exists) {
      const cached = cacheSnap.data()!;
      const age = Date.now() - (cached.createdAt?.toMillis?.() ?? 0);
      if (age < CACHE_TTL_MS) {
        console.log("[quiz/generate] cache hit:", cacheKey.slice(0, 12));
        return res.status(200).json({ questions: cached.questions, fromCache: true });
      }
      // Cache expired — delete and regenerate
      await cacheRef.delete();
    }

    // ── Call Gemini 2.0-flash ────────────────────────────────────────────────
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
      model: "gemini-2.0-flash",
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

    // ── Save to cache ────────────────────────────────────────────────────────
    try {
      const { FieldValue } = await import("firebase-admin/firestore");
      await cacheRef.set({
        questions,
        cacheKey,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log("[quiz/generate] cached:", cacheKey.slice(0, 12));
    } catch (cacheErr) {
      // Cache write failure is non-fatal — still return questions
      console.warn("[quiz/generate] cache write failed:", cacheErr);
    }

    return res.status(200).json({ questions, fromCache: false });

  } catch (err: any) {
    console.error("quiz/generate error", err);
    if (err.message?.includes("429") || err.message?.includes("quota")) {
      return res.status(429).json({
        error: "AI quota exceeded. Try again tomorrow — same study material will use cache next time.",
      });
    }
    return res.status(500).json({ error: err.message || "Quiz generation failed" });
  }
}