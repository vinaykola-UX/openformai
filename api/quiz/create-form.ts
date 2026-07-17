import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "../_lib/verify-auth.js";
import { oauthClient } from "../_lib/google-oauth.js";
import { getAdmin } from "../_lib/firebase-admin.js";

type QuizQuestion = {
  type: "MCQ" | "CHECKBOX" | "TRUE_FALSE" | "SHORT" | "PARAGRAPH";
  title: string;
  options?: string[];
  correctAnswers?: string[];
  explanation?: string;
  points?: number;
  required?: boolean;
};

function buildItem(q: QuizQuestion, index: number, isQuiz: boolean) {
  const required = q.required ?? true;
  const points = Math.max(0, Math.round(q.points ?? 1));

  const grading = isQuiz
    ? {
        pointValue: points,
        correctAnswers: {
          answers: (q.correctAnswers || []).map((value) => ({ value })),
        },
        whenRight: q.explanation ? { text: q.explanation } : undefined,
        whenWrong: q.explanation ? { text: q.explanation } : undefined,
      }
    : undefined;

  if (q.type === "SHORT" || q.type === "PARAGRAPH") {
    return {
      createItem: {
        item: {
          title: q.title,
          questionItem: {
            question: {
              required,
              textQuestion: { paragraph: q.type === "PARAGRAPH" },
              grading: isQuiz && q.correctAnswers?.length ? grading : undefined,
            },
          },
        },
        location: { index },
      },
    };
  }

  const options =
    q.type === "TRUE_FALSE" ? ["True", "False"] : q.options || [];

  return {
    createItem: {
      item: {
        title: q.title,
        questionItem: {
          question: {
            required,
            choiceQuestion: {
              type: q.type === "CHECKBOX" ? "CHECKBOX" : "RADIO",
              options: options.map((value) => ({ value })),
              shuffle: false,
            },
            grading: isQuiz ? grading : undefined,
          },
        },
      },
      location: { index },
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { uid } = await verifyAuth(req);
    const { title, questions, mode, expiresAt } = req.body as {
      title: string;
      questions: QuizQuestion[];
      mode: "quiz" | "form";
      expiresAt?: string | null;
    };
    if (!title || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: "Missing title or questions" });
    }
    const isQuiz = mode === "quiz";

    const { db } = getAdmin();
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() || {};
    const refreshToken = userData.googleRefreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: "Google account not connected. Visit /connect-google." });
    }

    const DAILY_LIMIT = 5;
    const TOTAL_LIMIT = 80;

    if (!userData.unlocked) {
      // Total limit — simple count, no index needed
      const totalSnap = await db
        .collection("forms")
        .where("uid", "==", uid)
        .count()
        .get();
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

      // Daily limit — fetch all docs and filter client-side, no composite index needed
      const allSnap = await db
        .collection("forms")
        .where("uid", "==", uid)
        .get();
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).getTime();
      const dayUsed = allSnap.docs.filter((d) => {
        const ts = d.data().createdAt?.toMillis?.();
        return typeof ts === "number" && ts >= startOfDay;
      }).length;
      if (dayUsed >= DAILY_LIMIT) {
        return res.status(429).json({
          error: `Daily limit reached (${DAILY_LIMIT} forms/day). Try again tomorrow or enter the unlock passcode.`,
          code: "DAILY_LIMIT_REACHED",
          scope: "daily",
          limit: DAILY_LIMIT,
          used: dayUsed,
        });
      }
    }

    const client = oauthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const forms = google.forms({ version: "v1", auth: client });

    const created = await forms.forms.create({ requestBody: { info: { title } } });
    const formId = created.data.formId!;

    const requests: any[] = [];
    if (isQuiz) {
      requests.push({
        updateSettings: {
          settings: { quizSettings: { isQuiz: true } },
          updateMask: "quizSettings.isQuiz",
        },
      });
    }
    questions.forEach((q, i) => requests.push(buildItem(q, i, isQuiz)));

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
      questions,
      source: "ai-quiz",
      quizMode: isQuiz,
      isQuiz,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ formId, responderUri, editUri });
  } catch (err: any) {
    console.error("quiz/create-form error", err);
    return res.status(500).json({ error: err.message || "Form creation failed" });
  }
}