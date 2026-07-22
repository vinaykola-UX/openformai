import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import { verifyAuth } from "./_lib/verify-auth.js";
import { extractContent } from "./_lib/extract-content.js";
import { parseQuestions } from "../src/lib/questionParser.js";
import { geminiWithFallback, isQuotaError } from "./_lib/gemini-keys.js";

export const config = {
  api: {
    bodyParser: { sizeLimit: "15mb" },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// action: "extract"
// ─────────────────────────────────────────────────────────────────────────

async function handleExtract(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);
    const { filename, mimeType, data } = (req.body || {}) as {
      filename?: string;
      mimeType?: string;
      data?: string;
    };
    if (!data) return res.status(400).json({ error: "Missing file data" });

    const buf = Buffer.from(data, "base64");
    const text = await extractContent(buf, mimeType || "", filename || "");
    if (!text) return res.status(422).json({ error: "No text could be extracted from this file" });

    console.log(`[extract] ${filename} (${mimeType}) -> ${text.length} chars`);
    return res.status(200).json({ text });
  } catch (err: any) {
    console.error("[extract] error", err);
    return res.status(500).json({ error: err.message || "Extraction failed" });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// action: "drive-import"
// ─────────────────────────────────────────────────────────────────────────

const MAX_BYTES = 25 * 1024 * 1024;

const GOOGLE_EXPORTS: Record<string, { mime: string; ext: string; format: string }> = {
  document: { mime: "application/pdf", ext: ".pdf", format: "pdf" },
  spreadsheets: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx", format: "xlsx" },
  presentation: { mime: "application/pdf", ext: ".pdf", format: "pdf" },
};

function parseDriveUrl(input: string):
  | { kind: "file"; id: string }
  | { kind: "google"; id: string; type: "document" | "spreadsheets" | "presentation" }
  | null {
  if (!input) return null;
  const trimmed = input.trim();

  const gDoc = trimmed.match(
    /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/
  );
  if (gDoc) {
    return { kind: "google", type: gDoc[1] as any, id: gDoc[2] };
  }

  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?(?:export=\w+&)?id=([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return { kind: "file", id: m[1] };
  }

  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return { kind: "file", id: trimmed };
  return null;
}

async function fetchAsBuffer(url: string): Promise<{ buf: Buffer; contentType: string; filename: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Drive download failed (${res.status}). The file may be private — share it as "Anyone with the link".`);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  if (contentType.includes("text/html")) {
    throw new Error(
      "Google Drive returned an HTML page instead of the file. Make sure the link is shared as 'Anyone with the link' and points to a single file."
    );
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) throw new Error("File exceeds 25 MB limit.");
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  const filename = m ? decodeURIComponent(m[1].replace(/"$/, "")) : "drive-file";
  return { buf: Buffer.from(ab), contentType, filename };
}

async function handleDriveImport(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);
    const { url } = (req.body || {}) as { url?: string };
    if (!url) return res.status(400).json({ error: "Missing Drive URL" });

    const parsed = parseDriveUrl(url);
    if (!parsed) return res.status(400).json({ error: "Could not detect a Google Drive file in that link." });

    let downloadUrl: string;
    let forcedExt = "";
    let forcedMime = "";

    if (parsed.kind === "google") {
      const exp = GOOGLE_EXPORTS[parsed.type];
      downloadUrl = `https://docs.google.com/${parsed.type}/d/${parsed.id}/export?format=${exp.format}`;
      forcedExt = exp.ext;
      forcedMime = exp.mime;
    } else {
      downloadUrl = `https://drive.google.com/uc?export=download&id=${parsed.id}`;
    }

    console.log(`[drive-import] fetching ${downloadUrl}`);
    const { buf, contentType, filename } = await fetchAsBuffer(downloadUrl);
    const finalMime = forcedMime || contentType;
    const finalName = forcedExt ? `${filename}${forcedExt}` : filename;

    const text = await extractContent(buf, finalMime, finalName);
    if (!text) return res.status(422).json({ error: "No text could be extracted from the Drive file." });

    console.log(`[drive-import] ${finalName} (${finalMime}) -> ${text.length} chars`);
    return res.status(200).json({ text, filename: finalName, mimeType: finalMime });
  } catch (err: any) {
    console.error("[drive-import] error", err);
    return res.status(500).json({ error: err.message || "Drive import failed" });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// action: "generate"
// ─────────────────────────────────────────────────────────────────────────

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

function needsAI(sourceType: string): boolean {
  return sourceType === "image" || sourceType === "scanned_pdf";
}

function mapType(parserType: string): string {
  switch (parserType) {
    case "multiple_choice": return "MCQ";
    case "checkbox":        return "CHECKBOX";
    case "true_false":      return "MCQ";
    case "short_answer":    return "SHORT";
    case "paragraph":       return "PARAGRAPH";
    default:                return "SHORT";
  }
}

function runLocalParser(text: string) {
  const result = parseQuestions(text);

  if (result.questions.length === 0) return null;

  const questions = result.questions.map((q) => ({
    type: mapType(q.type),
    title: q.text,
    options: q.options.map((o) => o.text),
    required: true,
    suggestedTitle: undefined,
    clarityNote: undefined,
  }));

  return {
    questions,
    meta: {
      estimatedMinutes: Math.max(1, Math.round(questions.length * 0.5)),
      warnings: [],
      usedAI: false,
    },
  };
}

async function runGemini(text: string) {
  const response = await geminiWithFallback((ai) =>
    ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseSchema: SCHEMA as any,
      },
    })
  );

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

async function handleGenerate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);

    const { text, sourceType = "text" } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text" });
    }

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

    const aiResult = await runGemini(text);
    return res.status(200).json(aiResult);

  } catch (err: any) {
    console.error("generate error", err);

    if (isQuotaError(err) || err?.allKeysExhausted) {
      return res.status(429).json({
        error: "AI quota exceeded on all keys. Paste text directly — that path never uses AI.",
        usedAI: true,
      });
    }

    return res.status(500).json({ error: err.message || "Generation failed" });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Router — dispatches on ?action=... set by vercel.json
// ─────────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined;
  switch (action) {
    case "extract":
      return handleExtract(req, res);
    case "drive-import":
      return handleDriveImport(req, res);
    case "generate":
      return handleGenerate(req, res);
    default:
      return res.status(400).json({ error: `Unknown or missing action: ${action}` });
  }
}