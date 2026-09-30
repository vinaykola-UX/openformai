# OpenForm Google Forms Import API

This independent Spring Boot service adds Google Forms discovery and import only. Existing Vercel API routes, Firebase Authentication, and the existing Google OAuth callback remain separate and unchanged.

## Requirements

- Java 25
- Maven 3.9 or later
- Firebase Admin service account for the same Firebase project as the frontend
- Google OAuth client with Drive API and Forms API enabled

## Local setup

Copy `.env.example` to `.env` and fill in values locally. Do not commit `.env`. Set environment variables in your shell before starting the service.

```powershell
cd java-backend
mvn clean package
java -jar target/openform-google-import.jar
```

The service listens on `0.0.0.0:8080`; local health check: `http://localhost:8080/health`. Run the existing frontend separately with `npm run dev` and set `VITE_GOOGLE_IMPORT_API_URL=http://localhost:8080` in the frontend environment.

## Google Cloud setup

Reuse the existing Google Cloud project and OAuth client. Enable Google Drive API and Google Forms API. Add the exact `GOOGLE_IMPORT_REDIRECT_URI` to the OAuth client's authorized redirect URIs. The import flow requests OpenID identity, Drive metadata read-only, and Forms body read-only scopes. If the consent screen is in testing mode, add test users as required by Google.

The callback URL is isolated at `/api/v1/google/import/callback`. It does not reuse or change the existing `/api/google/callback` flow or the existing `users/{uid}.googleRefreshToken` field.

## OCI VM deployment

Set the environment variables from `.env.example` using a root-owned environment file (for example `/etc/openform/google-import.env`, mode `0600`). Build with `mvn -DskipTests package` or `docker build -t openform-google-import .`. Run the JAR under systemd using `deploy/openform-google-import.service`; configure Nginx with `deploy/nginx-openform-import.conf` and the VM hostname/certificate. Bind the reverse proxy upstream to `127.0.0.1:8080`; expose only SSH and HTTPS/HTTP at the OCI security-list and host-firewall layers. Do not expose port 8080 publicly.

Configure `APP_FRONTEND_ORIGIN` to the exact production frontend origin and `VITE_GOOGLE_IMPORT_API_URL` to the public HTTPS API origin before building the frontend. Do not use `*` for CORS.

## API

- `GET /api/v1/google/import/auth-url` (Firebase bearer token): returns the isolated Google consent URL.
- `GET /api/v1/google/import/callback`: OAuth callback; validates one-time server-side state, Google identity, and Firebase account email, then stores the encrypted import refresh token separately.
- `GET /api/v1/google/import/forms` (Firebase bearer token): lists one page of 50 forms. Pass `pageToken` for more.
- `POST /api/v1/google/import/forms` (Firebase bearer token): imports up to 20 form IDs. Responses and historical submissions are not copied.

Imported documents use the existing `forms` collection and include the compatible dashboard fields plus `source: "google_import"`, `importedAt`, and unsupported-question warnings. Duplicate checks are performed server-side.

## Current compatibility note

Existing analytics and report Vercel APIs continue to use the existing `googleRefreshToken`. This service intentionally does not overwrite it. For imported forms to work with those existing analytics/report routes, the user must already have the existing Google Forms connection authorized for the same Google account. The import API itself uses only its separate read-only token.

Rate limits are in-memory and suitable for the initial single-VM deployment. Use a shared store before running multiple service instances.