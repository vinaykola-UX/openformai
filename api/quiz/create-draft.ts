import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "../_lib/verify-auth.js";
import { getAdmin } from "../_lib/firebase-admin.js";

type PlannedSubtopic = { subtopicTitle: string; textSlice: string };
type PlannedUnit = { unitTitle: string; subtopics: PlannedSubtopic[] };

const MAX_UNITS = 20;
const MAX_SUBTOPICS_PER_UNIT = 10;
const MAX_SLICE_CHARS = 40000; // matches quiz generation's own text clip

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid } = await verifyAuth(req);
    const { subjectTitle, sourceMode, units } = (req.body || {}) as {
      subjectTitle?: string;
      sourceMode?: "multi-file" | "single-file";
      units?: PlannedUnit[];
    };

    if (!subjectTitle || typeof subjectTitle !== "string") {
      return res.status(400).json({ error: "Missing subjectTitle" });
    }
    if (!Array.isArray(units) || units.length === 0) {
      return res.status(400).json({ error: "Missing units" });
    }

    const clippedUnits = units
      .slice(0, MAX_UNITS)
      .map((u) => ({
        unitTitle: u.unitTitle || "Untitled unit",
        subtopics: (u.subtopics || [])
          .slice(0, MAX_SUBTOPICS_PER_UNIT)
          .map((s) => ({
            subtopicTitle: s.subtopicTitle || "Untitled subtopic",
            textSlice: (s.textSlice || "").slice(0, MAX_SLICE_CHARS),
          }))
          .filter((s) => s.textSlice.trim().length > 0),
      }))
      .filter((u) => u.subtopics.length > 0);

    if (clippedUnits.length === 0) {
      return res.status(400).json({ error: "No valid unit/subtopic content to save." });
    }

    // Firestore batch writes cap at 500 ops. Worst case here:
    // 1 (draft) + 20 (units) + 200 (subtopics) = 221 — safely under the limit.
    const { db } = getAdmin();
    const draftRef = db.collection("quiz_drafts").doc();
    const batch = db.batch();

    const subtopicCount = clippedUnits.reduce((sum, u) => sum + u.subtopics.length, 0);

    batch.set(draftRef, {
      uid,
      subjectTitle,
      sourceMode: sourceMode === "multi-file" ? "multi-file" : "single-file",
      status: "generating", // generating | ready | error
      unitCount: clippedUnits.length,
      subtopicCount,
      doneCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const responseUnits: any[] = [];

    clippedUnits.forEach((u, ui) => {
      const unitRef = draftRef.collection("units").doc();
      batch.set(unitRef, { unitTitle: u.unitTitle, order: ui, subtopicCount: u.subtopics.length });

      const responseSubtopics: any[] = [];
      u.subtopics.forEach((s, si) => {
        const subtopicRef = unitRef.collection("subtopics").doc();
        batch.set(subtopicRef, {
          subtopicTitle: s.subtopicTitle,
          order: si,
          textSlice: s.textSlice,
          questions: [],
          status: "pending", // pending | generating | done | error
          error: null,
        });
        responseSubtopics.push({ subtopicId: subtopicRef.id, subtopicTitle: s.subtopicTitle });
      });

      responseUnits.push({ unitId: unitRef.id, unitTitle: u.unitTitle, subtopics: responseSubtopics });
    });

    await batch.commit();

    return res.status(200).json({ draftId: draftRef.id, units: responseUnits });
  } catch (err: any) {
    console.error("[quiz/create-draft] error", err);
    return res.status(500).json({ error: err.message || "Failed to create draft" });
  }
}