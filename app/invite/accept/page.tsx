"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  useEffect(() => {
    async function acceptInvite() {
      setLoading(true);
      setError("");
      setErrorCode("");

      try {
        if (!token) {
          setError("Missing invitation token.");
          setErrorCode("missing_token");
          setLoading(false);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.push(
            `/signup?redirect=${encodeURIComponent(
              `/invite/accept?token=${token}`
            )}`
          );
          return;
        }

        const res = await fetch("/api/team/accept", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setErrorCode(data.code || "accept_failed");
          throw new Error(data.error || "Could not accept invitation");
        }

        router.push("/dashboard");
        router.refresh();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Could not accept invitation";

        setError(message);
        setLoading(false);
      }
    }

    acceptInvite();
  }, [router, supabase, token]);

  const title =
    errorCode === "invite_expired"
      ? "Invitation expired"
      : errorCode === "invite_already_accepted"
        ? "Invitation already accepted"
        : errorCode === "wrong_email"
          ? "Wrong email address"
          : error
            ? "Could not accept invitation"
            : "Accepting invitation";

  const description =
    errorCode === "invite_expired"
      ? "This invitation has expired. Ask the workspace owner or admin to send you a new invite."
      : errorCode === "invite_already_accepted"
        ? "This invitation has already been used. You can log in to access your workspace."
        : errorCode === "wrong_email"
          ? "You are signed in with a different email address than the one this invitation was sent to."
          : "We are checking your invitation and adding you to the workspace.";

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-16 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-500/5">
          <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
            FlashFox
          </div>

          <h1 className="mt-4 text-3xl font-semibold">{title}</h1>

          <p className="mt-3 text-sm text-slate-400">{description}</p>

          {loading && !error && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
              Accepting invitation...
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {errorCode === "wrong_email" && (
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push(
                  `/login?redirect=${encodeURIComponent(
                    `/invite/accept?token=${token}`
                  )}`
                );
              }}
              className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-slate-200"
            >
              Sign in with the invited email
            </button>
          )}

          {errorCode === "invite_already_accepted" && (
            <Link
              href="/login"
              className="mt-5 block w-full rounded-2xl bg-white px-4 py-3 text-center text-sm font-medium text-slate-950 transition hover:bg-slate-200"
            >
              Go to login
            </Link>
          )}

          {errorCode === "invite_expired" && (
            <Link
              href="/"
              className="mt-5 block w-full rounded-2xl border border-slate-700 px-4 py-3 text-center text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              Back to home
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function AcceptInviteFallback() {
  return (
    <main className="min-h-screen bg-[#020817] px-6 py-16 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-blue-500/5">
          <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
            FlashFox
          </div>

          <h1 className="mt-4 text-3xl font-semibold">Loading invitation</h1>

          <p className="mt-3 text-sm text-slate-400">
            We are preparing your invitation.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            Loading...
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInviteContent />
    </Suspense>
  );
}