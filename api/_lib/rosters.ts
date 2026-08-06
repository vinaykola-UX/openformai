import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "./firebase-admin.js";

export type Roster = {
  id: string;
  name: string;
  students: string[];
  isDefault: boolean;
  updatedAt?: string | null;
};

export function normalizeRoll(value: string): string {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function dedupeRollList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = normalizeRoll(String(item ?? ""));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(item).trim());
  }
  return out;
}

export async function listRosters(uid: string): Promise<Roster[]> {
  const { db } = getAdmin();
  const snap = await db.collection("rosters").where("uid", "==", uid).get();
  return snap.docs
    .map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        name: data.name || "Untitled list",
        students: dedupeRollList(data.students),
        isDefault: !!data.isDefault,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
      };
    })
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export async function saveRoster(
  uid: string,
  input: { id?: string; name: string; students: string[]; isDefault?: boolean }
): Promise<Roster> {
  const { db } = getAdmin();
  const name = (input.name || "").trim() || "Untitled list";
  const students = dedupeRollList(input.students);
  const isDefault = !!input.isDefault;

  let id = input.id;
  if (id) {
    const ref = db.collection("rosters").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Student list not found");
    if (snap.data()?.uid !== uid) throw new Error("Not authorized");
    await ref.update({ name, students, isDefault, updatedAt: FieldValue.serverTimestamp() });
  } else {
    const ref = await db.collection("rosters").add({
      uid,
      name,
      students,
      isDefault,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    id = ref.id;
  }

  if (isDefault) {
    const others = await db.collection("rosters").where("uid", "==", uid).get();
    await Promise.all(
      others.docs
        .filter((d) => d.id !== id && d.data()?.isDefault)
        .map((d) => d.ref.update({ isDefault: false }))
    );
  }

  return { id: id!, name, students, isDefault };
}

export async function deleteRoster(uid: string, id: string) {
  const { db } = getAdmin();
  const ref = db.collection("rosters").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (snap.data()?.uid !== uid) throw new Error("Not authorized");
  await ref.delete();
}

/**
 * Decide which roll numbers a newly created form should expect.
 * Priority: explicit list > named roster > account default roster.
 */
export async function resolveExpectedStudents(
  uid: string,
  explicit?: unknown,
  rosterId?: string | null
): Promise<string[]> {
  const list = dedupeRollList(explicit);
  if (list.length) return list;

  const { db } = getAdmin();
  if (rosterId) {
    const snap = await db.collection("rosters").doc(rosterId).get();
    if (snap.exists && snap.data()?.uid === uid) return dedupeRollList(snap.data()?.students);
    return [];
  }

  const def = await db
    .collection("rosters")
    .where("uid", "==", uid)
    .where("isDefault", "==", true)
    .limit(1)
    .get();
  if (def.empty) return [];
  return dedupeRollList(def.docs[0].data()?.students);
}
