import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { verifyAuth } from "./_lib/verify-auth.js";
import { oauthClient } from "./_lib/google-oauth.js";
import { getAdmin } from "./_lib/firebase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // ── Fetch form structure + responses in parallel ──────────────────────────
    const [formRes, responsesRes] = await Promise.all([
      forms.forms.get({ formId: googleFormId }),
      forms.forms.responses.list({ formId: googleFormId }),
    ]);

    const allResponses = responsesRes.data.responses || [];
    const totalResponses = allResponses.length;
    const formItems = formRes.data.items || [];

    // ── Calculate per-question stats ─────────────────────────────────────────
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

    // ── Most skipped question ─────────────────────────────────────────────────
    const mostSkipped =
      questionStats.length > 0
        ? [...questionStats].sort((a, b) => b.skippedCount - a.skippedCount)[0]
        : null;

    // ── Average completion rate ───────────────────────────────────────────────
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