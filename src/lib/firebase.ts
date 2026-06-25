import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Persist session across reloads / OAuth redirects
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn("[firebase] setPersistence failed", e)
);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Resolves once Firebase has restored the persisted user (or confirmed none).
 * Use before calling getIdToken() on app load / after OAuth redirect.
 */
export function waitForAuthReady(): Promise<import("firebase/auth").User | null> {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
  });
}
