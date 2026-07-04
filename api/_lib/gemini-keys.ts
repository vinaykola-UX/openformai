// api/_lib/gemini-keys.ts
// Rotates through all Gemini API keys in order.
// If one is quota-exhausted (429), tries the next one automatically.

import { GoogleGenAI } from "@google/genai";

export function getAllGeminiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
  ].filter(Boolean) as string[];
}

export function isQuotaError(err: any): boolean {
  return (
    err?.message?.includes("429") ||
    err?.message?.includes("RESOURCE_EXHAUSTED") ||
    err?.message?.includes("quota") ||
    err?.status === 429
  );
}

export async function geminiWithFallback(
  buildRequest: (ai: GoogleGenAI) => Promise<any>
): Promise<any> {
  const keys = getAllGeminiKeys();

  if (keys.length === 0) {
    throw new Error("No GEMINI_API_KEY configured");
  }

  let lastError: any;

  for (let i = 0; i < keys.length; i++) {
    try {
      console.log(`[gemini] trying key ${i + 1}/${keys.length}...`);
      const ai = new GoogleGenAI({ apiKey: keys[i] });
      const result = await buildRequest(ai);
      console.log(`[gemini] key ${i + 1} success`);
      return result;
    } catch (err: any) {
      lastError = err;
      if (isQuotaError(err)) {
        console.warn(`[gemini] key ${i + 1} quota exhausted, trying next...`);
        continue;
      }
      throw err;
    }
  }

  console.error("[gemini] all keys exhausted");
  const exhaustedErr = new Error("All Gemini keys quota exhausted") as any;
  exhaustedErr.allKeysExhausted = true;
  exhaustedErr.isQuota = true;
  throw exhaustedErr;
}