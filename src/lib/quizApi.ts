import { auth, waitForAuthReady } from "./firebase";

async function headers(): Promise<Record<string, string>> {
  let user = auth.currentUser;
  if (!user) user = await waitForAuthReady();
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken(false);
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function call<T>(endpoint: "/api/quiz" | "/api/quiz-automation", action: string, body: any): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ action, ...body }),
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : { error: (await res.text()).slice(0, 400) };
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as any;
    err.code = data.code;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export type QuizAnalysis = {
  subject: string;
  mainTopic: string;
  subtopics: string[];
  concepts?: string[];
  definitions?: string[];
  keywords?: string[];
  formulas?: string[];
  learningObjectives?: string[];
  difficulty?: "Easy" | "Medium" | "Hard";
  wordCount: number;
  readingMinutes: number;
};

export type QuizQuestion = {
  type: "MCQ" | "CHECKBOX" | "TRUE_FALSE" | "SHORT" | "PARAGRAPH";
  title: string;
  options?: string[];
  correctAnswers?: string[];
  explanation?: string;
  points?: number;
  difficulty?: "Easy" | "Medium" | "Hard";
  required?: boolean;
};

export const analyzeMaterial = (text: string) =>
  call<QuizAnalysis>("/api/quiz", "analyze", { text });

export const generateQuiz = (opts: {
  text: string;
  count: number;
  difficulty: string;
  questionType: string;
}) => call<{ questions: QuizQuestion[] }>("/api/quiz", "generate", opts);

export const createQuizForm = (opts: {
  title: string;
  questions: QuizQuestion[];
  mode: "quiz" | "form";
  expiresAt?: string | null;
}) => call<{ formId: string; responderUri: string; editUri: string }>("/api/quiz", "create-form", opts);

// ── Automation pipeline ──────────────────────────────────────────────────

export type PlannedSubtopic = { subtopicTitle: string; textSlice: string };
export type PlannedUnit = { unitTitle: string; subtopics: PlannedSubtopic[] };

export const planUnits = (opts: { text: string; mode: "whole-subject" | "single-unit" }) =>
  call<{ units?: PlannedUnit[]; subtopics?: PlannedSubtopic[]; degraded: boolean }>(
    "/api/quiz-automation",
    "plan-units",
    opts
  );

export type DraftSubtopicRef = { subtopicId: string; subtopicTitle: string };
export type DraftUnitRef = { unitId: string; unitTitle: string; subtopics: DraftSubtopicRef[] };

export const createDraft = (opts: {
  subjectTitle: string;
  sourceMode: "multi-file" | "single-file";
  units: PlannedUnit[];
}) => call<{ draftId: string; units: DraftUnitRef[] }>("/api/quiz-automation", "create-draft", opts);

export const draftGenerate = (opts: {
  draftId: string;
  unitId: string;
  subtopicId: string;
  count?: number;
  difficulty?: string;
  questionType?: string;
}) =>
  call<{ questions: QuizQuestion[]; fromCache: boolean; usedModel: string; status: "done" }>(
    "/api/quiz-automation",
    "draft-generate",
    opts
  );