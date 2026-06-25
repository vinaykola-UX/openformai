import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import { verifyAuth } from "./_lib/verify-auth.js";

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["MCQ", "CHECKBOX", "SHORT", "PARAGRAPH", "TRUE_FALSE"] },
          title: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
          correctAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
          points: { type: Type.NUMBER },
          required: { type: Type.BOOLEAN },
        },
        required: ["type", "title"],
      },
    },
  },
  required: ["questions"],
};

const SYSTEM = `You are an exam parser. Convert pasted exam questions into structured JSON.
- Detect type: MCQ (one answer), CHECKBOX (multiple answers), TRUE_FALSE, SHORT (one line), PARAGRAPH (long form).
- Strip answer labels like "a)", "1.", "Answer:".
- Use correctAnswer (string) for MCQ/TRUE_FALSE/SHORT, correctAnswers (string array) for CHECKBOX.
- Default points to 1 when not specified.
- required defaults to true.
- Return ONLY questions present in the input; do not invent questions.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);
    const { text } = req.body || {};
    if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing text" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text }] }],
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
      options: q.options,
      correctAnswer: q.correctAnswers?.length ? q.correctAnswers : q.correctAnswer,
      points: q.points ?? 1,
      required: q.required ?? true,
    }));

    return res.status(200).json({ questions });
  } catch (err: any) {
    console.error("generate error", err);
    return res.status(500).json({ error: err.message || "Generation failed" });
  }
}
