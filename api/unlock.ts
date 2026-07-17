import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./_lib/verify-auth.js";
import { getAdmin } from "./_lib/firebase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const PASSCODE = process.env.UNLOCK_PASSCODE;
    if (!PASSCODE) {
      // Fail loudly server-side instead of falling back to a hardcoded secret.
      console.error("[unlock] UNLOCK_PASSCODE env var is not set");
      return res.status(500).json({ error: "Unlock is not configured. Contact support." });
    }

    const { uid } = await verifyAuth(req);
    const { passcode } = (req.body || {}) as { passcode?: string };
    if (!passcode || typeof passcode !== "string") {
      return res.status(400).json({ error: "Passcode required" });
    }
    if (passcode.trim() !== PASSCODE) {
      return res.status(403).json({ error: "Invalid passcode", code: "BAD_PASSCODE" });
    }
    const { db } = getAdmin();
    await db.collection("users").doc(uid).set(
      { unlocked: true, unlockedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return res.status(200).json({ ok: true, unlocked: true });
  } catch (err: any) {
    console.error("unlock error", err);
    return res.status(500).json({ error: err.message || "Unlock failed" });
  }
}