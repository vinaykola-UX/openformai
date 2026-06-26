// src/pages/Privacy.tsx
import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF6F0] to-[#FFEDE3] dark:from-[#1A0E12] dark:to-[#120A0D] text-[#2A1015] dark:text-[#F7E9E3] transition-colors duration-300">
      <div className="max-w-3xl mx-auto px-6 py-16 sm:py-24">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#7A2E3A] dark:text-[#F4A98C] hover:opacity-80 transition-opacity mb-10"
        >
          ← Back to OpenForm
        </Link>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3 bg-gradient-to-r from-[#7A2E3A] to-[#E8896B] bg-clip-text text-transparent">
          Privacy Policy
        </h1>
        <p className="text-sm text-[#8A5C63] dark:text-[#C9A29B] mb-12">
          Last updated: June 2026
        </p>

        <div className="space-y-10 leading-relaxed">
          <Section title="1. Overview">
            OpenForm ("we", "us", "our") respects your privacy. This Privacy
            Policy explains what information we collect, how we use it, and
            the choices you have when you use OpenForm.
          </Section>

          <Section title="2. Information We Collect">
            We collect information you provide directly (such as account
            details, form content, and responses), and information collected
            automatically (such as usage data, device information, and
            cookies) to operate and improve our service.
          </Section>

          <Section title="3. How We Use Your Information">
            We use collected information to provide and maintain OpenForm,
            personalize your experience, communicate with you, process
            payments, and improve the reliability and security of our
            platform.
          </Section>

          <Section title="4. Data Sharing">
            We do not sell your personal data. We may share information with
            trusted service providers who help us operate OpenForm (such as
            hosting and analytics providers), and only to the extent
            necessary for them to perform their services.
          </Section>

          <Section title="5. Data Security">
            We implement industry-standard security measures to protect your
            data. However, no method of transmission or storage is 100%
            secure, and we cannot guarantee absolute security.
          </Section>

          <Section title="6. Your Rights">
            You may request access to, correction of, or deletion of your
            personal data at any time by contacting us using the details
            below.
          </Section>

          <Section title="7. Changes to This Policy">
            We may update this Privacy Policy from time to time. We will
            notify you of significant changes by posting the new policy on
            this page.
          </Section>

          <Section title="8. Contact Us">
            If you have questions about this Privacy Policy, please reach out
            to us at{" "}
            <a
              href="mailto:teamclassvision@gmail.com"
              className="text-[#7A2E3A] dark:text-[#F4A98C] font-medium underline underline-offset-2 hover:opacity-80"
            >
              teamclassvision@gmail.com
            </a>
            .
          </Section>
        </div>
      </div>
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
      <h2 className="text-xl font-semibold mb-3 text-[#5C1F2A] dark:text-[#F7E9E3]">
        {title}
      </h2>
      <p className="text-[#5A3A3F] dark:text-[#D8B9B2]">{children}</p>
    </section>
  );
}