import { auth } from "./firebase";

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
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
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to generate");
  const data = await res.json();
  return data.questions;
}

export async function createForm(title: string, questions: ParsedQuestion[]): Promise<{
  formId: string;
  responderUri: string;
  editUri: string;
}> {
  const res = await fetch("/api/create-form", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ title, questions }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to create form");
  return res.json();
}

export async function getGoogleAuthUrl(): Promise<string> {
  const res = await fetch("/api/google/auth-url", { headers: await authHeaders() });
  if (!res.ok) throw new Error("Failed to get auth URL");
  return (await res.json()).url;
}
