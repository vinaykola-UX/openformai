import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "./firebase-admin.js";

export class GroqApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(`Groq error ${status}: ${message}`);
    this.name = "GroqApiError";
  }
}

let inMemoryCounter = 0;

export function getAllGroqKeys(): string[] {
  return Array.from(
    new Set(
      [
        process.env.GROQ_API_KEY,
        process.env.GROQ_API_KEY_2,
        process.env.GROQ_API_KEY_3,
        process.env.GROQ_API_KEY_4,
      ]
        .filter((key): key is string => typeof key === "string")
        .map((key) => key.trim())
        .filter(Boolean)
    )
  );
}

async function getNextKeyIndex(totalKeys: number): Promise<number> {
  if (totalKeys <= 1) return 0;

  try {
    const { db } = getAdmin();
    const rotationRef = db.collection("system_settings").doc("groq_rotation");
    const current = await db.runTransaction(async (tx) => {
      const snap = await tx.get(rotationRef);
      const counter = typeof snap.data()?.counter === "number" ? snap.data()!.counter : 0;
      tx.set(
        rotationRef,
        {
          counter: (counter + 1) % 1000000,
          totalKeysConfigured: totalKeys,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return counter;
    });

    return Math.abs(current) % totalKeys;
  } catch {
    inMemoryCounter = (inMemoryCounter + 1) % totalKeys;
    console.warn("[groq-keys] Firestore rotation unavailable; using process-local rotation");
    return inMemoryCounter;
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof GroqApiError) {
    return error.status === 401 || error.status === 403 || error.status === 408 ||
      error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError;
}

export async function groqWithFallback<T>(
  buildRequest: (apiKey: string) => Promise<T>
): Promise<T> {
  const keys = getAllGroqKeys();
  if (keys.length === 0) {
    throw new Error("No GROQ_API_KEY configured");
  }

  const startIndex = await getNextKeyIndex(keys.length);
  let lastError: unknown;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIndex = (startIndex + attempt) % keys.length;
    try {
      return await buildRequest(keys[keyIndex]);
    } catch (error) {
      if (!isRetryable(error)) throw error;
      lastError = error;
      const status = error instanceof GroqApiError ? error.status : "network";
      console.warn(`[groq] key ${keyIndex + 1}/${keys.length} failed (${status}); trying next key`);
    }
  }

  const lastMessage = lastError instanceof Error ? lastError.message : "unknown error";
  const exhaustedError = new Error(
    `All ${keys.length} configured Groq API keys failed. Last error: ${lastMessage}`
  ) as Error & { allKeysExhausted?: boolean; originalError?: unknown };
  exhaustedError.name = "GroqFallbackError";
  exhaustedError.allKeysExhausted = true;
  exhaustedError.originalError = lastError;
  throw exhaustedError;
}
