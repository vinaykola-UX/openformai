import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import { verifyAuth } from "../_lib/verify-auth.js";
import { geminiWithFallback, isQuotaError } from "../_lib/gemini-keys.js";

const SCHEMA = {
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

const SYSTEM = `You are an expert curriculum analyst. Given study material, extract a concise structured summary suitable for quiz generation as valid JSON. Return only what is actually present in the text — do not invent.`;

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

async function runGeminiAnalyze(text: string) {
  const response = await geminiWithFallback((ai) =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: text.slice(0, 40000) }] }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseSchema: SCHEMA as any,
      },
    })
  );
  return JSON.parse(response.text || "{}");
}

async function runGroqAnalyze(text: string, apiKey: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            SYSTEM +
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);
    const { text } = (req.body || {}) as { text?: string };
    if (!text || text.trim().length < 40) {
      return res.status(400).json({ error: "Need at least 40 characters of study material to analyze." });
    }

    const words = text.trim().split(/\s+/).length;
    const readingMinutes = Math.max(1, Math.round(words / 220));

    let parsed: any = null;

    try {
      console.log("[quiz/analyze] trying Gemini with key rotation...");
      parsed = await runGeminiAnalyze(text);
    } catch (geminiErr: any) {
      if (isQuotaError(geminiErr) || geminiErr?.allKeysExhausted) {
        console.warn("[quiz/analyze] all Gemini keys exhausted, trying Groq...");
      } else {
        console.error("[quiz/analyze] Gemini error:", geminiErr.message);
      }
    }

    if (!parsed) {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey) {
        try {
          parsed = await runGroqAnalyze(text, groqKey);
        } catch (groqErr: any) {
          console.error("[quiz/analyze] Groq error:", groqErr.message);
        }
      }
    }

    if (!parsed) {
      return res.status(429).json({
        error: "All AI services are temporarily unavailable. Please try again in a few minutes.",
      });
    }

    return res.status(200).json({
      ...parsed,
      wordCount: words,
      readingMinutes,
    });
  } catch (err: any) {
    console.error("quiz/analyze error", err);
    return res.status(500).json({ error: err.message || "Analysis failed" });
  }
}
