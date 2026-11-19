// api/_lib/gemini-keys.ts
// Regular round-robin rotation across all Gemini API keys.
// Automatically falls back to the next key if a key is rate limited (429)
// or blocked (403 / free tier unavailable / invalid key).

import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

let currentKeyIndex = 0;

export function getAllGeminiKeys(): string[] {
  const directKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GEMINI_API_KEY_9,
    process.env.GEMINI_API_KEY_10,
  ].filter(Boolean) as string[];

  const multiKeys = (process.env.GEMINI_API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const combined = Array.from(new Set([...directKeys, ...multiKeys]));
  return combined;
}

export function isQuotaError(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  const status = err?.status || err?.code || err?.error?.code;
  return (
    status === 429 ||
    status === "RESOURCE_EXHAUSTED" ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit")
  );
}

// Key whose Google project is blocked, has no free tier, or is invalid.
// Another key may still work, so we rotate instead of failing immediately.
export function isKeyBlockedError(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  const status = err?.status || err?.code || err?.error?.code;
  return (
    status === 403 ||
    status === "PERMISSION_DENIED" ||
    msg.includes("403") ||
    msg.includes("permission_denied") ||
    msg.includes("free tier is not available") ||
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid")
  );
}

export async function geminiWithFallback(
  buildRequest: (ai: GoogleGenAI) => Promise<any>
): Promise<any> {
  const keys = getAllGeminiKeys();

  if (keys.length === 0) {
    throw new Error("No GEMINI_API_KEY configured");
  }

  // Regular round-robin: pick next key for each request
  const startIndex = currentKeyIndex % keys.length;
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;

  let lastError: any;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIdx = (startIndex + attempt) % keys.length;
    const key = keys[keyIdx];

    try {
      console.log(`[gemini] trying key ${keyIdx + 1}/${keys.length} (attempt ${attempt + 1})...`);
      const ai = new GoogleGenAI({ apiKey: key });
      const result = await buildRequest(ai);
      console.log(`[gemini] key ${keyIdx + 1} succeeded`);
      return result;
    } catch (err: any) {
      lastError = err;
      if (isQuotaError(err)) {
        console.warn(`[gemini] key ${keyIdx + 1} quota/rate limited, rotating to next key...`);
        continue;
      }
      if (isKeyBlockedError(err)) {
        console.warn(`[gemini] key ${keyIdx + 1} blocked (403), rotating to next key...`);
        continue;
      }
      throw err;
    }
  }

  console.error("[gemini] all keys exhausted or failed", lastError);
  const blocked = isKeyBlockedError(lastError);
  const exhaustedErr = new Error(
    blocked
      ? "All Gemini API keys are blocked (free tier unavailable). Please add a valid key."
      : "All Gemini keys quota exhausted. Please try again shortly."
  ) as any;
  exhaustedErr.allKeysExhausted = true;
  exhaustedErr.isQuota = true;
  exhaustedErr.originalError = lastError;
  throw exhaustedErr;
}