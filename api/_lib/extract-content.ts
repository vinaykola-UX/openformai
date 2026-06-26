// api/_lib/extract-content.ts
// Shared content extraction used by /api/extract and /api/drive-import.
import { GoogleGenAI } from "@google/genai";
import { extractText, getDocumentProxy } from "unpdf";

export async function extractContent(
  buf: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const name = (filename || "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();

  if (mt.includes("pdf") || name.endsWith(".pdf")) {
    // unpdf wraps pdfjs's serverless build — no DOMMatrix/Canvas deps,
    // safe for Vercel's Node.js runtime.
    const uint8 = new Uint8Array(buf);
    const pdf = await getDocumentProxy(uint8);
    const { text } = await extractText(pdf, { mergePages: true });
    const raw = typeof text === "string" ? text : (text as string[]).join("\n");
    return raw.replace(/\r\n/g, "\n").trim();
  }

  if (
    mt.includes("officedocument.wordprocessingml") ||
    name.endsWith(".docx")
  ) {
    // @ts-ignore - mammoth types optional
    const mammoth: any = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result.value || "").replace(/\r\n/g, "\n").trim();
  }

  if (
    mt.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv")
  ) {
    return buf.toString("utf-8").replace(/\r\n/g, "\n").trim();
  }

  if (
    mt.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name)
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const ai = new GoogleGenAI({ apiKey });
    const imageMime = mt.startsWith("image/") ? mt : "image/png";
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
            { inlineData: { mimeType: imageMime, data: buf.toString("base64") } },
          ],
        },
      ],
    });
    return (response.text || "").trim();
  }

  throw new Error(`Unsupported file type: ${mt || name}`);
}