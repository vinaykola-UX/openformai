import { auth } from "./firebase";

async function authHeaders(json = true): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function safeJson(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return await res.json(); } catch { return {}; }
  }
  const text = await res.text();
  // Avoid leaking HTML error pages into UI
  return { error: text.slice(0, 300) || `HTTP ${res.status}` };
}

async function call<T = any>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e: any) {
    throw new Error(`Network error: ${e.message}`);
  }
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export type ParsedQuestion = {
  type: "MCQ" | "CHECKBOX" | "SHORT" | "PARAGRAPH" | "TRUE_FALSE";
  title: string;
  options?: string[];
  correctAnswer?: string | string[];
  points?: number;
  required?: boolean;
};

export async function generateQuestions(text: string): Promise<ParsedQuestion[]> {
  const data = await call<{ questions: ParsedQuestion[] }>("/api/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ text }),
  });
  return data.questions || [];
}

export async function createForm(title: string, questions: ParsedQuestion[]) {
  return call<{ formId: string; responderUri: string; editUri: string }>("/api/create-form", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ title, questions }),
  });
}

export async function getGoogleAuthUrl(): Promise<string> {
  const data = await call<{ url: string }>("/api/google/auth-url", {
    headers: await authHeaders(false),
  });
  return data.url;
}

export async function extractFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const data = await call<{ text: string }>("/api/extract", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ filename: file.name, mimeType: file.type, data: base64 }),
  });
  return data.text;
}
