import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "../lib/firebase";

type Ctx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  async function ensureUserDoc(u: User) {
    await setDoc(
      doc(db, "users", u.uid),
      { email: u.email, displayName: u.displayName, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  const value: Ctx = {
    user,
    loading,
    signIn: async (email, password) => {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(user);
    },
    signUp: async (email, password, name) => {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(user, { displayName: name });
      await ensureUserDoc(user);
    },
    signInGoogle: async () => {
      const { user } = await signInWithPopup(auth, googleProvider);
      await ensureUserDoc(user);
    },
    logout: () => signOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
