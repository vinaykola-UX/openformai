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

    // ── Build question map ────────────────────────────────────────────────
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

    // ── Process each response ─────────────────────────────────────────────
    const studentResults = allResponses.map((r: any) => {
      const answers = r.answers || {};

      // Extract identity fields (Name, Roll No, Branch)
      let name = "";
      let rollNo = "";
      let branch = "";

      // Try to find name/roll/branch from answers by question title
      Object.entries(questionMap).forEach(([qId, qInfo]) => {
        const ans = answers[qId]?.textAnswers?.answers?.[0]?.value || "";
        const title = qInfo.title.toLowerCase();
        if (title.includes("name") && !title.includes("roll")) name = ans;
        if (title.includes("roll")) rollNo = ans;
        if (title.includes("branch") || title.includes("dept") || title.includes("department")) branch = ans;
      });

      // Calculate score
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

    // ── Sort by roll number then name ─────────────────────────────────────
    studentResults.sort((a, b) => {
      const rollA = a.rollNo.replace(/\D/g, "");
      const rollB = b.rollNo.replace(/\D/g, "");
      if (rollA && rollB) return rollA.localeCompare(rollB, undefined, { numeric: true });
      return a.name.localeCompare(b.name);
    });

    // ── Group by branch ───────────────────────────────────────────────────
    const byBranch: Record<string, typeof studentResults> = {};
    studentResults.forEach(s => {
      const key = s.branch || "Unknown";
      if (!byBranch[key]) byBranch[key] = [];
      byBranch[key].push(s);
    });

    // ── Overall stats ─────────────────────────────────────────────────────
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