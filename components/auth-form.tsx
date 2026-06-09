"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function AuthForm() {
  const supabase = createClient();

  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function getCredentials() {
    const email = emailRef.current?.value.trim() || "";
    const password = passwordRef.current?.value || "";
    return { email, password };
  }

  async function signIn() {
    setLoading(true);
    setMessage("");

    try {
      const { email, password } = getCredentials();

      if (!email || !password) {
        setMessage("Please enter both email and password.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log("SIGN IN RESULT:", { data, error });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!data.session) {
        setMessage("Login succeeded but no session was returned.");
        return;
      }

      setMessage("Login successful. Redirecting...");
      window.location.assign("/invoices");
    } catch (err) {
      console.error("SIGN IN CRASH:", err);
      setMessage("Unexpected sign-in error.");
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    setLoading(true);
    setMessage("");

    try {
      const { email, password } = getCredentials();

      if (!email || !password) {
        setMessage("Please enter both email and password.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      console.log("SIGN UP RESULT:", { data, error });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data.user && !data.session) {
        setMessage("Account created. Check your email if confirmation is required.");
        return;
      }

      setMessage("Account created successfully. You can now sign in.");
    } catch (err) {
      console.error("SIGN UP CRASH:", err);
      setMessage("Unexpected sign-up error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
      <div className="space-y-4">
        <input
          ref={emailRef}
          type="email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          className="w-full rounded-xl border px-4 py-3"
        />

        <input
          ref={passwordRef}
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          className="w-full rounded-xl border px-4 py-3"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={signIn}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-white disabled:opacity-50"
          >
            {loading ? "Working..." : "Sign in"}
          </button>

          <button
            type="button"
            onClick={signUp}
            disabled={loading}
            className="rounded-xl border px-5 py-3 disabled:opacity-50"
          >
            Sign up
          </button>
        </div>

        {message && <p className="text-sm text-slate-600">{message}</p>}
      </div>
    </div>
  );
}