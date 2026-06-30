import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./_lib/verify-auth.js";
import { oauthClient } from "./_lib/google-oauth.js";
import { getAdmin } from "./_lib/firebase-admin.js";

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
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ formId, responderUri, editUri });
  } catch (err: any) {
    console.error("create-form error", err);
    return res.status(500).json({ error: err.message || "Form creation failed" });
  }
}