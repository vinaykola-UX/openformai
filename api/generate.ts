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
          type: {
            type: Type.STRING,
            enum: [
              "SHORT", "PARAGRAPH", "MCQ", "CHECKBOX", "DROPDOWN",
              "LINEAR_SCALE", "DATE", "TIME",
              "GRID_MULTIPLE_CHOICE", "GRID_CHECKBOX", "FILE_UPLOAD",
            ],
          },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          rows: { type: Type.ARRAY, items: { type: Type.STRING } },
          required: { type: Type.BOOLEAN },
          suggestedTitle: { type: Type.STRING },
          clarityNote: { type: Type.STRING },
        },
        required: ["type", "title"],
      },
    },
  },
  required: ["questions"],
};

const SYSTEM = `You are a form parser and quality reviewer. Convert pasted form/survey/exam-style questions into structured JSON for a normal Google Form (no grading, no quiz mode).

PARSING:
- Detect type: MCQ (one answer), CHECKBOX (multiple answers), DROPDOWN (single pick from list), SHORT (one line answer), PARAGRAPH (long form answer), DATE, TIME, LINEAR_SCALE (rating), GRID_MULTIPLE_CHOICE, GRID_CHECKBOX, FILE_UPLOAD.
- Strip answer/option labels like "a)", "1.", "Answer:" — do NOT extract or include any "correct answer" or "answer key", this is a normal form, not a quiz.
- required defaults to true.
- Return ONLY questions present in the input; do not invent questions.

QUALITY REVIEW (per question):
- If a question is ambiguous, grammatically poor, or unclear, set "suggestedTitle" to a clearer rewording. Otherwise omit.
- Set "clarityNote" to a short reason (max 120 chars) ONLY when you provide a suggestedTitle.`;

// ─── Source types that NEVER need Gemini ─────────────────────────────────────

function needsAI(sourceType: string): boolean {
  return sourceType === "image" || sourceType === "scanned_pdf";
}

// ─── Map parser types to Forms type strings ──────────────────────────────────

function mapType(parserType: string): string {
  switch (parserType) {
    case "multiple_choice": return "MCQ";
    case "checkbox":        return "CHECKBOX";
    case "true_false":      return "MCQ"; // True/False becomes MCQ with True/False options
    case "short_answer":    return "SHORT";
    case "paragraph":       return "PARAGRAPH";
    default:                return "SHORT";
  }
}

// ─── Local parser path ────────────────────────────────────────────────────────

function runLocalParser(text: string) {
  const result = parseQuestions(text);

  if (result.questions.length === 0) {
    return null; // signal: couldn't parse, caller decides what to do
  }

  const questions = result.questions.map((q) => {
    const type = mapType(q.type);
    return {
      type,
      title: q.text,
      options: q.options.map((o) => o.text),
      required: true,
      suggestedTitle: undefined,
      clarityNote: undefined,
    };
  });

  return {
    questions,
    meta: {
      estimatedMinutes: Math.max(1, Math.round(questions.length * 0.5)),
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

  const questions = (parsed.questions || []).map((q: any) => ({
    type: q.type,
    title: q.title,
    description: q.description || undefined,
    options: q.options || undefined,
    rows: q.rows || undefined,
    required: q.required ?? true,
    suggestedTitle: q.suggestedTitle || undefined,
    clarityNote: q.clarityNote || undefined,
  }));

  return {
    questions,
    meta: {
      estimatedMinutes: Math.max(1, Math.round(questions.length * 0.5)),
      warnings: [],
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