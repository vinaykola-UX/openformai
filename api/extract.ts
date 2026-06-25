import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./_lib/verify-auth.js";

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
    const name = (filename || "").toLowerCase();
    const mt = (mimeType || "").toLowerCase();

    let text = "";

    if (mt.includes("pdf") || name.endsWith(".pdf")) {
      const mod: any = await import("pdf-parse");
      const pdfParse = mod.default || mod;
      const parsed = await pdfParse(buf);
      text = parsed.text || "";
    } else if (
      mt.includes("officedocument.wordprocessingml") ||
      name.endsWith(".docx")
    ) {
      const mammoth: any = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value || "";
    } else if (mt.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
      text = buf.toString("utf-8");
    } else {
      return res.status(400).json({ error: `Unsupported file type: ${mt || name}` });
    }

    text = text.replace(/\r\n/g, "\n").trim();
    if (!text) return res.status(422).json({ error: "No text could be extracted from this file" });

    console.log(`[extract] ${name} (${mt}) -> ${text.length} chars`);
    return res.status(200).json({ text });
  } catch (err: any) {
    console.error("[extract] error", err);
    return res.status(500).json({ error: err.message || "Extraction failed" });
  }
}
