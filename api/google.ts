import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./_lib/verify-auth.js";
import { oauthClient, FORMS_SCOPE } from "./_lib/google-oauth.js";
import { getAdmin } from "./_lib/firebase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action } = req.query;

  // Handle /api/google/auth-url
  if (action === "auth-url") {
    try {
      const { uid } = await verifyAuth(req);
      const client = oauthClient();
      const url = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [FORMS_SCOPE, "https://www.googleapis.com/auth/drive.file"],
        state: uid,
      });
      return res.status(200).json({ url });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Handle /api/google/callback
  if (action === "callback") {
    try {
      const { uid } = await verifyAuth(req);
      const code = (req.query.code as string) || "";
      if (!code) return res.status(400).json({ error: "Missing code" });

      const client = oauthClient();
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) {
        return res.status(400).json({
          error: "No refresh token returned. Revoke access at myaccount.google.com and try again.",
        });
      }

      const { db } = getAdmin();
      await db.collection("users").doc(uid).set(
        {
          googleRefreshToken: tokens.refresh_token,
          googleConnectedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("callback error", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: "Invalid Google API endpoint" });
}
