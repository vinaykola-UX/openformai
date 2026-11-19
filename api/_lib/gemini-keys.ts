// api/_lib/gemini-keys.ts
// Persistent round-robin rotation across all Gemini API keys backed by Firestore.
// Distributes traffic evenly across cold-starts on Vercel and automatically
// puts exhausted or blocked keys on temporary cooldown while falling back to healthy keys.

import { GoogleGenAI } from "@google/genai";
import { getAdmin } from "./firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// In-memory process fallback and cooldown cache
let inMemoryCounter = 0;
const keyCooldownUntil = new Map<string, number>();

/**
 * Dynamically discover all Gemini API keys from environment variables.
 * Supports:
 *   - GEMINI_API_KEY
 *   - GEMINI_API_KEY_1, GEMINI_API_KEY_2, ... GEMINI_API_KEY_50 (any index or name)
 *   - GEMINI_API_KEYS (comma, semicolon, or newline separated list)
 */
export function getAllGeminiKeys(): string[] {
  const foundKeys: string[] = [];

  // 1. Direct process.env.GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    foundKeys.push(process.env.GEMINI_API_KEY.trim());
  }

  // 2. Any env var matching GEMINI_API_KEY_* (e.g. GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.)
  const envKeyNames = Object.keys(process.env)
    .filter((k) => /^GEMINI_API_KEY(_\w+)?$/i.test(k) && k.toUpperCase() !== "GEMINI_API_KEY")
    .sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "") || "0", 10);
      const numB = parseInt(b.replace(/\D/g, "") || "0", 10);
      return numA - numB;
    });

  for (const name of envKeyNames) {
    const val = process.env[name];
    if (val && typeof val === "string" && val.trim().length > 0) {
      foundKeys.push(val.trim());
    }
  }

  // 3. Comma/semicolon/newline-separated list in GEMINI_API_KEYS
  const multiKeys = (process.env.GEMINI_API_KEYS || "")
    .split(/[,;\n]/)
    .map((k) => k.trim())
    .filter(Boolean);

  foundKeys.push(...multiKeys);

  // Return unique keys preserving order
  return Array.from(new Set(foundKeys));
}

/**
 * Check if an error represents a Gemini quota or rate limit exhaustion.
 */
export function isQuotaError(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  const status = err?.status || err?.code || err?.error?.code;
  return (
    status === 429 ||
    status === "RESOURCE_EXHAUSTED" ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

/**
 * Key whose Google project is blocked, has no free tier, or is invalid.
 * Another key may still work, so we rotate instead of failing immediately.
 */
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

/**
 * Check if a key is currently on cooldown.
 */
function isKeyOnCooldown(key: string): boolean {
  const suffix = key.slice(-6);
  const until = keyCooldownUntil.get(suffix);
  if (!until) return false;
  if (Date.now() > until) {
    keyCooldownUntil.delete(suffix);
    return false;
  }
  return true;
}

/**
 * Mark a key as temporarily on cooldown so subsequent requests don't waste time hitting it.
 */
function markKeyCooldown(key: string, durationMs: number = 60000) {
  const suffix = key.slice(-6);
  keyCooldownUntil.set(suffix, Date.now() + durationMs);
  console.warn(`[gemini] key ...${suffix} marked on cooldown for ${Math.round(durationMs / 1000)}s`);

  // Persist cooldown to Firestore (fire-and-forget, non-blocking)
  try {
    const { db } = getAdmin();
    db.collection("system_settings")
      .doc("gemini_rotation")
      .set(
        {
          [`cooldown_${suffix}`]: Date.now() + durationMs,
          lastQuotaHitAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});
  } catch {}
}

/**
 * Atomically fetch the next key index using Firestore.
 * If Firestore is unavailable or slow, falls back to a time-bucketed distributed hash
 * so that Vercel cold-starts never all pile up on Key 1.
 */
async function getNextKeyIndex(totalKeys: number): Promise<number> {
  if (totalKeys <= 1) return 0;

  try {
    const { db } = getAdmin();
    const rotRef = db.collection("system_settings").doc("gemini_rotation");

    const nextCounter = await db.runTransaction(async (tx) => {
      const snap = await tx.get(rotRef);
      const current = typeof snap.data()?.counter === "number" ? snap.data()!.counter : 0;
      const next = (current + 1) % 1000000;
      tx.set(
        rotRef,
        {
          counter: next,
          totalKeysConfigured: totalKeys,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return current;
    });

    return Math.abs(nextCounter) % totalKeys;
  } catch (err: any) {
    // Graceful fallback: time bucket + random jitter + local counter
    inMemoryCounter = (inMemoryCounter + 1) % totalKeys;
    const timeBucket = Math.floor(Date.now() / 10000); // rotates every 10s
    const jitter = Math.floor(Math.random() * totalKeys);
    const fallbackIdx = (timeBucket + jitter + inMemoryCounter) % totalKeys;
    console.warn(
      `[gemini-keys] Firestore counter fallback -> picked index ${fallbackIdx + 1}/${totalKeys}`
    );
    return fallbackIdx;
  }
}

/**
 * Executes a Gemini request with persistent round-robin key rotation and automatic
 * failover on quota exhaustion or key block.
 */
export async function geminiWithFallback(
  buildRequest: (ai: GoogleGenAI) => Promise<any>
): Promise<any> {
  const keys = getAllGeminiKeys();

  if (keys.length === 0) {
    throw new Error("No GEMINI_API_KEY configured");
  }

  // Get persistent starting index from Firestore
  const startIndex = await getNextKeyIndex(keys.length);

  // Partition keys into active vs cooldown to prefer healthy keys
  const activeIndices: number[] = [];
  const cooldownIndices: number[] = [];

  for (let i = 0; i < keys.length; i++) {
    const idx = (startIndex + i) % keys.length;
    if (isKeyOnCooldown(keys[idx])) {
      cooldownIndices.push(idx);
    } else {
      activeIndices.push(idx);
    }
  }

  // Try active keys first, then cooldown keys if all active fail
  const orderedIndices = activeIndices.length > 0
    ? [...activeIndices, ...cooldownIndices]
    : cooldownIndices;

  let lastError: any;

  for (let attempt = 0; attempt < orderedIndices.length; attempt++) {
    const keyIdx = orderedIndices[attempt];
    const key = keys[keyIdx];
    const keySuffix = key.slice(-6);

    try {
      console.log(
        `[gemini] using key ${keyIdx + 1}/${keys.length} (...${keySuffix}) (attempt ${attempt + 1}/${orderedIndices.length})`
      );
      const ai = new GoogleGenAI({ apiKey: key });
      const result = await buildRequest(ai);
      console.log(`[gemini] key ${keyIdx + 1} (...${keySuffix}) succeeded`);
      return result;
    } catch (err: any) {
      lastError = err;
      if (isQuotaError(err)) {
        console.warn(
          `[gemini] key ${keyIdx + 1} (...${keySuffix}) quota/rate limited, putting on cooldown and rotating...`
        );
        markKeyCooldown(key, 60000); // 60s cooldown
        continue;
      }
      if (isKeyBlockedError(err)) {
        console.warn(
          `[gemini] key ${keyIdx + 1} (...${keySuffix}) blocked (403), putting on cooldown and rotating...`
        );
        markKeyCooldown(key, 300000); // 5 min cooldown for blocked keys
        continue;
      }
      // Non-quota, non-blocked errors (schema, parse, prompt error) should throw immediately
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
