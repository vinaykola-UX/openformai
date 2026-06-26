// src/pages/Terms.tsx
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function Terms() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-warm-gradient opacity-60 dark:opacity-20" />
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-brand hover:opacity-80"
            >
              <ArrowLeft className="h-4 w-4" /> Back to OpenForm
            </Link>

            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="bg-brand-gradient bg-clip-text text-transparent">
                Terms of Service
              </span>
            </h1>
            <p className="mt-3 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Last updated: June 2026
            </p>

            <div className="card mt-10 space-y-8 p-6 sm:p-10">
              <Section title="1. Acceptance of Terms">
                By accessing or using OpenForm, you agree to be bound by these
                Terms of Service. If you do not agree, please do not use our
                service.
              </Section>

              <Section title="2. Description of Service">
                OpenForm uses AI to parse pasted questions and generate Google
                Forms on your connected Google account. We may update or
                modify features at any time.
              </Section>

              <Section title="3. Account Responsibilities">
                You are responsible for maintaining the confidentiality of
                your account credentials and for all activity that occurs
                under your account, including forms created via your
                connected Google account.
              </Section>

              <Section title="4. Acceptable Use">
                You agree not to use OpenForm for any unlawful purpose, to
                distribute malicious content, or to attempt unauthorized
                access to our systems or other users' data.
              </Section>

              <Section title="5. Subscription & Billing">
                OpenForm is currently free during beta. If we introduce paid
                plans in the future, fees will be clearly disclosed before
                you are charged.
              </Section>

              <Section title="6. Intellectual Property">
                OpenForm and its original content, features, and
                functionality are owned by us and protected by applicable
                intellectual property laws. Content and forms you create
                using OpenForm remain yours.
              </Section>

              <Section title="7. Termination">
                We may suspend or terminate your access to OpenForm if you
                violate these Terms or engage in conduct that we deem harmful
                to the service or other users.
              </Section>

              <Section title="8. Limitation of Liability">
                OpenForm is provided "as is" without warranties of any kind.
                We are not liable for any indirect, incidental, or
                consequential damages arising from your use of the service.
              </Section>

              <Section title="9. Changes to Terms">
                We may revise these Terms from time to time. Continued use of
                OpenForm after changes constitutes acceptance of the updated
                Terms.
              </Section>

              <Section title="10. Contact Us">
                For questions about these Terms, please contact us at{" "}
                <a
                  href="mailto:teamclassvision@gmail.com"
                  className="font-medium text-brand underline underline-offset-2 hover:opacity-80"
                >
                  teamclassvision@gmail.com
                </a>
                .
              </Section>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/70 dark:text-[#F5EDE7]/70">
        {children}
      </p>
    </section>
  );
}