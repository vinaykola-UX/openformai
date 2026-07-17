import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import { verifyAuth } from "../_lib/verify-auth.js";
import { geminiWithFallback, isQuotaError } from "../_lib/gemini-keys.js";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

const MAX_CHARS = 60000;
const MAX_UNITS = 20;
const MAX_SUBTOPICS_PER_UNIT = 10;

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

function findMarker(text: string, marker: string): number {
  if (!marker) return -1;
  const idx = text.indexOf(marker);
  if (idx !== -1) return idx;
  const normText = text.replace(/\s+/g, " ");
  const normMarker = marker.replace(/\s+/g, " ").trim();
  return normText.indexOf(normMarker);
}

type LocatedSubtopic = { subtopicTitle: string; startIndex: number };
type ResolvedSubtopic = { subtopicTitle: string; textSlice: string };

function sliceSubtopics(text: string, located: LocatedSubtopic[]): ResolvedSubtopic[] {
  const sorted = [...located].sort((a, b) => a.startIndex - b.startIndex);
  return sorted.map((item, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1].startIndex : text.length;
    return { subtopicTitle: item.subtopicTitle, textSlice: text.slice(item.startIndex, end).trim() };
  });
}

type LocatedUnit = { unitTitle: string; startIndex: number; rawSubtopics: any[] };
type ResolvedUnit = { unitTitle: string; textSlice: string; rawSubtopics: any[] };

function sliceUnits(text: string, located: LocatedUnit[]): ResolvedUnit[] {
  const sorted = [...located].sort((a, b) => a.startIndex - b.startIndex);
  return sorted.map((item, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1].startIndex : text.length;
    return {
      unitTitle: item.unitTitle,
      textSlice: text.slice(item.startIndex, end).trim(),
      rawSubtopics: item.rawSubtopics,
    };
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
      const rawSubtopics: any[] = (parsed.subtopics || []).slice(0, MAX_SUBTOPICS_PER_UNIT);
      const located: LocatedSubtopic[] = rawSubtopics
        .map((s: any) => ({ subtopicTitle: s.subtopicTitle, startIndex: findMarker(clipped, s.startMarker) }))
        .filter((s: LocatedSubtopic) => s.startIndex !== -1);

      if (located.length === 0) {
        return res.status(200).json({
          subtopics: [{ subtopicTitle: "Full content", textSlice: clipped }],
          degraded: true,
        });
      }

      const subtopics = sliceSubtopics(clipped, located);
      return res.status(200).json({ subtopics, degraded: false });
    }

    // whole-subject mode
    const rawUnits: any[] = (parsed.units || []).slice(0, MAX_UNITS);
    const locatedUnits: LocatedUnit[] = rawUnits
      .map((u: any) => ({
        unitTitle: u.unitTitle,
        startIndex: findMarker(clipped, u.startMarker),
        rawSubtopics: u.subtopics || [],
      }))
      .filter((u: LocatedUnit) => u.startIndex !== -1);

    if (locatedUnits.length === 0) {
      return res.status(200).json({
        units: [{ unitTitle: "Full subject", subtopics: [{ subtopicTitle: "Full content", textSlice: clipped }] }],
        degraded: true,
      });
    }

    const unitSpans = sliceUnits(clipped, locatedUnits);

    const units = unitSpans.map(({ unitTitle, textSlice: unitText, rawSubtopics: unitRawSubtopics }) => {
      const located: LocatedSubtopic[] = (unitRawSubtopics as any[])
        .slice(0, MAX_SUBTOPICS_PER_UNIT)
        .map((s: any) => ({ subtopicTitle: s.subtopicTitle, startIndex: findMarker(unitText, s.startMarker) }))
        .filter((s: LocatedSubtopic) => s.startIndex !== -1);

      const subtopics =
        located.length > 0
          ? sliceSubtopics(unitText, located)
          : [{ subtopicTitle: unitTitle, textSlice: unitText }];

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