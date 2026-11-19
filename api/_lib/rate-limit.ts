// api/_lib/rate-limit.ts
// Per-user, per-operation rate limiting backed by Firestore.
//
// Why Firestore and not in-memory?
// Vercel serverless functions are stateless cold-starts — an in-memory counter
// (like the Java one) resets on every invocation, so it never actually limits
// anything. Firestore gives a persistent, cross-invocation counter.
//
// Design:
//   Collection: ai_rate_limits/{uid}_{operation}_{windowKey}
//   Each document holds a `count` and `expiresAt`.
//   On every AI call we:
//     1. Try to increment the counter atomically via a transaction.
//     2. If the count exceeds the limit → throw 429.
//     3. Expired documents are silently recreated (they just fall off).
//
// Limits (configurable via env vars):
//   AI_RATE_HOURLY   default 30  — per user per hour (across ALL AI endpoints)
//   AI_RATE_PER_MIN  default 5   — per user per minute (burst guard)

import { getAdmin } from "./firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

export type RateLimitOperation =
  | "generate"      // /api/generate  (content parsing)
  | "quiz-analyze"  // /api/quiz analyze action
  | "quiz-generate" // /api/quiz generate action
  | "quiz-outlines" // /api/quiz suggest-outlines (uses Google Search)
  | "quiz-plan"     // /api/quiz-automation plan-units
  | "draft-gen"     // /api/quiz-automation draft-generate
  | "extract-ocr";  // /api/extract with scanned PDF / image (Gemini OCR)

const HOURLY_LIMIT = parseInt(process.env.AI_RATE_HOURLY  || "30", 10);
const MINUTE_LIMIT = parseInt(process.env.AI_RATE_PER_MIN || "5",  10);

interface Window {
  windowKey: string;
  expiresAt: Date;
  ttlMs: number;
  limit: number;
}

function getWindows(operation: RateLimitOperation): Window[] {
  const now = Date.now();

  // Hour window
  const hourKey = Math.floor(now / (60 * 60 * 1000)).toString();
  const hourExpires = new Date(Math.ceil(now / (60 * 60 * 1000)) * (60 * 60 * 1000));

  // Minute window
  const minKey = Math.floor(now / (60 * 1000)).toString();
  const minExpires = new Date(Math.ceil(now / (60 * 1000)) * (60 * 1000));

  return [
    {
      windowKey: `${operation}_h_${hourKey}`,
      expiresAt: hourExpires,
      ttlMs: 60 * 60 * 1000,
      limit: HOURLY_LIMIT,
    },
    {
      windowKey: `${operation}_m_${minKey}`,
      expiresAt: minExpires,
      ttlMs: 60 * 1000,
      limit: MINUTE_LIMIT,
    },
  ];
}

export class RateLimitError extends Error {
  public readonly status = 429;
  public readonly code = "AI_RATE_LIMITED";
  public readonly retryAfterMs: number;
  public readonly window: "minute" | "hour";

  constructor(window: "minute" | "hour", retryAfterMs: number, limit: number) {
    const windowLabel = window === "minute" ? "per minute" : "per hour";
    super(
      window === "minute"
        ? `Too many AI requests — slow down (max ${limit} ${windowLabel}). Please wait a moment.`
        : `AI request limit reached (${limit} ${windowLabel}). Please try again later.`
    );
    this.window = window;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Check and increment rate-limit counters for a uid + operation.
 * Throws RateLimitError (status 429) if any window is exceeded.
 *
 * Usage:
 *   await checkAIRateLimit(uid, "generate");
 *   // then call Gemini / Groq
 */
export async function checkAIRateLimit(
  uid: string,
  operation: RateLimitOperation
): Promise<void> {
  const { db } = getAdmin();
  const windows = getWindows(operation);

  for (const win of windows) {
    const docId = `${uid}_${win.windowKey}`;
    const ref = db.collection("ai_rate_limits").doc(docId);

    let exceeded = false;
    let newCount = 0;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        // Fresh window — first request
        tx.set(ref, {
          uid,
          operation,
          count: 1,
          limit: win.limit,
          expiresAt: win.expiresAt,
          createdAt: FieldValue.serverTimestamp(),
        });
        newCount = 1;
        exceeded = false;
        return;
      }

      const data = snap.data()!;
      const expiresAt: Date = data.expiresAt?.toDate?.() ?? new Date(0);

      if (expiresAt <= new Date()) {
        // Window expired — reset
        tx.set(ref, {
          uid,
          operation,
          count: 1,
          limit: win.limit,
          expiresAt: win.expiresAt,
          createdAt: FieldValue.serverTimestamp(),
        });
        newCount = 1;
        exceeded = false;
        return;
      }

      newCount = (data.count || 0) + 1;
      if (newCount > win.limit) {
        exceeded = true;
        return; // Don't write — just flag
      }

      tx.update(ref, { count: newCount });
    });

    if (exceeded) {
      const retryAfterMs = win.expiresAt.getTime() - Date.now();
      const windowType = win.ttlMs === 60 * 1000 ? "minute" : "hour";
      console.warn(
        `[rate-limit] uid=${uid} op=${operation} window=${windowType} limit=${win.limit} EXCEEDED`
      );
      throw new RateLimitError(windowType, retryAfterMs, win.limit);
    }

    console.log(
      `[rate-limit] uid=${uid} op=${operation} window=${win.ttlMs === 60000 ? "min" : "hr"} count=${newCount}/${win.limit}`
    );
  }
}

/**
 * Returns a 429 response object from a RateLimitError.
 * Use in catch blocks to send consistent rate-limit responses.
 */
export function rateLimitResponse(err: RateLimitError) {
  return {
    error: err.message,
    code: err.code,
    retryAfterSeconds: Math.ceil(err.retryAfterMs / 1000),
    window: err.window,
  };
}
