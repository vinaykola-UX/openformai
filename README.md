# OpenForm

Turn pasted exam questions into real Google Forms using AI.

**Stack:** React 18 + Vite + TypeScript · React Router · Tailwind CSS · Firebase Auth & Firestore · Vercel Serverless Functions · Gemini 2.5 Flash · Google Forms API.

---

## 1. Firebase setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → create project.
2. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
3. **Firestore Database**: create in production mode.
4. **Project settings → General → Your apps**: add a Web app, copy the 6 config values into `.env.local` as `VITE_FIREBASE_*`.
5. **Project settings → Service accounts → Generate new private key**: download JSON. Copy:
   - `project_id` → `FIREBASE_ADMIN_PROJECT_ID`
   - `client_email` → `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_ADMIN_PRIVATE_KEY` (keep `\n` escapes, wrap in quotes)
6. Deploy security rules:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules
   ```

## 2. Gemini API key

1. Visit [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → create API key.
2. Set `GEMINI_API_KEY`.

## 3. Google Cloud OAuth (for Forms API)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → select / create a project.
2. **APIs & Services → Library**: enable **Google Forms API** and **Google Drive API**.
3. **OAuth consent screen**: configure (External, add your email as test user). Add scopes `forms.body` and `drive.file`.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URI: `https://YOUR-DOMAIN.vercel.app/google/callback`
   - For local dev also add: `http://localhost:8080/google/callback`
5. Copy Client ID & Secret into env. Set `GOOGLE_REDIRECT_URI` to the matching URI.

## 4. Local dev

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:8080
```

Note: `/api/*` routes only run when deployed to Vercel (or `vercel dev`). For full local testing:
```bash
npm i -g vercel
vercel dev
```

## 5. Deploy to Vercel

1. Push repo to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import repo.
3. Add **all** env vars from `.env.example` in **Project Settings → Environment Variables**.
4. Update `GOOGLE_REDIRECT_URI` to your final domain and re-add it as an Authorized redirect URI in Google Cloud Console.
5. Deploy.

## Data model

```
users/{uid}
  email, displayName, googleRefreshToken?, googleConnectedAt?

forms/{formId}
  uid, title, googleFormId, responderUri, editUri, questionCount, createdAt
```

## Routes

| Path | Description |
|---|---|
| `/` | Landing page |
| `/login`, `/signup` | Firebase auth |
| `/dashboard` | List of user's forms |
| `/dashboard/new` | Paste questions → AI preview → create form |
| `/connect-google` | Grant Google Forms API access |
| `/google/callback` | OAuth redirect handler |

## API

| Endpoint | Description |
|---|---|
| `POST /api/generate` | Parses pasted text into structured questions via Gemini |
| `GET  /api/google/auth-url` | Returns Google OAuth consent URL |
| `GET  /api/google/callback` | Stores refresh token in Firestore |
| `POST /api/create-form` | Creates the Google Form, saves metadata |

All endpoints require a Firebase ID token in `Authorization: Bearer <token>`.
