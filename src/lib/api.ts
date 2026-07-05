import { auth, waitForAuthReady } from "./firebase";

async function authHeaders(json = true): Promise<Record<string, string>> {
  let user = auth.currentUser;
  if (!user) user = await waitForAuthReady();
  console.log("[api] Firebase user:", user);
  console.log("[api] User UID:", user?.uid);
  if (!user) throw new Error("Not authenticated. Please sign in again.");
  const token = await user.getIdToken(/* forceRefresh */ false);
  console.log("[api] Token exists:", !!token, "length:", token?.length);
  const authHeader = `Bearer ${token}`;
  console.log("[api] Authorization header:", authHeader.slice(0, 24) + "...");
  const h: Record<string, string> = { Authorization: authHeader };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function safeJson(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }
  const text = await res.text();
  return { error: text.slice(0, 500) || `HTTP ${res.status}` };
}

async function call<T = any>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e: any) {
    throw new Error(`Network error: ${e.message}`);
  }
  const data = await safeJson(res);
  if (!res.ok) {
    console.error(`[api] ${path} failed`, res.status, data);
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      code?: string;
      status?: number;
      data?: any;
    };
    err.code = data.code;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export async function unlockAccount(passcode: string) {
  return call<{ ok: true; unlocked: true }>("/api/unlock", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ passcode }),
  });
}

export type ParsedQuestion = {
  type:
    | "SHORT"
    | "PARAGRAPH"
    | "MCQ"
    | "CHECKBOX"
    | "DROPDOWN"
    | "LINEAR_SCALE"
    | "DATE"
    | "TIME"
    | "GRID_MULTIPLE_CHOICE"
    | "GRID_CHECKBOX"
    | "FILE_UPLOAD";
  title: string;
  description?: string;
  options?: string[];
  rows?: string[];
  required?: boolean;
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  includeYear?: boolean;
  includeTime?: boolean;
  suggestedTitle?: string;
  clarityNote?: string;
  estimatedSeconds?: number;
};

export type GenerateMeta = {
  estimatedMinutes: number;
  warnings: { index: number; type: string; message: string }[];
};

export async function generateQuestions(
  text: string,
  sourceType: string = "text"
): Promise<{ questions: ParsedQuestion[]; meta: GenerateMeta }> {
  const data = await call<{ questions: ParsedQuestion[]; meta?: GenerateMeta }>("/api/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ text, sourceType }),
  });
  return {
    questions: data.questions || [],
    meta: data.meta || { estimatedMinutes: 0, warnings: [] },
  };
}

export async function createForm(
  title: string,
  questions: ParsedQuestion[],
  expiresAt?: string | null
) {
  return call<{ formId: string; responderUri: string; editUri: string }>("/api/create-form", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ title, questions, expiresAt: expiresAt ?? null }),
  });
}

export async function deleteForm(formId: string, googleFormId?: string) {
  return call<{ ok: true }>("/api/delete-form", {
    method: "DELETE",
    headers: await authHeaders(),
    body: JSON.stringify({ formId, googleFormId }),
  });
}

export async function getGoogleAuthUrl(): Promise<string> {
  const data = await call<{ url: string }>("/api/google/auth-url", {
    headers: await authHeaders(false),
  });
  return data.url;
}

export async function exchangeGoogleCode(code: string) {
  return call<{ ok: true }>(`/api/google/callback?code=${encodeURIComponent(code)}`, {
    headers: await authHeaders(false),
  });
}

export async function extractFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  const base64 = btoa(binary);
  const data = await call<{ text: string }>("/api/extract", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ filename: file.name, mimeType: file.type, data: base64 }),
  });
  return data.text;
}

export async function extractDriveUrl(url: string): Promise<string> {
  const data = await call<{ text: string }>("/api/drive-import", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ url }),
  });
  return data.text;
}