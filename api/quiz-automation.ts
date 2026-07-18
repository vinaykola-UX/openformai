import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./_lib/verify-auth.js";
import { getAdmin } from "./_lib/firebase-admin.js";
import { geminiWithFallback, isQuotaError } from "./_lib/gemini-keys.js";
import {
  CACHE_TTL_MS,
  makeCacheKey,
  buildQuestionsPrompt,
  runGeminiQuestions,
  runGroqQuestions,
} from "./_lib/quiz-shared.js";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

// ── action: "plan-units" ─────────────────────────────────────────────────

const MAX_PLAN_CHARS = 60000;
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
          startMarker: { type: Type.STRING, description: "6-12 words copied EXACTLY (verbatim, same casing/punctuation) from the source text marking where this unit begins." },
          subtopics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subtopicTitle: { type: Type.STRING },
                startMarker: { type: Type.STRING, description: "6-12 words copied EXACTLY from the source text marking where this subtopic begins, must appear inside its parent unit's span." },
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
          startMarker: { type: Type.STRING, description: "6-12 words copied EXACTLY (verbatim) from the source text marking where this subtopic begins." },
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
    return { unitTitle: item.unitTitle, textSlice: text.slice(item.startIndex, end).trim(), rawSubtopics: item.rawSubtopics };
  });
}

async function handlePlanUnits(req: VercelRequest, res: VercelResponse) {
  await verifyAuth(req);
  const { text, mode } = (req.body || {}) as { text?: string; mode?: "whole-subject" | "single-unit" };
  if (!text || text.trim().length < 100) {
    return res.status(400).json({ error: "Not enough text to plan a structure from." });
  }
  const resolvedMode = mode === "single-unit" ? "single-unit" : "whole-subject";
  const clipped = text.slice(0, MAX_PLAN_CHARS);

  const schema = resolvedMode === "single-unit" ? SCHEMA_SINGLE_UNIT : SCHEMA_WHOLE_SUBJECT;
  const system = resolvedMode === "single-unit" ? SYSTEM_SINGLE_UNIT : SYSTEM_WHOLE_SUBJECT;

  const response = await geminiWithFallback((ai) =>
    ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: clipped }] }],
      config: { systemInstruction: system, responseMimeType: "application/json", responseSchema: schema as any },
    })
  );

  const parsed = JSON.parse(response.text || "{}");

  if (resolvedMode === "single-unit") {
    const rawSubtopics: any[] = (parsed.subtopics || []).slice(0, MAX_SUBTOPICS_PER_UNIT);
    const located: LocatedSubtopic[] = rawSubtopics
      .map((s: any) => ({ subtopicTitle: s.subtopicTitle, startIndex: findMarker(clipped, s.startMarker) }))
      .filter((s: LocatedSubtopic) => s.startIndex !== -1);

    if (located.length === 0) {
      return res.status(200).json({ subtopics: [{ subtopicTitle: "Full content", textSlice: clipped }], degraded: true });
    }
    const subtopics = sliceSubtopics(clipped, located);
    return res.status(200).json({ subtopics, degraded: false });
  }

  const rawUnits: any[] = (parsed.units || []).slice(0, MAX_UNITS);
  const locatedUnits: LocatedUnit[] = rawUnits
    .map((u: any) => ({ unitTitle: u.unitTitle, startIndex: findMarker(clipped, u.startMarker), rawSubtopics: u.subtopics || [] }))
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

    const subtopics = located.length > 0 ? sliceSubtopics(unitText, located) : [{ subtopicTitle: unitTitle, textSlice: unitText }];
    return { unitTitle, subtopics };
  });

  return res.status(200).json({ units, degraded: false });
}

// ── action: "create-draft" ───────────────────────────────────────────────

type PlannedSubtopic = { subtopicTitle: string; textSlice: string };
type PlannedUnit = { unitTitle: string; subtopics: PlannedSubtopic[] };

