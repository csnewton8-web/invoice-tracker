"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid server response");
  }
}

export default function BillingSuccessPage() {
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );

  const [message, setMessage] = useState("Confirming your Starter plan...");

  useEffect(() => {
    async function confirmCheckout() {
      try {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");

        if (!sessionId) {
          throw new Error("Missing Stripe checkout session ID.");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          window.location.href = "/login";
          return;
        }

        const res = await fetch("/api/stripe/checkout/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
          }),
        });

        const body = await readJsonResponse(res);

        if (!res.ok) {
          throw new Error(body?.error || "Failed to confirm checkout.");
        }

        if (!body?.confirmed) {
          setStatus("error");
          setMessage(
            body?.message ||
              "Checkout has not completed yet. Please check billing."
          );
          return;
        }

        setStatus("success");
        setMessage("Starter plan confirmed. Your workspace is now upgraded.");

        window.setTimeout(() => {
          window.location.href = "/billing";
        }, 1500);
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Failed to confirm your checkout."
        );
      }
    }

    confirmCheckout();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-8 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl shadow-blue-500/5">
          <div
            className={
              status === "success"
                ? "mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-3xl text-emerald-200"
                : status === "error"
                ? "mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-3xl text-amber-200"
                : "mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-3xl text-blue-200"
            }
          >
            {status === "success" ? "✓" : status === "error" ? "!" : "…"}
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight">
            {status === "success"
              ? "Payment complete"
              : status === "error"
              ? "Checkout needs attention"
              : "Confirming payment"}
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300">
            {message}
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/billing"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              View billing
            </Link>

            <Link
              href="/invoices"
              className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Go to invoices
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}