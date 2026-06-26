// src/pages/Privacy.tsx
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function Privacy() {
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
                Privacy Policy
              </span>
            </h1>
            <p className="mt-3 text-sm text-ink/60 dark:text-[#F5EDE7]/60">
              Last updated: June 2026
            </p>

            <div className="card mt-10 space-y-8 p-6 sm:p-10">
              <Section title="1. Overview">
                OpenForm ("we", "us", "our") respects your privacy. This
                Privacy Policy explains what information we collect, how we
                use it, and the choices you have when you use OpenForm.
              </Section>

              <Section title="2. Information We Collect">
                We collect information you provide directly (such as account
                details, form content, and pasted questions), and information
                collected automatically (such as usage data and cookies) to
                operate and improve our service.
              </Section>

              <Section title="3. How We Use Your Information">
                We use collected information to provide and maintain
                OpenForm, personalize your experience, communicate with you,
                and improve the reliability and security of our platform.
              </Section>

              <Section title="4. Google Account Access">
                When you connect your Google account, OpenForm creates forms
                directly on your Google Drive using the permissions you grant.
                We do not store your form responses or student answers on our
                servers.
              </Section>

              <Section title="5. Data Sharing">
                We do not sell your personal data. We may share information
                with trusted service providers who help us operate OpenForm,
                only to the extent necessary for them to perform their
                services.
              </Section>

              <Section title="6. Data Security">
                We implement industry-standard security measures to protect
                your data. However, no method of transmission or storage is
                100% secure, and we cannot guarantee absolute security.
              </Section>

              <Section title="7. Your Rights">
                You may request access to, correction of, or deletion of your
                personal data at any time by contacting us using the details
                below.
              </Section>

              <Section title="8. Changes to This Policy">
                We may update this Privacy Policy from time to time. We will
                notify you of significant changes by posting the new policy
                on this page.
              </Section>

              <Section title="9. Contact Us">
                If you have questions about this Privacy Policy, please reach
                out to us at{" "}
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