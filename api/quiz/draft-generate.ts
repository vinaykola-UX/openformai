import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "../_lib/verify-auth.js";
import { getAdmin } from "../_lib/firebase-admin.js";
import { geminiWithFallback, isQuotaError } from "../_lib/gemini-keys.js";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

const SCHEMA = {
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

const SYSTEM = `You are an expert educator writing high-quality quiz questions from study material. Respond ONLY with valid JSON matching the schema.

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

function makeCacheKey(text: string, count: number, difficulty: string, questionType: string) {
  const raw = `${text.slice(0, 40000)}|${count}|${difficulty}|${questionType}`;
  return createHash("sha256").update(raw).digest("hex");
}
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function buildPrompt(text: string, n: number, difficulty: string, questionType: string, subtopicTitle: string) {
  const typeInstr =
    questionType === "Mixed"
      ? "Use a mix of MCQ, CHECKBOX, TRUE_FALSE, and short-answer types (favor MCQ)."
      : `All questions must be type ${questionType}.`;
  const diffInstr =
    difficulty === "Mixed" ? "Mix Easy/Medium/Hard roughly evenly." : `All questions must be ${difficulty} difficulty.`;

  return `Generate exactly ${n} quiz questions about the subtopic "${subtopicTitle}", using ONLY the material below.
${typeInstr}
${diffInstr}

STUDY MATERIAL:
"""
${text.slice(0, 40000)}
"""`;
}

function parseQuestions(raw: any[]): any[] {
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

async function runGemini(prompt: string): Promise<any[]> {
  const response = await geminiWithFallback((ai) =>
    ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseSchema: SCHEMA as any },
    })
  );
  const parsed = JSON.parse(response.text || "{}");
  return parseQuestions(parsed.questions);
}

async function runGroq(prompt: string, apiKey: string): Promise<any[]> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid } = await verifyAuth(req);
    const {
      draftId, unitId, subtopicId,
      count = 5, difficulty = "Mixed", questionType = "Mixed",
    } = (req.body || {}) as {
      draftId?: string; unitId?: string; subtopicId?: string;
      count?: number; difficulty?: string; questionType?: string;
    };

    if (!draftId || !unitId || !subtopicId) {
      return res.status(400).json({ error: "Missing draftId, unitId or subtopicId" });
    }

    const { db } = getAdmin();
    const draftRef = db.collection("quiz_drafts").doc(draftId);
    const draftSnap = await draftRef.get();
    if (!draftSnap.exists) return res.status(404).json({ error: "Draft not found" });
    if (draftSnap.data()?.uid !== uid) return res.status(403).json({ error: "Not authorized" });

    const subtopicRef = draftRef.collection("units").doc(unitId).collection("subtopics").doc(subtopicId);
    const subtopicSnap = await subtopicRef.get();
    if (!subtopicSnap.exists) return res.status(404).json({ error: "Subtopic not found" });

    const subtopicData = subtopicSnap.data()!;
    const wasAlreadyDone = subtopicData.status === "done";
    const text: string = subtopicData.textSlice || "";

    if (text.trim().length < 40) {
      await subtopicRef.set({ status: "error", error: "Not enough content in this subtopic to generate questions." }, { merge: true });
      return res.status(422).json({ error: "Not enough content in this subtopic." });
    }

    await subtopicRef.set({ status: "generating" }, { merge: true });

    const n = Math.max(1, Math.min(30, Number(count) || 5));
    const cacheKey = makeCacheKey(text, n, difficulty, questionType);
    const cacheRef = db.collection("quiz_cache").doc(cacheKey);
    const cacheSnap = await cacheRef.get();

    let questions: any[] | null = null;
    let usedModel = "";
    let fromCache = false;

    if (cacheSnap.exists) {
      const cached = cacheSnap.data()!;
      const age = Date.now() - (cached.createdAt?.toMillis?.() ?? 0);
      if (age < CACHE_TTL_MS) {
        questions = cached.questions;
        fromCache = true;
      } else {
        await cacheRef.delete();
      }
    }

    if (!questions) {
      const prompt = buildPrompt(text, n, difficulty, questionType, subtopicData.subtopicTitle || "");
      const groqKey = process.env.GROQ_API_KEY;

      try {
        questions = await runGemini(prompt);
        usedModel = "gemini-2.5-flash-lite";
      } catch (geminiErr: any) {
        if (!(isQuotaError(geminiErr) || geminiErr?.allKeysExhausted)) {
          console.error("[quiz/draft-generate] Gemini error:", geminiErr.message);
        }
      }

      if (!questions && groqKey) {
        try {
          questions = await runGroq(prompt, groqKey);
          usedModel = "groq-llama-3.3-70b";
        } catch (groqErr: any) {
          console.error("[quiz/draft-generate] Groq error:", groqErr.message);
        }
      }

      if (questions && questions.length > 0) {
        try {
          await cacheRef.set({ questions, cacheKey, usedModel, createdAt: FieldValue.serverTimestamp() });
        } catch (e) {
          console.warn("[quiz/draft-generate] cache write failed", e);
        }
      }
    }

    if (!questions || questions.length === 0) {
      await subtopicRef.set({ status: "error", error: "AI generation failed for this subtopic." }, { merge: true });
      return res.status(429).json({ error: "AI generation failed. You can retry this subtopic." });
    }

    await subtopicRef.set({ status: "done", questions, error: null }, { merge: true });

    if (!wasAlreadyDone) {
      await db.runTransaction(async (tx) => {
        const freshDraft = await tx.get(draftRef);
        if (!freshDraft.exists) return;
        const data = freshDraft.data()!;
        const doneCount = (data.doneCount || 0) + 1;
        const isReady = doneCount >= (data.subtopicCount || 0);
        tx.update(draftRef, {
          doneCount,
          status: isReady ? "ready" : "generating",
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    }

    return res.status(200).json({ questions, fromCache, usedModel, status: "done" });
  } catch (err: any) {
    console.error("[quiz/draft-generate] error", err);
    return res.status(500).json({ error: err.message || "Draft generation failed" });
  }
}