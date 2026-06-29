import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./_lib/verify-auth.js";
import { oauthClient } from "./_lib/google-oauth.js";
import { getAdmin } from "./_lib/firebase-admin.js";

type Question = {
  type: "MCQ" | "CHECKBOX" | "SHORT" | "PARAGRAPH" | "TRUE_FALSE";
  title: string;
  options?: string[];
  correctAnswer?: string | string[];
  points?: number;
  required?: boolean;
};

function buildItem(q: Question, index: number) {
  const required = q.required ?? true;
  const points = q.points ?? 1;
  const base: any = { title: q.title };

  if (q.type === "MCQ" || q.type === "CHECKBOX") {
    const opts = (q.options || []).map((value) => ({ value }));
    const question: any = {
      required,
      choiceQuestion: {
        type: q.type === "MCQ" ? "RADIO" : "CHECKBOX",
        options: opts,
        shuffle: false,
      },
    };
    const correct = Array.isArray(q.correctAnswer) ? q.correctAnswer : q.correctAnswer ? [q.correctAnswer] : [];
    if (correct.length) {
      question.grading = {
        pointValue: points,
        correctAnswers: { answers: correct.map((value) => ({ value })) },
      };
    }
    return {
      createItem: {
        item: { ...base, questionItem: { question } },
        location: { index },
      },
    };
  }

  if (q.type === "TRUE_FALSE") {
    const question: any = {
      required,
      choiceQuestion: { type: "RADIO", options: [{ value: "True" }, { value: "False" }] },
    };
    if (q.correctAnswer) {
      question.grading = {
        pointValue: points,
        correctAnswers: { answers: [{ value: String(q.correctAnswer) }] },
      };
    }
    return {
      createItem: {
        item: { ...base, questionItem: { question } },
        location: { index },
      },
    };
  }

  // SHORT / PARAGRAPH
  const question: any = {
    required,
    textQuestion: { paragraph: q.type === "PARAGRAPH" },
  };
  if (q.correctAnswer && typeof q.correctAnswer === "string") {
    question.grading = {
      pointValue: points,
      correctAnswers: { answers: [{ value: q.correctAnswer }] },
    };
  }
  return {
    createItem: {
      item: { ...base, questionItem: { question } },
      location: { index },
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { uid } = await verifyAuth(req);
    const { title, questions } = req.body as { title: string; questions: Question[] };
    if (!title || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: "Missing title or questions" });
    }

    const { db } = getAdmin();
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() || {};
    const refreshToken = userData.googleRefreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: "Google account not connected. Visit /connect-google." });
    }

    // Free-tier limits: 5 forms/day, 80 forms/month total — unless unlocked with passcode.
    const DAILY_LIMIT = 5;
    const TOTAL_LIMIT = 80;
    if (!userData.unlocked) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const totalSnap = await db.collection("forms").where("uid", "==", uid).count().get();
      const totalUsed = totalSnap.data().count;
      if (totalUsed >= TOTAL_LIMIT) {
        return res.status(403).json({
          error: `You've reached the free limit of ${TOTAL_LIMIT} forms. Enter the unlock passcode to continue.`,
          code: "LIMIT_REACHED",
          scope: "total",
          limit: TOTAL_LIMIT,
          used: totalUsed,
        });
      }
      const daySnap = await db
        .collection("forms")
        .where("uid", "==", uid)
        .where("createdAt", ">=", startOfDay)
        .count()
        .get();
      const dayUsed = daySnap.data().count;
      if (dayUsed >= DAILY_LIMIT) {
        return res.status(429).json({
          error: `Daily limit reached (${DAILY_LIMIT} forms/day). Try again tomorrow or enter the unlock passcode.`,
          code: "DAILY_LIMIT_REACHED",
          scope: "daily",
          limit: DAILY_LIMIT,
          used: dayUsed,
          totalUsed,
          totalLimit: TOTAL_LIMIT,
        });
      }
    }

    const client = oauthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const forms = google.forms({ version: "v1", auth: client });

    // 1. Create form (only title allowed in create)
    const created = await forms.forms.create({ requestBody: { info: { title } } });
    const formId = created.data.formId!;

    // 2. Convert to quiz + add questions
    const hasGrading = questions.some((q) => q.correctAnswer);
    const requests: any[] = [];
    if (hasGrading) {
      requests.push({
        updateSettings: {
          settings: { quizSettings: { isQuiz: true } },
          updateMask: "quizSettings.isQuiz",
        },
      });
    }
    questions.forEach((q, i) => requests.push(buildItem(q, i)));

    await forms.forms.batchUpdate({ formId, requestBody: { requests } });

    const full = await forms.forms.get({ formId });
    const responderUri = full.data.responderUri!;
    const editUri = `https://docs.google.com/forms/d/${formId}/edit`;

    await db.collection("forms").add({
      uid,
      title,
      googleFormId: formId,
      responderUri,
      editUri,
      questionCount: questions.length,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ formId, responderUri, editUri });
  } catch (err: any) {
    console.error("create-form error", err);
    return res.status(500).json({ error: err.message || "Form creation failed" });
  }
}
