"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "magic">("signin");
  const [message, setMessage] = useState("");

  async function submit() {
    const supabase = createSupabaseBrowserClient();

    if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
      });
      setMessage(error ? error.message : "Magic link sent.");
      return;
    }

    const fn = mode === "signin" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    setMessage(error ? error.message : "Success. Continue to /engine.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Login</h1>
      <div className="flex gap-2 text-sm">
        <button className="rounded border px-3 py-1" onClick={() => setMode("signin")}>Sign in</button>
        <button className="rounded border px-3 py-1" onClick={() => setMode("signup")}>Sign up</button>
        <button className="rounded border px-3 py-1" onClick={() => setMode("magic")}>Magic link</button>
      </div>
      <input className="w-full rounded border border-slate-700 bg-slate-900 p-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      {mode !== "magic" && (
        <input className="w-full rounded border border-slate-700 bg-slate-900 p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
      )}
      <button className="rounded bg-blue-600 px-4 py-2" onClick={submit}>Continue</button>
      {message && <p className="text-sm text-slate-300">{message}</p>}
    </div>
  );
}
