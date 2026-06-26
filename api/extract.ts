import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./_lib/verify-auth.js";
import { extractContent } from "./_lib/extract-content.js";

export const config = {
  api: {
    bodyParser: { sizeLimit: "15mb" },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);
    const { filename, mimeType, data } = (req.body || {}) as {
      filename?: string;
      mimeType?: string;
      data?: string;
    };
    if (!data) return res.status(400).json({ error: "Missing file data" });

    const buf = Buffer.from(data, "base64");
    const text = await extractContent(buf, mimeType || "", filename || "");
    if (!text) return res.status(422).json({ error: "No text could be extracted from this file" });

    console.log(`[extract] ${filename} (${mimeType}) -> ${text.length} chars`);
    return res.status(200).json({ text });
  } catch (err: any) {
    console.error("[extract] error", err);
    return res.status(500).json({ error: err.message || "Extraction failed" });
  }
}
