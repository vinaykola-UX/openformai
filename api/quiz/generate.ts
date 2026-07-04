import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import { createHash } from "crypto";
import { verifyAuth } from "../_lib/verify-auth.js";
import { getAdmin } from "../_lib/firebase-admin.js";
import { geminiWithFallback, isQuotaError } from "../_lib/gemini-keys.js";

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

const SYSTEM = `You are an expert educator writing high-quality quiz questions from study material. Respond ONLY with valid JSON matching the schema: {"questions":[{"type":"MCQ"|"CHECKBOX"|"TRUE_FALSE"|"SHORT"|"PARAGRAPH","title":string,"options":string[],"correctAnswers":string[],"explanation":string,"points":number,"difficulty":"Easy"|"Medium"|"Hard"}]}.

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

function makeCacheKey(
  text: string,
  count: number,
  difficulty: string,
  questionType: string
) {
  const raw = `${text.slice(0, 40000)}|${count}|${difficulty}|${questionType}`;
  return createHash("sha256").update(raw).digest("hex");
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Build prompt ─────────────────────────────────────────────────────────────

function buildPrompt(
  text: string,
  n: number,
  difficulty: string,
  questionType: string
): string {
  const typeInstr =
    questionType === "Mixed"
      ? "Use a mix of MCQ, CHECKBOX, TRUE_FALSE, and short-answer types (favor MCQ)."
      : `All questions must be type ${questionType}.`;
  const diffInstr =
    difficulty === "Mixed"
      ? "Mix Easy/Medium/Hard roughly evenly."
      : `All questions must be ${difficulty} difficulty.`;

  return `Generate exactly ${n} quiz questions from the study material below.
${typeInstr}
${diffInstr}

STUDY MATERIAL:
"""
${text.slice(0, 40000)}
"""`;
}

// ─── Parse questions ──────────────────────────────────────────────────────────

function parseQuestions(raw: any[]): any[] {
  return (raw || []).map((q: any) => ({
    type: q.type,
    title: q.title,
    options: q.options || [],
    correctAnswers: q.correctAnswers || [],
    explanation: q.explanation || "",
    points:
      q.points ??
      (q.difficulty === "Hard" ? 3 : q.difficulty === "Easy" ? 1 : 2),
    difficulty: q.difficulty || "Medium",
    required: true,
  }));
}

// ─── Gemini with key rotation ─────────────────────────────────────────────────

async function runGemini(prompt: string): Promise<any[]> {
  const response = await geminiWithFallback((ai) =>
    ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseSchema: SCHEMA as any,
      },
    })
  );
  const parsed = JSON.parse(response.text || "{}");
  return parseQuestions(parsed.questions);
}

// ─── Groq fallback ────────────────────────────────────────────────────────────

async function runGroq(prompt: string, apiKey: string): Promise<any[]> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
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
  const parsed = JSON.parse(content);
  return parseQuestions(parsed.questions);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

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
      return res
        .status(400)
        .json({ error: "Need study material to generate a quiz." });
    }

    const n = Math.max(1, Math.min(20, Number(count) || 5));
    const groqKey = process.env.GROQ_API_KEY;
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
        return res
          .status(200)
          .json({ questions: cached.questions, fromCache: true });
      }
      await cacheRef.delete();
    }

    const prompt = buildPrompt(text, n, difficulty, questionType);

    // ── Try Gemini with key rotation first ───────────────────────────────────
    let questions: any[] | null = null;
    let usedModel = "";

    try {
      console.log("[quiz/generate] trying Gemini 2.5 Flash-Lite...");
      questions = await runGemini(prompt);
      usedModel = "gemini-2.5-flash-lite";
      console.log("[quiz/generate] Gemini success");
    } catch (geminiErr: any) {
      if (isQuotaError(geminiErr) || geminiErr?.allKeysExhausted) {
        console.warn("[quiz/generate] all Gemini keys exhausted, falling back to Groq...");
      } else {
        console.error("[quiz/generate] Gemini error:", geminiErr.message);
      }
    }

    // ── Fallback to Groq ─────────────────────────────────────────────────────
    if (!questions && groqKey) {
      try {
        console.log("[quiz/generate] trying Groq Llama 3.3-70B...");
        questions = await runGroq(prompt, groqKey);
        usedModel = "groq-llama-3.3-70b";
        console.log("[quiz/generate] Groq success");
      } catch (groqErr: any) {
        console.error("[quiz/generate] Groq error:", groqErr.message);
      }
    }

    // ── Both failed ──────────────────────────────────────────────────────────
    if (!questions || questions.length === 0) {
      return res.status(429).json({
        error:
          "All AI services are temporarily unavailable. Please try again in a few minutes.",
      });
    }

    // ── Save to cache ────────────────────────────────────────────────────────
    try {
      const { FieldValue } = await import("firebase-admin/firestore");
      await cacheRef.set({
        questions,
        cacheKey,
        usedModel,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log("[quiz/generate] cached via", usedModel);
    } catch (cacheErr) {
      console.warn("[quiz/generate] cache write failed:", cacheErr);
    }

    return res.status(200).json({ questions, fromCache: false, usedModel });

  } catch (err: any) {
    console.error("quiz/generate error", err);
    return res.status(500).json({
      error: err.message || "Quiz generation failed",
    });
  }
}