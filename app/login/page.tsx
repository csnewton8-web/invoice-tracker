"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const redirect = searchParams.get("redirect");
  const isInviteLogin = Boolean(redirect?.startsWith("/invite/accept"));
  const nextPath = redirect || "/dashboard";

  async function bootstrapCompany(accessToken: string) {
    const res = await fetch("/api/companies/bootstrap", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || "Failed to create company workspace");
    }

    return body;
  }

  async function getPostLoginDestination(accessToken: string) {
    const res = await fetch("/api/auth/post-login-destination", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || "Failed to decide login destination");
    }

    return body.destination || "/dashboard";
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const accessToken = data.session?.access_token;

      if (!accessToken) {
        setMessage("Login succeeded but no access token was returned.");
        setLoading(false);
        return;
      }

      if (!isInviteLogin) {
        await bootstrapCompany(accessToken);

        const destination = redirect || (await getPostLoginDestination(accessToken));

        router.push(destination);
        router.refresh();
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      console.error("Login error:", err);

      setMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong while logging in."
      );

      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="mb-8 inline-flex text-sm text-slate-400 hover:text-white"
        >
          ← Back to home
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
            <div className="flex flex-col items-start">
              <Image
                src="/logo/flashfox-logo.png"
                alt="FlashFox"
                width={280}
                height={88}
                priority
                className="h-auto w-auto"
              />

              <p className="mt-4 text-lg font-medium text-slate-300">
                Fast. Smart. On Time.
              </p>
            </div>

            <div className="mt-10 max-w-xl">
              <h1 className="text-4xl font-semibold leading-tight">
                Stay on top of supplier invoices without the spreadsheet chaos.
              </h1>

              <p className="mt-4 text-base text-slate-400">
                Upload invoices, track due dates, manage payment status, and
                keep your reminders organised in one place.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-semibold text-white">
                  Upload quickly
                </div>

                <p className="mt-2 text-sm text-slate-400">
                  Drop in supplier PDFs and capture the important invoice data.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-semibold text-white">
                  Review clearly
                </div>

                <p className="mt-2 text-sm text-slate-400">
                  Check invoice details, payment status, dates, and notes in
                  one workflow.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-semibold text-white">
                  Stay on time
                </div>

                <p className="mt-2 text-sm text-slate-400">
                  Keep on top of payments and reduce the risk of overdue
                  invoices.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-blue-500/30 bg-slate-900 p-8 shadow-2xl shadow-blue-500/10">
            <div className="mb-8">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo/flashfox-icon.png"
                  alt="FlashFox"
                  width={40}
                  height={40}
                  priority
                />

                <div>
                  <h2 className="text-2xl font-semibold">
                    {isInviteLogin ? "Log in to accept invitation" : "Log in"}
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    {isInviteLogin
                      ? "Use the same email address the invitation was sent to."
                      : "Access your supplier invoice dashboard."}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Email
                </label>

                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Password
                </label>

                <input
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
                {loading ? "Logging in..." : "Log in"}
              </button>
            </form>

            <p className="mt-6 text-sm text-slate-400">
              Don&apos;t have an account?{" "}
              <Link
                href={
                  redirect
                    ? `/signup?redirect=${encodeURIComponent(redirect)}`
                    : "/signup"
                }
                className="text-white hover:underline"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="flex flex-col items-start">
            <Image
              src="/logo/flashfox-logo.png"
              alt="FlashFox"
              width={280}
              height={88}
              priority
              className="h-auto w-auto"
            />

            <p className="mt-4 text-lg font-medium text-slate-300">
              Fast. Smart. On Time.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            Loading login...
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}