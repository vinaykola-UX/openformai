import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./_lib/verify-auth.js";
import { oauthClient } from "./_lib/google-oauth.js";
import { getAdmin } from "./_lib/firebase-admin.js";

// ─────────────────────────────────────────────────────────────────────────
// Shared types (used by "create-form")
// ─────────────────────────────────────────────────────────────────────────

type QuestionType =
  | "SHORT"
  | "PARAGRAPH"
  | "MCQ"
  | "CHECKBOX"
  | "DROPDOWN"
  | "LINEAR_SCALE"
  | "DATE"
  | "TIME"
  | "GRID_MULTIPLE_CHOICE"
  | "GRID_CHECKBOX"
  | "FILE_UPLOAD";

type Question = {
  type: QuestionType;
  title: string;
  description?: string;
  options?: string[];
  rows?: string[];
  required?: boolean;
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  includeYear?: boolean;
  includeTime?: boolean;
  is24Hour?: boolean;
};

function buildItem(q: Question, index: number) {
  const required = q.required ?? true;
  const base: any = { title: q.title };
  if (q.description) base.description = q.description;

  switch (q.type) {
    case "MCQ":
      return {
        createItem: {
          item: {
            ...base,
            questionItem: {
              question: {
                required,
                choiceQuestion: {
                  type: "RADIO",
                  options: (q.options || []).map((value) => ({ value })),
                  shuffle: false,
                },
              },
            },
          },
          location: { index },
        },
      };

    case "CHECKBOX":
      return {
        createItem: {
          item: {
            ...base,
            questionItem: {
              question: {
                required,
                choiceQuestion: {
                  type: "CHECKBOX",
                  options: (q.options || []).map((value) => ({ value })),
                  shuffle: false,
                },
              },
            },
          },
          location: { index },
        },
      };

    case "DROPDOWN":
      return {
        createItem: {
          item: {
            ...base,
            questionItem: {
              question: {
                required,
                choiceQuestion: {
                  type: "DROP_DOWN",
                  options: (q.options || []).map((value) => ({ value })),
                },
              },
            },
          },
          location: { index },
        },
      };

    case "LINEAR_SCALE":
      return {
        createItem: {
          item: {
            ...base,
            questionItem: {
              question: {
                required,
                scaleQuestion: {
                  low: q.scaleMin ?? 1,
                  high: q.scaleMax ?? 5,
                  lowLabel: q.scaleMinLabel || undefined,
                  highLabel: q.scaleMaxLabel || undefined,
                },
              },
            },
          },
          location: { index },
        },
      };

    case "DATE":
      return {
        createItem: {
          item: {
            ...base,
            questionItem: {
              question: {
                required,
                dateQuestion: {
                  includeYear: q.includeYear ?? true,
                  includeTime: q.includeTime ?? false,
                },
              },
            },
          },
          location: { index },
        },
      };

    case "TIME":
      return {
        createItem: {
          item: {
            ...base,
            questionItem: {
              question: {
                required,
                timeQuestion: { duration: false },
              },
            },
          },
          location: { index },
        },
      };

    case "GRID_MULTIPLE_CHOICE":
      return {
        createItem: {
          item: {
            ...base,
            questionGroupItem: {
              questions: (q.rows || []).map((row) => ({
                rowQuestion: { title: row },
                required,
              })),
              grid: {
                columns: {
                  type: "RADIO",
                  options: (q.options || []).map((value) => ({ value })),
                },
              },
            },
          },
          location: { index },
        },
      };

    case "GRID_CHECKBOX":
      return {
        createItem: {
          item: {
            ...base,
            questionGroupItem: {
              questions: (q.rows || []).map((row) => ({
                rowQuestion: { title: row },
                required,
              })),
              grid: {
                columns: {
                  type: "CHECKBOX",
                  options: (q.options || []).map((value) => ({ value })),
                },
              },
            },
          },
          location: { index },
        },
      };

    case "FILE_UPLOAD":
      // Google Forms API cannot create file-upload questions (platform limitation).
      // Fallback: short-answer field asking for a link, with a clear note.
      return {
        createItem: {
          item: {
            title: q.title,
            description:
              (q.description ? q.description + " " : "") +
              "(File upload isn't supported via API — please paste a shareable link, or edit this question in Google Forms to enable native file upload.)",
            questionItem: {
              question: {
                required,
                textQuestion: { paragraph: false },
              },
            },
          },
          location: { index },
        },
      };

    case "PARAGRAPH":
      return {
        createItem: {
          item: {
            ...base,
            questionItem: {
              question: { required, textQuestion: { paragraph: true } },
            },
          },
          location: { index },
        },
      };

    case "SHORT":
    default:
      return {
        createItem: {
          item: {
            ...base,
            questionItem: {
              question: { required, textQuestion: { paragraph: false } },
            },
          },
          location: { index },
        },
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// action: "create-form"
// ─────────────────────────────────────────────────────────────────────────

async function handleCreateForm(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { uid } = await verifyAuth(req);
    const { title, questions, expiresAt } = req.body as { title: string; questions: Question[]; expiresAt?: string | null };
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

    // 2. Add questions — no quiz mode, no grading, ever.
    const requests: any[] = questions.map((q, i) => buildItem(q, i));

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
      isQuiz: false,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ formId, responderUri, editUri });
  } catch (err: any) {
    console.error("create-form error", err);
    return res.status(500).json({ error: err.message || "Form creation failed" });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// action: "delete-form"
// ─────────────────────────────────────────────────────────────────────────

async function handleDeleteForm(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid } = await verifyAuth(req);
    const { formId, googleFormId } = req.body as {
      formId: string;
      googleFormId?: string;
    };

    if (!formId)
      return res.status(400).json({ error: "Missing formId" });

    const { db } = getAdmin();

    const formSnap = await db.collection("forms").doc(formId).get();
    if (!formSnap.exists) {
      return res.status(404).json({ error: "Form not found" });
    }
    if (formSnap.data()?.uid !== uid) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (googleFormId) {
      try {
        const userSnap = await db.collection("users").doc(uid).get();
        const refreshToken = userSnap.data()?.googleRefreshToken;
        if (refreshToken) {
          const client = oauthClient();
          client.setCredentials({ refresh_token: refreshToken });
          const drive = google.drive({ version: "v3", auth: client });
          await drive.files.delete({ fileId: googleFormId });
        }
      } catch (gErr: any) {
        console.warn("[delete-form] Google Forms delete failed:", gErr.message);
      }
    }

    await db.collection("forms").doc(formId).delete();

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("delete-form error", err);
    return res.status(500).json({ error: err.message || "Delete failed" });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// action: "preview-form" — public, no auth required
// ─────────────────────────────────────────────────────────────────────────

async function handlePreviewForm(req: VercelRequest, res: VercelResponse) {
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

    const questions = rawQuestions.map((q: any) => {
      if (!isQuiz) return q;
      const { correctAnswer, correctAnswers, explanation, ...safe } = q;
      return safe;
    });

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
// ─────────────────────────────────────────────────────────────────────────
// action: "form-analytics"
// ─────────────────────────────────────────────────────────────────────────

async function handleFormAnalytics(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid } = await verifyAuth(req);
    const { googleFormId } = req.body as { googleFormId: string };

    if (!googleFormId)
      return res.status(400).json({ error: "Missing googleFormId" });

    const { db } = getAdmin();
    const userSnap = await db.collection("users").doc(uid).get();
    const refreshToken = userSnap.data()?.googleRefreshToken;

    if (!refreshToken)
      return res.status(400).json({
        error: "Google account not connected. Visit /connect-google.",
      });

    const client = oauthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const forms = google.forms({ version: "v1", auth: client });

    const [formRes, responsesRes] = await Promise.all([
      forms.forms.get({ formId: googleFormId }),
      forms.forms.responses.list({ formId: googleFormId }),
    ]);

    const allResponses = responsesRes.data.responses || [];
    const totalResponses = allResponses.length;
    const formItems = formRes.data.items || [];

    const questionStats = formItems
      .filter((item: any) => item.questionItem?.question?.questionId)
      .map((item: any) => {
        const questionId = item.questionItem.question.questionId;
        const title = item.title || "Untitled question";
        let answerCount = 0;

        allResponses.forEach((r: any) => {
          if (r.answers?.[questionId]) {
            answerCount++;
          }
        });

        const skippedCount = totalResponses - answerCount;
        const responseRate =
          totalResponses > 0
            ? Math.round((answerCount / totalResponses) * 100)
            : 0;

        return {
          questionId,
          title,
          answerCount,
          skippedCount,
          responseRate,
        };
      });

    const mostSkipped =
      questionStats.length > 0
        ? [...questionStats].sort((a, b) => b.skippedCount - a.skippedCount)[0]
        : null;

    const avgCompletionRate =
      questionStats.length > 0
        ? Math.round(
            questionStats.reduce((sum, q) => sum + q.responseRate, 0) /
              questionStats.length
          )
        : 0;

    return res.status(200).json({
      totalResponses,
      avgCompletionRate,
      mostSkipped: mostSkipped
        ? {
            title: mostSkipped.title,
            skippedCount: mostSkipped.skippedCount,
          }
        : null,
      questionStats,
      formTitle: formRes.data.info?.title || "Untitled form",
    });
  } catch (err: any) {
    console.error("form-analytics error", err);

    if (err.message?.includes("insufficient")) {
      return res.status(403).json({
        error:
          "Insufficient permissions. Make sure your Google account is connected.",
      });
    }

    return res
      .status(500)
      .json({ error: err.message || "Analytics failed" });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// action: "form-report"
// ─────────────────────────────────────────────────────────────────────────

async function handleFormReport(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid } = await verifyAuth(req);
    const { googleFormId } = req.body as { googleFormId: string };
    if (!googleFormId)
      return res.status(400).json({ error: "Missing googleFormId" });

    const { db } = getAdmin();
    const userSnap = await db.collection("users").doc(uid).get();
    const refreshToken = userSnap.data()?.googleRefreshToken;
    if (!refreshToken)
      return res.status(400).json({ error: "Google account not connected." });

    const client = oauthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const forms = google.forms({ version: "v1", auth: client });

    const [formRes, responsesRes] = await Promise.all([
      forms.forms.get({ formId: googleFormId }),
      forms.forms.responses.list({ formId: googleFormId }),
    ]);

    const formData = formRes.data;
    const allResponses = responsesRes.data.responses || [];
    const items = formData.items || [];

    const questionMap: Record<string, {
      title: string;
      index: number;
      correctAnswers: string[];
      points: number;
      isGraded: boolean;
    }> = {};

    items.forEach((item: any, idx: number) => {
      const q = item.questionItem?.question;
      if (!q) return;
      const qId = q.questionId;
      const correctAnswers = q.grading?.correctAnswers?.answers?.map((a: any) => a.value.toLowerCase().trim()) || [];
      questionMap[qId] = {
        title: item.title || `Q${idx + 1}`,
        index: idx,
        correctAnswers,
        points: q.grading?.pointValue ?? 1,
        isGraded: correctAnswers.length > 0,
      };
    });

    const gradedQuestions = Object.values(questionMap).filter(q => q.isGraded);
    const totalPoints = gradedQuestions.reduce((sum, q) => sum + q.points, 0);

    const studentResults = allResponses.map((r: any) => {
      const answers = r.answers || {};

      let name = "";
      let rollNo = "";
      let branch = "";

      Object.entries(questionMap).forEach(([qId, qInfo]) => {
        const ans = answers[qId]?.textAnswers?.answers?.[0]?.value || "";
        const title = qInfo.title.toLowerCase();
        if (title.includes("name") && !title.includes("roll")) name = ans;
        if (title.includes("roll")) rollNo = ans;
        if (title.includes("branch") || title.includes("dept") || title.includes("department")) branch = ans;
      });

      let correct = 0;
      let wrong = 0;
      let score = 0;

      gradedQuestions.forEach((qInfo) => {
        const qId = Object.keys(questionMap).find(k => questionMap[k] === qInfo)!;
        const studentAns = answers[qId];
        if (!studentAns) { wrong++; return; }

        const textAnswers = studentAns.textAnswers?.answers?.map((a: any) =>
          a.value.toLowerCase().trim()
        ) || [];

        const isCorrect = qInfo.correctAnswers.some(ca =>
          textAnswers.includes(ca)
        );

        if (isCorrect) {
          correct++;
          score += qInfo.points;
        } else {
          wrong++;
        }
      });

      const totalQ = gradedQuestions.length;
      const percentage = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;

      return {
        responseId: r.responseId,
        submittedAt: r.lastSubmittedTime,
        name: name || "Unknown",
        rollNo: rollNo || "—",
        branch: branch || "—",
        correct,
        wrong,
        score,
        totalPoints,
        totalQuestions: totalQ,
        percentage,
      };
    });

    studentResults.sort((a, b) => {
      const rollA = a.rollNo.replace(/\D/g, "");
      const rollB = b.rollNo.replace(/\D/g, "");
      if (rollA && rollB) return rollA.localeCompare(rollB, undefined, { numeric: true });
      return a.name.localeCompare(b.name);
    });

    const byBranch: Record<string, typeof studentResults> = {};
    studentResults.forEach(s => {
      const key = s.branch || "Unknown";
      if (!byBranch[key]) byBranch[key] = [];
      byBranch[key].push(s);
    });

    const totalStudents = studentResults.length;
    const avgScore = totalStudents > 0
      ? Math.round(studentResults.reduce((s, r) => s + r.percentage, 0) / totalStudents)
      : 0;
    const highest = totalStudents > 0
      ? Math.max(...studentResults.map(r => r.percentage))
      : 0;
    const lowest = totalStudents > 0
      ? Math.min(...studentResults.map(r => r.percentage))
      : 0;
    const passed = studentResults.filter(r => r.percentage >= 50).length;

    return res.status(200).json({
      formTitle: formData.info?.title || "Quiz",
      totalStudents,
      totalQuestions: gradedQuestions.length,
      totalPoints,
      avgScore,
      highest,
      lowest,
      passed,
      failed: totalStudents - passed,
      students: studentResults,
      byBranch,
      branches: Object.keys(byBranch).sort(),
    });
  } catch (err: any) {
    console.error("form-report error", err);
    return res.status(500).json({ error: err.message || "Report failed" });
  }
}
// ─────────────────────────────────────────────────────────────────────────
// Router — dispatches on ?action=... set by vercel.json
// ─────────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined;
  switch (action) {
    case "create-form":
      return handleCreateForm(req, res);
    case "delete-form":
      return handleDeleteForm(req, res);
    case "preview-form":
      return handlePreviewForm(req, res);
    case "form-analytics":
      return handleFormAnalytics(req, res);
    case "form-report":
      return handleFormReport(req, res);
    default:
      return res.status(400).json({ error: `Unknown or missing action: ${action}` });
  }
}