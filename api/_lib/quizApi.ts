export type PlannedSubtopic = { subtopicTitle: string; textSlice: string };
export type PlannedUnit = { unitTitle: string; subtopics: PlannedSubtopic[] };

export const planUnits = (opts: { text: string; mode: "whole-subject" | "single-unit" }) =>
  call<{ units?: PlannedUnit[]; subtopics?: PlannedSubtopic[]; degraded: boolean }>(
    "/api/quiz/plan-units",
    opts
  );

export type DraftSubtopicRef = { subtopicId: string; subtopicTitle: string };
export type DraftUnitRef = { unitId: string; unitTitle: string; subtopics: DraftSubtopicRef[] };

export const createDraft = (opts: {
  subjectTitle: string;
  sourceMode: "multi-file" | "single-file";
  units: PlannedUnit[];
}) => call<{ draftId: string; units: DraftUnitRef[] }>("/api/quiz/create-draft", opts);

export const draftGenerate = (opts: {
  draftId: string;
  unitId: string;
  subtopicId: string;
  count?: number;
  difficulty?: string;
  questionType?: string;
}) =>
  call<{ questions: QuizQuestion[]; fromCache: boolean; usedModel: string; status: "done" }>(
    "/api/quiz/draft-generate",
    opts
  );