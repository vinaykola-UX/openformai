import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "../_lib/verify-auth.js";
import { oauthClient, FORMS_SCOPE } from "../_lib/google-oauth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { uid } = await verifyAuth(req);
    const client = oauthClient();
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        FORMS_SCOPE,
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/forms.responses.readonly",
      ],
      state: uid,
    });
    return res.status(200).json({ url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}