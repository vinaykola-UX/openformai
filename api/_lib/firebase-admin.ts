import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App | undefined;

export function getAdmin() {
  if (!app) {
    if (getApps().length) {
      app = getApps()[0]!;
    } else {
      const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
      if (!projectId || !clientEmail || !privateKey) {
        throw new Error("Missing Firebase Admin credentials");
      }
      app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
  }
  return { app, auth: getAuth(app), db: getFirestore(app) };
}
