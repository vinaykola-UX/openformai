import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Upload, Loader2, X, Trash2, BookUser } from "lucide-react";
import { extractFileText, listRosters, type Roster } from "../lib/api";
import { parseRollNumbers, dedupeRolls, normalizeRoll } from "../lib/rollNumbers";

type Props = {
  students: string[];
  onChange: (students: string[]) => void;
};

export default function StudentImport({ students, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [rosters, setRosters] = useState<Roster[]>([]);

  useEffect(() => {
    listRosters()
      .then((r) => setRosters(r.rosters || []))
      .catch(() => setRosters([]));
  }, []);

  const defaultRoster = rosters.find((r) => r.isDefault) || null;

  function applyRoster(id: string) {
    const roster = rosters.find((r) => r.id === id);
    if (!roster) return;
    setErr("");
    merge(roster.students);
  }

  function merge(incoming: string[]) {
    const before = students.length;
    const merged = dedupeRolls([...students, ...incoming]);
    onChange(merged);
    const added = merged.length - before;
    const dupes = incoming.length - added;
    setMsg(
      `Added ${added} roll number${added === 1 ? "" : "s"}` +
        (dupes > 0 ? ` · ${dupes} duplicate${dupes === 1 ? "" : "s"} skipped` : "")
    );
  }

  function addPasted() {
    setErr("");
    const parsed = parseRollNumbers(pasted);
    if (!parsed.length) {
      setErr("No roll numbers found in the pasted text.");
      return;
    }
    merge(parsed);
    setPasted("");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const text = await extractFileText(file);
      const parsed = parseRollNumbers(text);
      if (!parsed.length) {
        setErr(`No roll numbers found in ${file.name}.`);
      } else {
        merge(parsed);
      }
    } catch (e: any) {
      setErr(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function removeOne(roll: string) {
    onChange(students.filter((s) => normalizeRoll(s) !== normalizeRoll(roll)));
  }

  return (
    <div className="rounded-2xl border border-dashed border-brand/20 bg-cream/60 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/60 dark:text-[#F5EDE7]/60">
          <Users className="h-3.5 w-3.5" /> Import student data (optional)
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-semibold text-brand hover:underline"
        >
          {open ? "Hide" : students.length ? "Manage list" : "Add students"}
        </button>
      </div>

      <p className="mt-2 text-xs text-ink/60 dark:text-[#F5EDE7]/60">
        Paste or upload the expected Roll / Register numbers. OpenForm will show
        who hasn&apos;t responded on the analytics page.
      </p>

      {students.length === 0 && defaultRoster && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand">
          <BookUser className="h-3.5 w-3.5" />
          Default list &ldquo;{defaultRoster.name}&rdquo; ({defaultRoster.students.length}) will be
          used automatically.
        </p>
      )}

      {students.length > 0 && (
        <p className="mt-2 text-xs font-semibold text-brand">
          {students.length} student{students.length === 1 ? "" : "s"} imported
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          {rosters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                defaultValue=""
                onChange={(e) => {
                  applyRoster(e.target.value);
                  e.target.value = "";
                }}
                className="input h-9 w-auto py-0 text-xs"
              >
                <option value="">Use a saved list...</option>
                {rosters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.students.length}){r.isDefault ? " · default" : ""}
                  </option>
                ))}
              </select>
              <Link to="/students" className="text-xs font-semibold text-brand hover:underline">
                Manage saved lists
              </Link>
            </div>
          )}
          <textarea
            rows={5}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={"25221A0501\n25221A0502\n25221A0503"}
            className="input font-mono text-xs leading-relaxed"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addPasted}
              disabled={!pasted.trim()}
              className="btn-secondary"
            >
              Add pasted list
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.txt,.docx"
              className="hidden"
              onChange={onFile}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-secondary"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading file...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload XLSX / PDF / CSV
                </>
              )}
            </button>
            {students.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setMsg("");
                }}
                className="btn-ghost text-red-600"
              >
                <Trash2 className="h-4 w-4" /> Clear all
              </button>
            )}
          </div>

          {msg && (
            <p className="rounded-xl bg-peach/30 px-3 py-2 text-xs font-medium text-brand-700">
              {msg}
            </p>
          )}
          {err && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {err}
            </p>
          )}

          {students.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-xl border border-brand/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-wrap gap-1.5">
                {students.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-2 py-1 font-mono text-[11px] text-brand"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeOne(s)}
                      className="opacity-60 hover:opacity-100"
                      aria-label={`Remove ${s}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
