import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import { verifyAuth } from "./_lib/verify-auth.js";
import { parseQuestions, toFormsPayload } from "../src/lib/questionParser.js";

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

// ─── Source types that NEVER need Gemini ─────────────────────────────────────

const TEXT_SOURCES = new Set(["text", "txt", "docx", "pdf", "csv", "md", "markdown"]);

function needsAI(sourceType: string): boolean {
  return sourceType === "image" || sourceType === "scanned_pdf";
}

// ─── Map parser types to your existing type strings ──────────────────────────

function mapType(parserType: string): string {
  switch (parserType) {
    case "multiple_choice": return "MCQ";
    case "checkbox":        return "CHECKBOX";
    case "true_false":      return "TRUE_FALSE";
    case "short_answer":    return "SHORT";
    case "paragraph":       return "PARAGRAPH";
    default:                return "SHORT";
  }
}

function defaultSeconds(type: string) {
  switch (type) {
    case "TRUE_FALSE": return 15;
    case "MCQ":        return 30;
    case "CHECKBOX":   return 40;
    case "SHORT":      return 45;
    case "PARAGRAPH":  return 120;
    default:           return 30;
  }
}

// ─── Local parser path ────────────────────────────────────────────────────────

function runLocalParser(text: string) {
  const result = parseQuestions(text);

  if (result.questions.length === 0) {
    return null; // signal: couldn't parse, caller decides what to do
  }

  let totalSeconds = 0;

  const questions = result.questions.map((q) => {
    const type = mapType(q.type);
    const est = defaultSeconds(type);
    totalSeconds += est;

    return {
      type,
      title: q.text,
      options: q.options.map((o) => o.text),
      correctAnswer: q.answer ?? undefined,
      points: 1,
      required: true,
      suggestedTitle: undefined,
      clarityNote: undefined,
      estimatedSeconds: est,
    };
  });

  const estimatedMinutes = Math.max(1, Math.round(totalSeconds / 60));

  return {
    questions,
    meta: {
      estimatedMinutes,
      estimatedSeconds: totalSeconds,
      warnings: [],
      usedAI: false,
    },
  };
}

// ─── Gemini path (images + scanned PDFs only) ─────────────────────────────────

async function runGemini(text: string, apiKey: string) {
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

  return {
    questions,
    meta: {
      estimatedMinutes,
      estimatedSeconds: totalSeconds,
      warnings,
      usedAI: true,
    },
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);

    const { text, sourceType = "text" } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text" });
    }

    // ── Path A: text/pdf/docx/txt → local parser, zero Gemini ──
    if (!needsAI(sourceType)) {
      const localResult = runLocalParser(text);

      if (localResult) {
        return res.status(200).json(localResult);
      }

      // Parser failed to find questions → return clear error, don't burn quota
      return res.status(422).json({
        error: "No questions detected in the text.",
        hint: "Make sure questions are numbered (1. 2. 3.) and options use A) B) C) format.",
        usedAI: false,
      });
    }

    // ── Path B: image / scanned_pdf → Gemini ──
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

    const aiResult = await runGemini(text, apiKey);
    return res.status(200).json(aiResult);

  } catch (err: any) {
    console.error("generate error", err);

    // Friendly quota error
    if (
      err.message?.includes("429") ||
      err.message?.includes("RESOURCE_EXHAUSTED") ||
      err.message?.includes("quota")
    ) {
      return res.status(429).json({
        error: "AI quota exceeded. Paste text directly — that path never uses AI.",
        usedAI: true,
      });
    }

    return res.status(500).json({ error: err.message || "Generation failed" });
  }
}