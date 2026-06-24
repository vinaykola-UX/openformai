import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Wand2, CheckCircle2, ExternalLink } from "lucide-react";
import Navbar from "../components/Navbar";
import { generateQuestions, createForm, type ParsedQuestion } from "../lib/api";
import QuestionPreview from "../components/QuestionPreview";

const EXAMPLE = `1. What is the capital of France?
a) London
b) Paris
c) Madrid
d) Rome
Answer: b

2. The Earth is flat. (True/False)
Answer: False

3. Explain photosynthesis in your own words.`;

export default function NewForm() {
  const nav = useNavigate();
  const [title, setTitle] = useState("Untitled quiz");
  const [text, setText] = useState("");
  const [questions, setQuestions] = useState<ParsedQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ responderUri: string; editUri: string } | null>(null);

  async function generate() {
    setError("");
    setLoading(true);
    try {
      const qs = await generateQuestions(text);
      setQuestions(qs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!questions) return;
    setError("");
    setCreating(true);
    try {
      const r = await createForm(title, questions);
      setResult(r);
    } catch (err: any) {
      setError(err.message);
      if (err.message?.toLowerCase().includes("google")) {
        setTimeout(() => nav("/connect-google"), 1500);
      }
    } finally {
      setCreating(false);
    }
  }

  if (result) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
          <div className="card p-10 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold">Your form is live!</h1>
            <p className="mt-2 text-ink/70 dark:text-[#F5EDE7]/70">Share the responder link with your students.</p>
            <div className="mt-6 flex flex-col gap-3">
              <a href={result.responderUri} target="_blank" rel="noreferrer" className="btn-primary">
                <ExternalLink className="h-4 w-4" /> Open responder link
              </a>
              <a href={result.editUri} target="_blank" rel="noreferrer" className="btn-secondary">
                Edit in Google Forms
              </a>
              <Link to="/dashboard" className="btn-ghost">Back to dashboard</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/dashboard" className="btn-ghost mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="card p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold">New form</h1>
          <p className="mt-1 text-sm text-ink/60 dark:text-[#F5EDE7]/60">Paste your questions below — any format works.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="label">Form title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Questions</label>
              <textarea
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={EXAMPLE}
                className="input font-mono text-xs leading-relaxed"
              />
              <button
                type="button"
                onClick={() => setText(EXAMPLE)}
                className="mt-2 text-xs font-semibold text-brand hover:underline"
              >
                Use example
              </button>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <button onClick={generate} disabled={!text.trim() || loading} className="btn-primary">
              {loading ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" /> Parsing with AI...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" /> Generate preview
                </>
              )}
            </button>
          </div>
        </div>

        {questions && (
          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Preview · {questions.length} questions</h2>
              <button onClick={publish} disabled={creating} className="btn-primary">
                {creating ? "Creating Google Form..." : "Create Google Form"}
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <QuestionPreview key={i} q={q} index={i} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
