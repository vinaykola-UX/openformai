import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import { google } from "googleapis";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./_lib/verify-auth.js";
import { getAdmin } from "./_lib/firebase-admin.js";
import { oauthClient } from "./_lib/google-oauth.js";
import { geminiWithFallback, isQuotaError } from "./_lib/gemini-keys.js";
import {
  CACHE_TTL_MS,
  makeCacheKey,
  buildQuestionsPrompt,
  runGeminiQuestions,
  runGroqQuestions,
} from "./_lib/quiz-shared.js";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

// ── action: "analyze" ────────────────────────────────────────────────────

const ANALYZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING },
    mainTopic: { type: Type.STRING },
    subtopics: { type: Type.ARRAY, items: { type: Type.STRING } },
    concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
    definitions: { type: Type.ARRAY, items: { type: Type.STRING } },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    formulas: { type: Type.ARRAY, items: { type: Type.STRING } },
    learningObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
    difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
  },
  required: ["subject", "mainTopic", "subtopics"],
};

const ANALYZE_SYSTEM = `You are an expert curriculum analyst. Given study material, extract a concise structured summary suitable for quiz generation as valid JSON. Return only what is actually present in the text — do not invent.`;

async function runGeminiAnalyze(text: string) {
  const response = await geminiWithFallback((ai) =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: text.slice(0, 40000) }] }],
      config: { systemInstruction: ANALYZE_SYSTEM, responseMimeType: "application/json", responseSchema: ANALYZE_SCHEMA as any },
    })
  );
  return JSON.parse(response.text || "{}");
}

async function runGroqAnalyze(text: string, apiKey: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            ANALYZE_SYSTEM +
            ` Respond ONLY with a valid JSON object matching this shape: {"subject":string,"mainTopic":string,"subtopics":string[],"concepts":string[],"definitions":string[],"keywords":string[],"formulas":string[],"learningObjectives":string[],"difficulty":"Easy"|"Medium"|"Hard"}.`,
        },
        { role: "user", content: text.slice(0, 40000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error ${res.status}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function handleAnalyze(req: VercelRequest, res: VercelResponse) {
  await verifyAuth(req);
  const { text } = (req.body || {}) as { text?: string };
  if (!text || text.trim().length < 40) {
    return res.status(400).json({ error: "Need at least 40 characters of study material to analyze." });
  }
  const words = text.trim().split(/\s+/).length;
  const readingMinutes = Math.max(1, Math.round(words / 220));

  let parsed: any = null;
  try {
    parsed = await runGeminiAnalyze(text);
  } catch (geminiErr: any) {
    if (!(isQuotaError(geminiErr) || geminiErr?.allKeysExhausted)) {
      console.error("[quiz:analyze] Gemini error:", geminiErr.message);
    }
  }
  if (!parsed) {
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        parsed = await runGroqAnalyze(text, groqKey);
      } catch (groqErr: any) {
        console.error("[quiz:analyze] Groq error:", groqErr.message);
      }
    }
  }
  if (!parsed) {
    return res.status(429).json({ error: "All AI services are temporarily unavailable. Please try again in a few minutes." });
  }
  return res.status(200).json({ ...parsed, wordCount: words, readingMinutes });
}

// ── action: "generate" ───────────────────────────────────────────────────

async function handleGenerate(req: VercelRequest, res: VercelResponse) {
  await verifyAuth(req);
  const { text, count = 5, difficulty = "Mixed", questionType = "Mixed" } = (req.body || {}) as {
    text?: string; count?: number; difficulty?: string; questionType?: string;
  };
  if (!text || text.trim().length < 40) {
    return res.status(400).json({ error: "Need study material to generate a quiz." });
  }

  const n = Math.max(1, Math.min(100, Number(count) || 5));
  const groqKey = process.env.GROQ_API_KEY;
  const { db } = getAdmin();

  const cacheKey = makeCacheKey(text, n, difficulty, questionType);
  const cacheRef = db.collection("quiz_cache").doc(cacheKey);
  const cacheSnap = await cacheRef.get();

  if (cacheSnap.exists) {
    const cached = cacheSnap.data()!;
    const age = Date.now() - (cached.createdAt?.toMillis?.() ?? 0);
    if (age < CACHE_TTL_MS) {
      return res.status(200).json({ questions: cached.questions, fromCache: true });
    }
    await cacheRef.delete();
  }

  const prompt = buildQuestionsPrompt(text, n, difficulty, questionType);
  let questions: any[] | null = null;
  let usedModel = "";

  try {
    questions = await runGeminiQuestions(prompt);
    usedModel = "gemini-2.5-flash-lite";
  } catch (geminiErr: any) {
    if (!(isQuotaError(geminiErr) || geminiErr?.allKeysExhausted)) {
      console.error("[quiz:generate] Gemini error:", geminiErr.message);
    }
  }

  if (!questions && groqKey) {
    try {
      questions = await runGroqQuestions(prompt, groqKey);
      usedModel = "groq-llama-3.3-70b";
    } catch (groqErr: any) {
      console.error("[quiz:generate] Groq error:", groqErr.message);
    }
  }

  if (!questions || questions.length === 0) {
    return res.status(429).json({ error: "All AI services are temporarily unavailable. Please try again in a few minutes." });
  }

  try {
    await cacheRef.set({ questions, cacheKey, usedModel, createdAt: FieldValue.serverTimestamp() });
  } catch (cacheErr) {
    console.warn("[quiz:generate] cache write failed:", cacheErr);
  }

  return res.status(200).json({ questions, fromCache: false, usedModel });
}

