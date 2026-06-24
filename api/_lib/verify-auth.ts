import type { VercelRequest } from "@vercel/node";
import { getAdmin } from "./firebase-admin";

export async function verifyAuth(req: VercelRequest): Promise<{ uid: string; email?: string }> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new Error("Missing bearer token");
  const token = header.slice(7);
  const { auth } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}
