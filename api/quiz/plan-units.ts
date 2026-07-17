import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import { verifyAuth } from "../_lib/verify-auth.js";
import { geminiWithFallback, isQuotaError } from "../_lib/gemini-keys.js";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

const MAX_CHARS = 60000; // planning call can see more than a single-subtopic generate call
const MAX_UNITS = 20;
const MAX_SUBTOPICS_PER_UNIT = 10;

// ─── Schema: titles + short verbatim markers only — never full content ──────
const SCHEMA_WHOLE_SUBJECT = {
  type: Type.OBJECT,
  properties: {
    units: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          unitTitle: { type: Type.STRING },
          startMarker: {
            type: Type.STRING,
            description: "6-12 words copied EXACTLY (verbatim, same casing/punctuation) from the source text marking where this unit begins.",
          },
          subtopics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subtopicTitle: { type: Type.STRING },
                startMarker: {
                  type: Type.STRING,
                  description: "6-12 words copied EXACTLY from the source text marking where this subtopic begins, must appear inside its parent unit's span.",
                },
              },
              required: ["subtopicTitle", "startMarker"],
            },
          },
        },
        required: ["unitTitle", "startMarker", "subtopics"],
      },
    },
  },
  required: ["units"],
};

const SCHEMA_SINGLE_UNIT = {
  type: Type.OBJECT,
  properties: {
    subtopics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          subtopicTitle: { type: Type.STRING },
          startMarker: {
            type: Type.STRING,
            description: "6-12 words copied EXACTLY (verbatim) from the source text marking where this subtopic begins.",
          },
        },
        required: ["subtopicTitle", "startMarker"],
      },
    },
  },
  required: ["subtopics"],
};

const SYSTEM_WHOLE_SUBJECT = `You are analyzing study material to detect its structure (units and subtopics within each unit) — a table-of-contents style breakdown, not a summary.

Rules:
- Identify distinct units (chapters/major sections) in the order they appear.
- Within each unit, identify 2-6 meaningful subtopics.
- For every unit and subtopic, "startMarker" must be an EXACT verbatim substring copied from the source text (6-12 words), not paraphrased — it will be used to locate the text programmatically, so exact characters matter.
- Do not invent structure that isn't there. If the material has no clear unit divisions, return a single unit covering everything.
- Max ${MAX_UNITS} units, max ${MAX_SUBTOPICS_PER_UNIT} subtopics per unit.`;

const SYSTEM_SINGLE_UNIT = `You are analyzing study material (already known to be a single unit/chapter) to detect its subtopics.

Rules:
- Identify 2-8 meaningful subtopics in the order they appear.
- "startMarker" must be an EXACT verbatim substring copied from the source text (6-12 words), not paraphrased — it will be used to locate the text programmatically.
- Do not invent subtopics that aren't there. If the material is too short/uniform to split, return a single subtopic covering everything.
- Max ${MAX_SUBTOPICS_PER_UNIT} subtopics.`;

// ─── Locate a marker in text, tolerant of minor whitespace differences ──────
function findMarker(text: string, marker: string): number {
  if (!marker) return -1;
  let idx = text.indexOf(marker);
  if (idx !== -1) return idx;
  // Fallback: normalize whitespace on both sides and retry
  const normText = text.replace(/\s+/g, " ");
  const normMarker = marker.replace(/\s+/g, " ").trim();
  const normIdx = normText.indexOf(normMarker);
  if (normIdx === -1) return -1;
  // Map back to approximate original index (good enough for a slice boundary)
  return normIdx;
}

// ─── Slice text into ordered spans given a list of (label, startIndex) ─────
function sliceSpans<T extends { startIndex: number }>(text: string, items: T[]): (T & { textSlice: string })[] {
  const sorted = [...items].sort((a, b) => a.startIndex - b.startIndex);
  return sorted.map((item, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1].startIndex : text.length;
    return { ...item, textSlice: text.slice(item.startIndex, end).trim() };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await verifyAuth(req);

    const { text, mode } = (req.body || {}) as { text?: string; mode?: "whole-subject" | "single-unit" };
    if (!text || text.trim().length < 100) {
      return res.status(400).json({ error: "Not enough text to plan a structure from." });
    }
    const resolvedMode = mode === "single-unit" ? "single-unit" : "whole-subject";
    const clipped = text.slice(0, MAX_CHARS);

    const schema = resolvedMode === "single-unit" ? SCHEMA_SINGLE_UNIT : SCHEMA_WHOLE_SUBJECT;
    const system = resolvedMode === "single-unit" ? SYSTEM_SINGLE_UNIT : SYSTEM_WHOLE_SUBJECT;

    const response = await geminiWithFallback((ai) =>
      ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [{ role: "user", parts: [{ text: clipped }] }],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseSchema: schema as any,
        },
      })
    );

    const parsed = JSON.parse(response.text || "{}");

    if (resolvedMode === "single-unit") {
      const rawSubtopics = (parsed.subtopics || []).slice(0, MAX_SUBTOPICS_PER_UNIT);
      const located = rawSubtopics
        .map((s: any) => ({ subtopicTitle: s.subtopicTitle, startIndex: findMarker(clipped, s.startMarker) }))
        .filter((s: any) => s.startIndex !== -1);

      if (located.length === 0) {
        // Marker matching failed entirely — fall back to one subtopic, whole text
        return res.status(200).json({
          subtopics: [{ subtopicTitle: "Full content", textSlice: clipped }],
          degraded: true,
        });
      }

      const subtopics = sliceSpans(clipped, located).map(({ subtopicTitle, textSlice }) => ({ subtopicTitle, textSlice }));
      return res.status(200).json({ subtopics, degraded: false });
    }

    // whole-subject mode
    const rawUnits = (parsed.units || []).slice(0, MAX_UNITS);
    const locatedUnits = rawUnits
      .map((u: any) => ({ unitTitle: u.unitTitle, startIndex: findMarker(clipped, u.startMarker), rawSubtopics: u.subtopics || [] }))
      .filter((u: any) => u.startIndex !== -1);

    if (locatedUnits.length === 0) {
      return res.status(200).json({
        units: [{ unitTitle: "Full subject", subtopics: [{ subtopicTitle: "Full content", textSlice: clipped }] }],
        degraded: true,
      });
    }

    const unitSpans = sliceSpans(clipped, locatedUnits);

    const units = unitSpans.map(({ unitTitle, textSlice: unitText, rawSubtopics, startIndex }) => {
      const located = (rawSubtopics as any[])
        .slice(0, MAX_SUBTOPICS_PER_UNIT)
        .map((s: any) => ({ subtopicTitle: s.subtopicTitle, startIndex: findMarker(unitText, s.startMarker) }))
        .filter((s: any) => s.startIndex !== -1);

      const subtopics = located.length > 0
        ? sliceSpans(unitText, located).map(({ subtopicTitle, textSlice }) => ({ subtopicTitle, textSlice }))
        : [{ subtopicTitle: unitTitle, textSlice: unitText }]; // degrade to one subtopic = whole unit

      return { unitTitle, subtopics };
    });

    return res.status(200).json({ units, degraded: false });
  } catch (err: any) {
    console.error("[quiz/plan-units] error", err);
    if (isQuotaError(err) || err?.allKeysExhausted) {
      return res.status(429).json({ error: "AI quota exceeded. Try again in a few minutes." });
    }
    return res.status(500).json({ error: err.message || "Planning failed" });
  }
}