// ── action: "create-form" ────────────────────────────────────────────────

type QuizQuestion = {
  type: "MCQ" | "CHECKBOX" | "TRUE_FALSE" | "SHORT" | "PARAGRAPH";
  title: string;
  options?: string[];
  correctAnswers?: string[];
  explanation?: string;
  points?: number;
  required?: boolean;
};

function buildFormItem(q: QuizQuestion, index: number, isQuiz: boolean) {
  const required = q.required ?? true;
  const points = Math.max(0, Math.round(q.points ?? 1));

  const grading = isQuiz
    ? {
        pointValue: points,
        correctAnswers: { answers: (q.correctAnswers || []).map((value) => ({ value })) },
        whenRight: q.explanation ? { text: q.explanation } : undefined,
        whenWrong: q.explanation ? { text: q.explanation } : undefined,
      }
    : undefined;

  if (q.type === "SHORT" || q.type === "PARAGRAPH") {
    return {
      createItem: {
        item: {
          title: q.title,
          questionItem: {
            question: {
              required,
              textQuestion: { paragraph: q.type === "PARAGRAPH" },
              grading: isQuiz && q.correctAnswers?.length ? grading : undefined,
            },
          },
        },
        location: { index },
      },
    };
  }

  const options = q.type === "TRUE_FALSE" ? ["True", "False"] : q.options || [];

  return {
    createItem: {
      item: {
        title: q.title,
        questionItem: {
          question: {
            required,
            choiceQuestion: {
              type: q.type === "CHECKBOX" ? "CHECKBOX" : "RADIO",
              options: options.map((value) => ({ value })),
              shuffle: false,
            },
            grading: isQuiz ? grading : undefined,
          },
        },
      },
      location: { index },
    },
  };
}

async function handleCreateForm(req: VercelRequest, res: VercelResponse) {
  const { uid } = await verifyAuth(req);
  const { title, questions, mode, expiresAt } = req.body as {
    title: string; questions: QuizQuestion[]; mode: "quiz" | "form"; expiresAt?: string | null;
  };
  if (!title || !Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ error: "Missing title or questions" });
  }
  const isQuiz = mode === "quiz";

  const { db } = getAdmin();
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() || {};
  const refreshToken = userData.googleRefreshToken;
  if (!refreshToken) {
    return res.status(400).json({ error: "Google account not connected. Visit /connect-google." });
  }

  const DAILY_LIMIT = 5;
  const TOTAL_LIMIT = 80;

  if (!userData.unlocked) {
    const totalSnap = await db.collection("forms").where("uid", "==", uid).count().get();
    const totalUsed = totalSnap.data().count;
    if (totalUsed >= TOTAL_LIMIT) {
      return res.status(403).json({
        error: `You've reached the free limit of ${TOTAL_LIMIT} forms. Enter the unlock passcode to continue.`,
        code: "LIMIT_REACHED", scope: "total", limit: TOTAL_LIMIT, used: totalUsed,
      });
    }
    const allSnap = await db.collection("forms").where("uid", "==", uid).get();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayUsed = allSnap.docs.filter((d) => {
      const ts = d.data().createdAt?.toMillis?.();
      return typeof ts === "number" && ts >= startOfDay;
    }).length;
    if (dayUsed >= DAILY_LIMIT) {
      return res.status(429).json({
        error: `Daily limit reached (${DAILY_LIMIT} forms/day). Try again tomorrow or enter the unlock passcode.`,
        code: "DAILY_LIMIT_REACHED", scope: "daily", limit: DAILY_LIMIT, used: dayUsed,
      });
    }
  }

  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const forms = google.forms({ version: "v1", auth: client });

  const created = await forms.forms.create({ requestBody: { info: { title } } });
  const formId = created.data.formId!;

  const requests: any[] = [];
  if (isQuiz) {
    requests.push({
      updateSettings: { settings: { quizSettings: { isQuiz: true } }, updateMask: "quizSettings.isQuiz" },
    });
  }
  questions.forEach((q, i) => requests.push(buildFormItem(q, i, isQuiz)));

  await forms.forms.batchUpdate({ formId, requestBody: { requests } });

  const full = await forms.forms.get({ formId });
  const responderUri = full.data.responderUri!;
  const editUri = `https://docs.google.com/forms/d/${formId}/edit`;

  await db.collection("forms").add({
    uid, title, googleFormId: formId, responderUri, editUri,
    questionCount: questions.length, questions,
    source: "ai-quiz", quizMode: isQuiz, isQuiz,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return res.status(200).json({ formId, responderUri, editUri });
}

// ── Router ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = (req.body || {}) as { action?: string };
  try {
    switch (action) {
      case "analyze":
        return await handleAnalyze(req, res);
      case "generate":
        return await handleGenerate(req, res);
      case "create-form":
        return await handleCreateForm(req, res);
      default:
        return res.status(400).json({ error: `Unknown or missing action: ${action}` });
    }
  } catch (err: any) {
    console.error(`[quiz:${action}] error`, err);
    if (isQuotaError(err) || err?.allKeysExhausted) {
      return res.status(429).json({ error: "AI quota exceeded. Try again in a few minutes." });
    }
    return res.status(500).json({ error: err.message || "Request failed" });
  }
}