# OpenForm — Security & Error Report

**Contact:** vkola306@gmail.com
**Last scan:** 2026-07-01

This file tracks security findings, runtime bugs, and crashes for the OpenForm project. When new issues are found (now or in the future), append them under **Issue Log** and notify the contact above.

---

## Latest Scan Summary

| Check | Tool | Result |
|---|---|---|
| Backend/RLS security audit | Lovable security scanner | ✅ No issues found |
| Dependency vulnerabilities (high/critical) | `npm audit` | ✅ No high/critical vulnerabilities |
| Frontend runtime console errors | Browser console snapshot | ✅ Clean (only Vite HMR reconnect notice) |
| Build status | Vite production build | ✅ Passing |

**Status: 🟢 No active security issues or crashes detected.**

---

## Security Posture Overview

- **Auth:** Firebase Authentication, Google-only sign-in, `browserLocalPersistence` for session hydration.
- **Backend:** Vercel serverless functions under `/api`, every protected route calls `verifyAuth()` which validates the Firebase ID token via `firebase-admin`.
- **Secrets:** All private keys (`GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `FIREBASE_ADMIN_PRIVATE_KEY`, `UNLOCK_PASSCODE`) live in Vercel env vars — never shipped to the client. Only `VITE_FIREBASE_*` publishable keys are in the bundle (expected & safe).
- **Firestore:** Rules in `firestore.rules` restrict `users/{uid}` and `forms` to the owning UID.
- **OAuth:** Google refresh tokens stored server-side in Firestore, never exposed to the browser.
- **Rate limiting:** Server-enforced 5/day and 80/month free-tier caps in `api/create-form.ts`.
- **CSRF/XSS:** No `dangerouslySetInnerHTML`; all user input rendered through React escaping.

## Things that must never happen

- Refresh tokens or admin credentials returned to the client.
- Any `/api/*` endpoint accepting requests without a valid Firebase ID token (except `google/callback` which uses OAuth state).
- Bypass of the daily/monthly form quotas without the unlock passcode.
- Storing the unlock passcode `openform@vinay.com` in client-side code.

---

## Issue Log

_No issues recorded._

### Template for new entries

```
### YYYY-MM-DD — <short title>
- **Severity:** low | medium | high | critical
- **Component:** e.g. api/create-form.ts
- **Description:** what happened
- **Repro:** steps
- **Fix:** what was done (or "pending")
- **Notified:** vkola306@gmail.com ✅ / ❌
```

---

## Notification Policy

Because this project does not currently have an outbound email service wired up (no Resend/Mailgun/Lovable Emails integration on this Vercel + Firebase stack), errors are **logged to this file** instead of being emailed automatically. To enable real email delivery to `vkola306@gmail.com`, add one of:

1. **Resend** — add `RESEND_API_KEY` to Vercel env and create `api/_lib/notify.ts` that POSTs to `https://api.resend.com/emails`.
2. **SendGrid** — add `SENDGRID_API_KEY` and use their v3 mail send endpoint.
3. **Gmail SMTP via Nodemailer** — add `SMTP_USER` / `SMTP_PASS` (app password) and send from a Node serverless function.

Once configured, wire the notifier into the `catch` blocks of `api/create-form.ts`, `api/generate.ts`, `api/extract.ts`, `api/drive-import.ts`, and `api/google/callback.ts` so every 5xx is emailed in addition to being appended here.
