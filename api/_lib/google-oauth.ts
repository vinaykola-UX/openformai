import { google } from "googleapis";

export const FORMS_SCOPE = "https://www.googleapis.com/auth/forms.body";

export function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google OAuth credentials");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
