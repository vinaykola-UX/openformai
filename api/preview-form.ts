// api/preview-form.ts
// Public endpoint — no auth required. Returns only safe preview fields.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdmin } from "./_lib/firebase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { formId } = req.query;
  if (!formId || typeof formId !== "string") {
    return res.status(400).json({ error: "Missing formId" });
  }

  try {
    const { db } = getAdmin();
    const snap = await db.collection("forms").doc(formId).get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Form not found or this link has expired." });
    }

    const data = snap.data()!;
    const isQuiz = !!(data.isQuiz ?? data.quizMode ?? false);
    const rawQuestions = Array.isArray(data.questions) ? data.questions : [];

    // For quizzes, strip answer-revealing fields from this PUBLIC, unauthenticated
    // endpoint — no matter when it's viewed, before or after the quiz is taken,
    // the answer key is never sent here.
    const questions = rawQuestions.map((q: any) => {
      if (!isQuiz) return q;
      const { correctAnswer, correctAnswers, explanation, ...safe } = q;
      return safe;
    });

    // Only expose safe preview fields — never expose uid, tokens, etc.
    return res.status(200).json({
      title: data.title || "Untitled form",
      questionCount: data.questionCount || 0,
      questions,
      isQuiz,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    });
  } catch (err: any) {
    console.error("[preview-form]", err);
    return res.status(500).json({ error: "Failed to load form preview." });
  }
}