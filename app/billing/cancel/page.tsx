"use client";

import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <main className="min-h-screen bg-[#020817] px-6 py-8 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl shadow-blue-500/5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-3xl text-slate-300">
            ×
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight">
            Checkout cancelled
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300">
            No payment was taken and your workspace plan has not changed. You can
            return to billing whenever you are ready to upgrade.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/billing"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Back to billing
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