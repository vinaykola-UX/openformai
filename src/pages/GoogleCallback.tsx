import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exchangeGoogleCode } from "../lib/api";
import { waitForAuthReady } from "../lib/firebase";

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState("Finalizing Google connection...");

  useEffect(() => {
    const code = params.get("code");
    const err = params.get("error");
    if (err) {
      setMsg("Authorization cancelled.");
      setTimeout(() => nav("/connect-google"), 1500);
      return;
    }
    if (!code) {
      setMsg("Missing authorization code.");
      return;
    }
    (async () => {
      try {
        const user = await waitForAuthReady();
        if (!user) {
          setMsg("Please sign in first.");
          setTimeout(() => nav("/login"), 1500);
          return;
        }
        await exchangeGoogleCode(code);
        setMsg("Connected! Redirecting...");
        setTimeout(() => nav("/dashboard"), 800);
      } catch (e: any) {
        console.error("[google-callback]", e);
        setMsg("Connection failed: " + (e.message || "unknown"));
      }
    })();
  }, [params, nav]);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="card max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        <p>{msg}</p>
      </div>
    </div>
  );
}
