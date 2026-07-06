import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { verifyAuth } from "./_lib/verify-auth.js";
import { oauthClient } from "./_lib/google-oauth.js";
import { getAdmin } from "./_lib/firebase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // ── Verify this form belongs to this user ─────────────────────────────
    const formSnap = await db.collection("forms").doc(formId).get();
    if (!formSnap.exists) {
      return res.status(404).json({ error: "Form not found" });
    }
    if (formSnap.data()?.uid !== uid) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // ── Try to delete from Google Forms via Drive API ─────────────────────
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
        // Google delete failed — still delete from Firestore
        // This is non-fatal — user's dashboard will be clean
        console.warn("[delete-form] Google Forms delete failed:", gErr.message);
      }
    }

    // ── Delete from Firestore ─────────────────────────────────────────────
    await db.collection("forms").doc(formId).delete();

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("delete-form error", err);
    return res.status(500).json({ error: err.message || "Delete failed" });
  }
}