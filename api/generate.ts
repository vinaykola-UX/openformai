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
          suggestedTitle: { type: Type.STRING },
          clarityNote: { type: Type.STRING },
          estimatedSeconds: { type: Type.NUMBER },
        },
        required: ["type", "title"],
      },
    },
  },
  required: ["questions"],
};

const SYSTEM = `You are an exam parser and quality reviewer. Convert pasted exam questions into structured JSON.

PARSING:
- Detect type: MCQ (one answer), CHECKBOX (multiple answers), TRUE_FALSE, SHORT (one line), PARAGRAPH (long form).
- Strip answer labels like "a)", "1.", "Answer:".
- Use correctAnswer (string) for MCQ/TRUE_FALSE/SHORT, correctAnswers (string array) for CHECKBOX.
- Default points to 1 when not specified.
- required defaults to true.
- Return ONLY questions present in the input; do not invent questions.

QUALITY REVIEW (per question):
- If a question is ambiguous, grammatically poor, or unclear, set "suggestedTitle" to a clearer rewording. Otherwise omit.
- Set "clarityNote" to a short reason (max 120 chars) ONLY when you provide a suggestedTitle.
- IMPORTANT: If the source marks an MCQ with multiple correct answers, KEEP type as "MCQ" and keep correctAnswers as an array of all marked answers. The server will flag this as an authoring issue. Do not silently switch the type.
- Set "estimatedSeconds": realistic time to read+answer (TRUE_FALSE ~15, MCQ ~30, CHECKBOX ~40, SHORT ~45, PARAGRAPH ~120). Adjust for length/complexity.`;

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
    let totalSeconds = 0;
    const warnings: { index: number; type: string; message: string }[] = [];

    const questions = (parsed.questions || []).map((q: any, i: number) => {
      const rawArr = Array.isArray(q.correctAnswers) ? q.correctAnswers.filter(Boolean) : [];
      let correctAnswer: string | string[] | undefined =
        rawArr.length > 1 ? rawArr : rawArr[0] || q.correctAnswer;

      // Flag MCQ with multiple correct answers
      if (q.type === "MCQ" && rawArr.length > 1) {
        warnings.push({
          index: i,
          type: "mcq_multiple_correct",
          message: `Question ${i + 1} is a single-answer MCQ but has ${rawArr.length} correct answers marked. Switch to Checkboxes or pick one answer.`,
        });
      }

      const est =
        typeof q.estimatedSeconds === "number" && q.estimatedSeconds > 0
          ? Math.min(600, q.estimatedSeconds)
          : defaultSeconds(q.type);
      totalSeconds += est;

      return {
        type: q.type,
        title: q.title,
        options: q.options,
        correctAnswer,
        points: q.points ?? 1,
        required: q.required ?? true,
        suggestedTitle: q.suggestedTitle || undefined,
        clarityNote: q.clarityNote || undefined,
        estimatedSeconds: est,
      };
    });

    const estimatedMinutes = Math.max(1, Math.round(totalSeconds / 60));

    return res.status(200).json({
      questions,
      meta: { estimatedMinutes, estimatedSeconds: totalSeconds, warnings },
    });
  } catch (err: any) {
    console.error("generate error", err);
    return res.status(500).json({ error: err.message || "Generation failed" });
  }
}

function defaultSeconds(type: string) {
  switch (type) {
    case "TRUE_FALSE": return 15;
    case "MCQ": return 30;
    case "CHECKBOX": return 40;
    case "SHORT": return 45;
    case "PARAGRAPH": return 120;
    default: return 30;
  }
}
