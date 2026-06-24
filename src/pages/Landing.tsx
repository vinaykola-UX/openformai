import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Zap, Shield, FileCheck2, Brain, Share2 } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-warm-gradient opacity-60 dark:opacity-20" />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <span className="chip mb-6">
                <Sparkles className="h-3 w-3" /> AI-powered · Free during beta
              </span>
              <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Turn pasted exam questions into{" "}
                <span className="bg-brand-gradient bg-clip-text text-transparent">real Google Forms</span> in seconds.
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base text-ink/70 dark:text-[#F5EDE7]/70 sm:text-lg">
                OpenForm uses AI to parse your questions, detect answer types, and build a ready-to-share Google Form on your account — no copy-paste, no setup.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/signup" className="btn-primary">
                  Get started free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/login" className="btn-secondary">I already have an account</Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Brain, title: "Smart parsing", desc: "Gemini detects MCQs, checkboxes, true/false, short and paragraph answers automatically." },
              { icon: Zap, title: "Seconds, not hours", desc: "Paste a whole exam, get a Google Form back in under a minute." },
              { icon: Shield, title: "Your account, your data", desc: "Forms live on your Google Drive. We never store student answers." },
              { icon: FileCheck2, title: "Answer keys", desc: "Mark correct answers and points — your form becomes an auto-graded quiz." },
              { icon: Share2, title: "Share instantly", desc: "Get a responder link the moment the form is created." },
              { icon: Sparkles, title: "Built for educators", desc: "Designed around the real workflow of teachers and trainers." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card p-6">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-peach text-brand-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-ink/70 dark:text-[#F5EDE7]/70">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="card p-8 sm:p-12">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">How it works</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                { n: "1", t: "Paste your questions", d: "Drop in plain text from a doc, PDF, or your notes." },
                { n: "2", t: "AI parses & previews", d: "Review detected questions, answers, and points." },
                { n: "3", t: "Create the form", d: "One click — we generate the Google Form on your account." },
              ].map((s) => (
                <li key={s.n} className="flex gap-4">
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-brand text-sm font-bold text-white">
                    {s.n}
                  </div>
                  <div>
                    <p className="font-semibold">{s.t}</p>
                    <p className="mt-1 text-sm text-ink/70 dark:text-[#F5EDE7]/70">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Ready to save hours every week?</h2>
          <p className="mx-auto mt-4 max-w-xl text-ink/70 dark:text-[#F5EDE7]/70">
            Join educators who use OpenForm to skip the setup and get straight to teaching.
          </p>
          <Link to="/signup" className="btn-primary mt-8">
            Create your first form <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