const MAX_DRAFT_UNITS = 20;
const MAX_DRAFT_SUBTOPICS_PER_UNIT = 10;
const MAX_SLICE_CHARS = 40000;

async function handleCreateDraft(req: VercelRequest, res: VercelResponse) {
  const { uid } = await verifyAuth(req);
  const { subjectTitle, sourceMode, units } = (req.body || {}) as {
    subjectTitle?: string; sourceMode?: "multi-file" | "single-file"; units?: PlannedUnit[];
  };
  if (!subjectTitle || typeof subjectTitle !== "string") {
    return res.status(400).json({ error: "Missing subjectTitle" });
  }
  if (!Array.isArray(units) || units.length === 0) {
    return res.status(400).json({ error: "Missing units" });
  }

  const clippedUnits = units
    .slice(0, MAX_DRAFT_UNITS)
    .map((u) => ({
      unitTitle: u.unitTitle || "Untitled unit",
      subtopics: (u.subtopics || [])
        .slice(0, MAX_DRAFT_SUBTOPICS_PER_UNIT)
        .map((s) => ({ subtopicTitle: s.subtopicTitle || "Untitled subtopic", textSlice: (s.textSlice || "").slice(0, MAX_SLICE_CHARS) }))
        .filter((s) => s.textSlice.trim().length > 0),
    }))
    .filter((u) => u.subtopics.length > 0);

  if (clippedUnits.length === 0) {
    return res.status(400).json({ error: "No valid unit/subtopic content to save." });
  }

  const { db } = getAdmin();
  const draftRef = db.collection("quiz_drafts").doc();
  const batch = db.batch();
  const subtopicCount = clippedUnits.reduce((sum, u) => sum + u.subtopics.length, 0);

  batch.set(draftRef, {
    uid, subjectTitle,
    sourceMode: sourceMode === "multi-file" ? "multi-file" : "single-file",
    status: "generating", unitCount: clippedUnits.length, subtopicCount, doneCount: 0,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });

  const responseUnits: any[] = [];
  clippedUnits.forEach((u, ui) => {
    const unitRef = draftRef.collection("units").doc();
    batch.set(unitRef, { unitTitle: u.unitTitle, order: ui, subtopicCount: u.subtopics.length });
    const responseSubtopics: any[] = [];
    u.subtopics.forEach((s, si) => {
      const subtopicRef = unitRef.collection("subtopics").doc();
      batch.set(subtopicRef, {
        subtopicTitle: s.subtopicTitle, order: si, textSlice: s.textSlice,
        questions: [], status: "pending", error: null,
      });
      responseSubtopics.push({ subtopicId: subtopicRef.id, subtopicTitle: s.subtopicTitle });
    });
    responseUnits.push({ unitId: unitRef.id, unitTitle: u.unitTitle, subtopics: responseSubtopics });
  });

  await batch.commit();
  return res.status(200).json({ draftId: draftRef.id, units: responseUnits });
}

// ── action: "draft-generate" ─────────────────────────────────────────────

