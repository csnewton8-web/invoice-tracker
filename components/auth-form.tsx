"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    router.push("/invoices");
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-8 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold">Invoice tracker</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sign in to upload and track supplier invoices.
        </p>
      </div>

      <input
        className="w-full rounded-xl border px-4 py-3"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        className="w-full rounded-xl border px-4 py-3"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button className="w-full rounded-xl bg-slate-900 px-4 py-3 text-white" disabled={loading}>
        {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
      </button>

      <button
        type="button"
        className="w-full text-sm text-slate-600"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}