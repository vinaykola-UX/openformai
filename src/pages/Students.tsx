import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, BookUser, Loader2, Plus, Star, Trash2, Save, AlertTriangle,
} from "lucide-react";
import AppShell from "../components/AppShell";
import StudentImport from "../components/StudentImport";
import { listRosters, saveRoster, deleteRoster, type Roster } from "../lib/api";

export default function Students() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [students, setStudents] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await listRosters();
      setRosters(r.rosters || []);
    } catch (e: any) {
      setError(e.message || "Could not load your student lists.");
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setEditingId(null);
    setName("");
    setStudents([]);
    setIsDefault(rosters.length === 0);
  }

  function startEdit(r: Roster) {
    setEditingId(r.id);
    setName(r.name);
    setStudents(r.students);
    setIsDefault(r.isDefault);
  }

  async function onSave() {
    if (!students.length) {
      setError("Add at least one roll number before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await saveRoster({
        id: editingId || undefined,
        name: name.trim() || "Untitled list",
        students,
        isDefault,
      });
      setRosters(r.rosters || []);
      setEditingId(r.roster.id);
    } catch (e: any) {
      setError(e.message || "Could not save this list.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    try {
      const r = await deleteRoster(id);
      setRosters(r.rosters || []);
      if (editingId === id) startNew();
    } catch (e: any) {
      setError(e.message || "Could not delete this list.");
    }
  }

  async function makeDefault(r: Roster) {
    try {
      const res = await saveRoster({ id: r.id, name: r.name, students: r.students, isDefault: true });
      setRosters(res.rosters || []);
    } catch (e: any) {
      setError(e.message || "Could not update the default list.");
    }
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/dashboard" className="btn-ghost mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white">
            <BookUser className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Students</h1>
            <p className="text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Upload your class roll numbers once — every new form, AI quiz and graded quiz uses
              your default list automatically.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Saved lists */}
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Saved lists</h2>
              <button onClick={startNew} className="btn-secondary text-xs">
                <Plus className="h-4 w-4" /> New list
              </button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-ink/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : rosters.length === 0 ? (
              <p className="p-4 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
                No lists yet. Create one on the right and mark it as the default.
              </p>
            ) : (
              <div className="space-y-2">
                {rosters.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                      editingId === r.id
                        ? "border-brand bg-brand/5"
                        : "border-brand/10 hover:bg-brand/5 dark:border-white/10"
                    }`}
                  >
                    <button onClick={() => startEdit(r)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      <p className="text-xs text-ink/50 dark:text-[#F5EDE7]/50">
                        {r.students.length} student{r.students.length === 1 ? "" : "s"}
                        {r.isDefault ? " · default" : ""}
                      </p>
                    </button>
                    <button
                      onClick={() => makeDefault(r)}
                      title={r.isDefault ? "Default list" : "Make default"}
                      className={r.isDefault ? "text-brand" : "text-ink/30 hover:text-brand"}
                    >
                      <Star className={`h-4 w-4 ${r.isDefault ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={() => onDelete(r.id)}
                      title="Delete list"
                      className="text-ink/30 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="card p-5">
            <h2 className="mb-4 font-display text-lg font-bold">
              {editingId ? "Edit list" : "New list"}
            </h2>

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
              List name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CSE-A 2026"
              className="input mb-4"
            />

            <StudentImport students={students} onChange={setStudents} />

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              Use this list by default for every new form and quiz
            </label>

            <button onClick={onSave} disabled={saving} className="btn-primary mt-5 w-full">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> {editingId ? "Save changes" : "Create list"}
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
