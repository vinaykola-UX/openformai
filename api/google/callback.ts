import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "../_lib/verify-auth.js";
import { oauthClient } from "../_lib/google-oauth.js";
import { getAdmin } from "../_lib/firebase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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