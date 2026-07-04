// api/_lib/extract-content.ts
// Shared content extraction used by /api/extract and /api/drive-import.
import { extractText, getDocumentProxy } from "unpdf";
import { geminiWithFallback } from "./gemini-keys.js";

export async function extractContent(
  buf: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const name = (filename || "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();

  // ─── PDF ──────────────────────────────────────────────────────────────────
  if (mt.includes("pdf") || name.endsWith(".pdf")) {
    const uint8 = new Uint8Array(buf);
    const pdf = await getDocumentProxy(uint8);
    const { text } = await extractText(pdf, { mergePages: true });
    const raw = typeof text === "string" ? text : (text as string[]).join("\n");
    const cleaned = raw.replace(/\r\n/g, "\n").trim();

    // Searchable PDF — free, instant, no AI needed
    if (cleaned.length >= 50) return cleaned;

    // Scanned PDF — needs Gemini OCR, rotate through all keys
    console.log("[extract] scanned PDF detected, falling back to Gemini OCR");
    const response = await geminiWithFallback((ai) =>
      ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Extract every exam question and any answer key visible in this scanned PDF. " +
                  "Preserve question numbers, option letters, and the literal text. " +
                  "Return plain text only — no commentary.",
              },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: buf.toString("base64"),
                },
              },
            ],
          },
        ],
      })
    );
    return (response.text || "").trim();
  }

  // ─── DOCX ─────────────────────────────────────────────────────────────────
  if (
    mt.includes("officedocument.wordprocessingml") ||
    name.endsWith(".docx")
  ) {
    // @ts-ignore - mammoth types optional
    const mammoth: any = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result.value || "").replace(/\r\n/g, "\n").trim();
  }

  // ─── XLSX / XLS ───────────────────────────────────────────────────────────
  if (
    mt.includes("spreadsheetml.sheet") ||
    mt.includes("ms-excel") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    // @ts-ignore - xlsx types optional
    const XLSX: any = await import("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const csv: string = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`);
    }
    return parts.join("\n\n").trim();
  }

  // ─── TXT / MD / CSV ───────────────────────────────────────────────────────
  if (
    mt.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv")
  ) {
    return buf.toString("utf-8").replace(/\r\n/g, "\n").trim();
  }

  // ─── Image — rotate through all Gemini keys ───────────────────────────────
  if (
    mt.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name)
  ) {
    const imageMime = mt.startsWith("image/") ? mt : "image/png";
    const response = await geminiWithFallback((ai) =>
      ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Extract every exam question and any answer key visible in this image. " +
                  "Preserve question numbers, option letters, and the literal text. " +
                  "Return plain text only — no commentary.",
              },
              {
                inlineData: {
                  mimeType: imageMime,
                  data: buf.toString("base64"),
                },
              },
            ],
          },
        ],
      })
    );
    return (response.text || "").trim();
  }

  throw new Error(`Unsupported file type: ${mt || name}`);
}