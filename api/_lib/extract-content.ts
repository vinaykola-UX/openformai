// Shared content extraction used by /api/extract and /api/drive-import.
import { GoogleGenAI } from "@google/genai";

export async function extractContent(
  buf: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const name = (filename || "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();

  if (mt.includes("pdf") || name.endsWith(".pdf")) {
    // @ts-ignore - pdf-parse has no types
    const mod: any = await import("pdf-parse");
    const pdfParse = mod.default || mod;
    const parsed = await pdfParse(buf);
    return (parsed.text || "").replace(/\r\n/g, "\n").trim();
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
