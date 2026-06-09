"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const redirect = searchParams.get("redirect");
  const isInviteSignup = Boolean(redirect?.startsWith("/invite/accept"));

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function bootstrapCompany(accessToken: string) {
    const res = await fetch("/api/companies/bootstrap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        fullName: fullName.trim(),
        companyName: companyName.trim(),
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || "Failed to create company workspace");
    }

    return body;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (!fullName.trim()) {
      setMessage("Please enter your full name.");
      setLoading(false);
      return;
    }

    if (!isInviteSignup && !companyName.trim()) {
      setMessage("Please enter your company or workspace name.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.session?.access_token) {
        if (!isInviteSignup) {
          await bootstrapCompany(data.session.access_token);
        }

        router.push(redirect || "/onboarding");
        router.refresh();
        return;
      }

      setMessage(
        "Account created. If email confirmation is enabled in Supabase, check your inbox before logging in."
      );
    } catch (err) {
      console.error("Signup error:", err);
      setMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong while creating your account."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-16 text-white">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex text-sm text-slate-400 hover:text-white"
        >
          ← Back to home
        </Link>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-500/5">
          <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
            FlashFox
          </div>

          <h1 className="mt-4 text-3xl font-semibold">
            {isInviteSignup
              ? "Create your invited account"
              : "Create your account"}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            {isInviteSignup
              ? "Create an account using the email address your invitation was sent to."
              : "Set up your workspace and start tracking supplier invoices."}
          </p>

          <form onSubmit={handleSignup} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Full name
              </label>
              <input
                type="text"
                placeholder="Craig Newton"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {!isInviteSignup && (
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Company / workspace name
                </label>
                <input
                  type="text"
                  placeholder="Acme Ltd"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required={!isInviteSignup}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm text-slate-300">Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Password
              </label>
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Confirm password
              </label>
              <input
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {message ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-white px-4 py-3 font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-400">
            Already have an account?{" "}
            <Link
              href={
                redirect
                  ? `/login?redirect=${encodeURIComponent(redirect)}`
                  : "/login"
              }
              className="text-white hover:underline"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function SignupFallback() {
  return (
    <main className="min-h-screen bg-[#020817] px-6 py-16 text-white">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-500/5">
          <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
            FlashFox
          </div>

          <h1 className="mt-4 text-3xl font-semibold">Loading signup</h1>

          <p className="mt-2 text-sm text-slate-400">
            We are preparing your signup form.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            Loading...
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupContent />
    </Suspense>
  );
}