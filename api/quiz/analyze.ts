import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import { verifyAuth } from "../_lib/verify-auth.js";

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

const SYSTEM = `You are an expert curriculum analyst. Given study material, extract a concise structured summary suitable for quiz generation. Return only what is actually present in the text — do not invent.`;

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);
    const { text } = (req.body || {}) as { text?: string };
    if (!text || text.trim().length < 40) {
      return res.status(400).json({ error: "Need at least 40 characters of study material to analyze." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

    const words = text.trim().split(/\s+/).length;
    const readingMinutes = Math.max(1, Math.round(words / 220));

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: text.slice(0, 40000) }] }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseSchema: SCHEMA as any,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
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
