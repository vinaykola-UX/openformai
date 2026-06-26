import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./_lib/verify-auth.js";
import { extractContent } from "./_lib/extract-content.js";

export const config = {
  api: {
    bodyParser: { sizeLimit: "2mb" },
  },
};

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap from Drive

// Google Docs / Sheets / Slides export MIME types
const GOOGLE_EXPORTS: Record<string, { mime: string; ext: string }> = {
  document: { mime: "application/pdf", ext: ".pdf" },
  spreadsheets: { mime: "text/csv", ext: ".csv" },
  presentation: { mime: "application/pdf", ext: ".pdf" },
};

function parseDriveUrl(input: string):
  | { kind: "file"; id: string }
  | { kind: "google"; id: string; type: "document" | "spreadsheets" | "presentation" }
  | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Google Docs/Sheets/Slides editor URLs
  const gDoc = trimmed.match(
    /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/
  );
  if (gDoc) {
    return { kind: "google", type: gDoc[1] as any, id: gDoc[2] };
  }

  // Standard Drive file URLs
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?(?:export=\w+&)?id=([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return { kind: "file", id: m[1] };
  }

  // Bare ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return { kind: "file", id: trimmed };
  return null;
}

async function fetchAsBuffer(url: string): Promise<{ buf: Buffer; contentType: string; filename: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Drive download failed (${res.status}). The file may be private — share it as "Anyone with the link".`);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  // If Google returns the HTML "virus scan" interstitial, fail clearly.
  if (contentType.includes("text/html")) {
    throw new Error(
      "Google Drive returned an HTML page instead of the file. Make sure the link is shared as 'Anyone with the link' and points to a single file."
    );
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) throw new Error("File exceeds 25 MB limit.");
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  const filename = m ? decodeURIComponent(m[1].replace(/"$/, "")) : "drive-file";
  return { buf: Buffer.from(ab), contentType, filename };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await verifyAuth(req);
    const { url } = (req.body || {}) as { url?: string };
    if (!url) return res.status(400).json({ error: "Missing Drive URL" });

    const parsed = parseDriveUrl(url);
    if (!parsed) return res.status(400).json({ error: "Could not detect a Google Drive file in that link." });

    let downloadUrl: string;
    let forcedExt = "";
    let forcedMime = "";

    if (parsed.kind === "google") {
      const exp = GOOGLE_EXPORTS[parsed.type];
      downloadUrl = `https://docs.google.com/${parsed.type}/d/${parsed.id}/export?format=${exp.mime === "application/pdf" ? "pdf" : "csv"}`;
      forcedExt = exp.ext;
      forcedMime = exp.mime;
    } else {
      downloadUrl = `https://drive.google.com/uc?export=download&id=${parsed.id}`;
    }

    console.log(`[drive-import] fetching ${downloadUrl}`);
    const { buf, contentType, filename } = await fetchAsBuffer(downloadUrl);
    const finalMime = forcedMime || contentType;
    const finalName = forcedExt ? `${filename}${forcedExt}` : filename;

    const text = await extractContent(buf, finalMime, finalName);
    if (!text) return res.status(422).json({ error: "No text could be extracted from the Drive file." });

    console.log(`[drive-import] ${finalName} (${finalMime}) -> ${text.length} chars`);
    return res.status(200).json({ text, filename: finalName, mimeType: finalMime });
  } catch (err: any) {
    console.error("[drive-import] error", err);
    return res.status(500).json({ error: err.message || "Drive import failed" });
  }
}
