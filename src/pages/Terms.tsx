// src/pages/Terms.tsx
import { Link } from "react-router-dom";

export default function Terms() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-[#8A5C63] dark:text-[#C9A29B] mb-12">
          Last updated: June 2026
        </p>

        <div className="space-y-10 leading-relaxed">
          <Section title="1. Acceptance of Terms">
            By accessing or using OpenForm, you agree to be bound by these
            Terms of Service. If you do not agree, please do not use our
            service.
          </Section>

          <Section title="2. Description of Service">
            OpenForm provides tools for creating, sharing, and managing
            online forms and collecting responses. We may update or modify
            features at any time.
          </Section>

          <Section title="3. Account Responsibilities">
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity that occurs under your
            account.
          </Section>

          <Section title="4. Acceptable Use">
            You agree not to use OpenForm for any unlawful purpose, to
            distribute malicious content, or to attempt unauthorized access
            to our systems or other users' data.
          </Section>

          <Section title="5. Subscription & Billing">
            Paid plans, if applicable, will be billed according to the plan
            you select. Fees are non-refundable except as required by law or
            explicitly stated otherwise.
          </Section>

          <Section title="6. Intellectual Property">
            OpenForm and its original content, features, and functionality
            are owned by us and protected by applicable intellectual property
            laws. Content you create using OpenForm remains yours.
          </Section>

          <Section title="7. Termination">
            We may suspend or terminate your access to OpenForm if you violate
            these Terms or engage in conduct that we deem harmful to the
            service or other users.
          </Section>

          <Section title="8. Limitation of Liability">
            OpenForm is provided "as is" without warranties of any kind. We
            are not liable for any indirect, incidental, or consequential
            damages arising from your use of the service.
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