async function handleDraftGenerate(req: VercelRequest, res: VercelResponse) {
  const { uid } = await verifyAuth(req);
  const { draftId, unitId, subtopicId, count = 5, difficulty = "Mixed", questionType = "Mixed" } = (req.body || {}) as {
    draftId?: string; unitId?: string; subtopicId?: string; count?: number; difficulty?: string; questionType?: string;
  };
  if (!draftId || !unitId || !subtopicId) {
    return res.status(400).json({ error: "Missing draftId, unitId or subtopicId" });
  }

  const { db } = getAdmin();
  const draftRef = db.collection("quiz_drafts").doc(draftId);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) return res.status(404).json({ error: "Draft not found" });
  if (draftSnap.data()?.uid !== uid) return res.status(403).json({ error: "Not authorized" });

  const subtopicRef = draftRef.collection("units").doc(unitId).collection("subtopics").doc(subtopicId);
  const subtopicSnap = await subtopicRef.get();
  if (!subtopicSnap.exists) return res.status(404).json({ error: "Subtopic not found" });

  const subtopicData = subtopicSnap.data()!;
  const wasAlreadyDone = subtopicData.status === "done";
  const text: string = subtopicData.textSlice || "";

  if (text.trim().length < 40) {
    await subtopicRef.set({ status: "error", error: "Not enough content in this subtopic to generate questions." }, { merge: true });
    return res.status(422).json({ error: "Not enough content in this subtopic." });
  }

  await subtopicRef.set({ status: "generating" }, { merge: true });

  const n = Math.max(1, Math.min(30, Number(count) || 5));
  const cacheKey = makeCacheKey(text, n, difficulty, questionType);
  const cacheRef = db.collection("quiz_cache").doc(cacheKey);
  const cacheSnap = await cacheRef.get();

  let questions: any[] | null = null;
  let usedModel = "";
  let fromCache = false;

  if (cacheSnap.exists) {
    const cached = cacheSnap.data()!;
    const age = Date.now() - (cached.createdAt?.toMillis?.() ?? 0);
    if (age < CACHE_TTL_MS) {
      questions = cached.questions;
      fromCache = true;
    } else {
      await cacheRef.delete();
    }
  }

  if (!questions) {
    const prompt = buildQuestionsPrompt(text, n, difficulty, questionType, subtopicData.subtopicTitle || "");
    const groqKey = process.env.GROQ_API_KEY;

    try {
      questions = await runGeminiQuestions(prompt);
      usedModel = "gemini-2.5-flash-lite";
    } catch (geminiErr: any) {
      if (!(isQuotaError(geminiErr) || geminiErr?.allKeysExhausted)) {
        console.error("[quiz-automation:draft-generate] Gemini error:", geminiErr.message);
      }
    }

    if (!questions && groqKey) {
      try {
        questions = await runGroqQuestions(prompt, groqKey);
        usedModel = "groq-llama-3.3-70b";
      } catch (groqErr: any) {
        console.error("[quiz-automation:draft-generate] Groq error:", groqErr.message);
      }
    }

    if (questions && questions.length > 0) {
      try {
        await cacheRef.set({ questions, cacheKey, usedModel, createdAt: FieldValue.serverTimestamp() });
      } catch (e) {
        console.warn("[quiz-automation:draft-generate] cache write failed", e);
      }
    }
  }

  if (!questions || questions.length === 0) {
    await subtopicRef.set({ status: "error", error: "AI generation failed for this subtopic." }, { merge: true });
    return res.status(429).json({ error: "AI generation failed. You can retry this subtopic." });
  }

  await subtopicRef.set({ status: "done", questions, error: null }, { merge: true });

  if (!wasAlreadyDone) {
    await db.runTransaction(async (tx) => {
      const freshDraft = await tx.get(draftRef);
      if (!freshDraft.exists) return;
      const data = freshDraft.data()!;
      const doneCount = (data.doneCount || 0) + 1;
      const isReady = doneCount >= (data.subtopicCount || 0);
      tx.update(draftRef, { doneCount, status: isReady ? "ready" : "generating", updatedAt: FieldValue.serverTimestamp() });
    });
  }

  return res.status(200).json({ questions, fromCache, usedModel, status: "done" });
}

// ── Router ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = (req.body || {}) as { action?: string };
  try {
    switch (action) {
      case "plan-units":
        return await handlePlanUnits(req, res);
      case "create-draft":
        return await handleCreateDraft(req, res);
      case "draft-generate":
        return await handleDraftGenerate(req, res);
      default:
        return res.status(400).json({ error: `Unknown or missing action: ${action}` });
    }
  } catch (err: any) {
    console.error(`[quiz-automation:${action}] error`, err);
    if (isQuotaError(err) || err?.allKeysExhausted) {
      return res.status(429).json({ error: "AI quota exceeded. Try again in a few minutes." });
    }
    return res.status(500).json({ error: err.message || "Request failed" });
  }
}