"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { FREE_PLAN_MAX_INVOICES, isPaidPlan } from "@/lib/plans";

type BillingCompany = {
  id: string;
  name: string;
  billing_email: string | null;
  plan: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  invoice_count: number;
  invoice_upload_count: number;
  workspace_code: string;
  logo_url: string | null;
  logo_storage_path: string | null;
};

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid server response");
  }
}

function CompanyLogo({ company }: { company: BillingCompany }) {
  const initials = (company.name || "FF").slice(0, 2).toUpperCase();

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
      {company.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={company.logo_url}
          alt={`${company.name || "Workspace"} logo`}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <span className="text-lg font-semibold text-blue-200">{initials}</span>
      )}
    </div>
  );
}

export default function BillingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany] = useState<BillingCompany | null>(null);
  const [starterPriceDisplay, setStarterPriceDisplay] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadBilling() {
      setLoading(true);
      setMessage("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          window.location.href = "/login";
          return;
        }

        const res = await fetch("/api/billing/status", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const body = await readJsonResponse(res);

        if (!res.ok) {
          throw new Error(body?.error || "Failed to load billing");
        }

        setCompany(body?.company || null);
        setStarterPriceDisplay(body?.starter_price_display || null);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Failed to load billing"
        );
      } finally {
        setLoading(false);
      }
    }

    loadBilling();
  }, [supabase]);

  async function startCheckout() {
    try {
      setActionLoading(true);
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const body = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(body?.error || "Failed to start checkout");
      }

      if (!body?.url) {
        throw new Error("Stripe checkout URL was not returned");
      }

      window.location.href = body.url;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to start checkout"
      );
      setActionLoading(false);
    }
  }

  async function openBillingPortal() {
    try {
      setPortalLoading(true);
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const body = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(body?.error || "Failed to open billing portal");
      }

      if (!body?.url) {
        throw new Error("Stripe billing portal URL was not returned");
      }

      window.location.href = body.url;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to open billing portal"
      );
      setPortalLoading(false);
    }
  }

  const paid = isPaidPlan(company?.plan, company?.subscription_status);
  const currentInvoiceCount = company?.invoice_count || 0;
  const lifetimeUploadCount =
    company?.invoice_upload_count ?? currentInvoiceCount;
  const freeLimitReached =
    !paid && lifetimeUploadCount >= FREE_PLAN_MAX_INVOICES;

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[32px] border border-slate-800 bg-slate-900 shadow-2xl shadow-blue-500/5">
          <div className="flex flex-col gap-6 px-6 py-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {company ? <CompanyLogo company={company} /> : null}

              <div>
                <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
                  Billing & plan
                </div>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                  {company?.name || "FlashFox workspace"}
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Manage your subscription, usage, and workspace billing
                  details.
                </p>
              </div>
            </div>

            <Link
              href="/invoices"
              className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Back to invoices
            </Link>
          </div>

          {!loading && company ? (
            <div className="grid gap-4 border-t border-slate-800 px-6 py-5 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  Workspace code
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {company.workspace_code}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  Current plan
                </div>
                <div className="mt-2 text-sm font-semibold text-white capitalize">
                  {company.plan || "free"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  Lifetime usage
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {lifetimeUploadCount}
                  {!paid
                    ? ` / ${FREE_PLAN_MAX_INVOICES} free uploads`
                    : " lifetime uploads"}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
            Loading billing...
          </div>
        ) : null}

        {message ? (
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-200">
            {message}
          </div>
        ) : null}

        {!loading && company ? (
          <>
            {!paid ? (
              <div className="rounded-3xl border border-sky-500/30 bg-sky-500/10 p-6">
                <div className="text-xl font-semibold text-white">
                  You are on the Free plan
                </div>
                <p className="mt-2 text-sm text-sky-100">
                  Your free workspace includes up to {FREE_PLAN_MAX_INVOICES}{" "}
                  lifetime invoice uploads, plus payment reminders and alert
                  recipients while you stay under that limit.
                </p>
                <p className="mt-2 text-sm text-sky-100/90">
                  {freeLimitReached
                    ? "You have reached the free lifetime upload limit, so uploads and reminders are now locked until you upgrade."
                    : `You have used ${lifetimeUploadCount} of ${FREE_PLAN_MAX_INVOICES} free lifetime uploads.`}
                </p>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
                <div className="flex items-center gap-4">
                  <CompanyLogo company={company} />

                  <div>
                    <div className="text-sm uppercase tracking-[0.14em] text-slate-500">
                      Workspace account
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-white">
                      {company.name}
                    </h2>
                  </div>
                </div>

                <div className="mt-6 space-y-3 text-sm text-slate-300">
                  <p>
                    <span className="text-slate-400">Billing email:</span>{" "}
                    {company.billing_email || "Not set"}
                  </p>
                  <p>
                    <span className="text-slate-400">
                      Subscription status:
                    </span>{" "}
                    {company.subscription_status || "Not started"}
                  </p>
                  <p>
                    <span className="text-slate-400">Renewal date:</span>{" "}
                    {company.current_period_end
                      ? new Date(company.current_period_end).toLocaleDateString()
                      : "Not available"}
                  </p>
                  <p>
                    <span className="text-slate-400">Workspace code:</span>{" "}
                    {company.workspace_code}
                  </p>
                  <p>
                    <span className="text-slate-400">
                      Current invoices stored:
                    </span>{" "}
                    {currentInvoiceCount}
                  </p>
                  <p>
                    <span className="text-slate-400">
                      Lifetime invoice uploads:
                    </span>{" "}
                    {lifetimeUploadCount}
                    {!paid ? ` / ${FREE_PLAN_MAX_INVOICES} free uploads` : ""}
                  </p>
                </div>

                {paid ? (
                  <button
                    onClick={openBillingPortal}
                    disabled={portalLoading}
                    className="mt-8 w-full rounded-2xl border border-slate-700 px-4 py-3 font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {portalLoading
                      ? "Opening billing portal..."
                      : "Manage billing"}
                  </button>
                ) : null}
              </div>

              <div className="rounded-[30px] border border-blue-500/20 bg-slate-900 p-6 shadow-2xl shadow-blue-500/10">
                <div className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200">
                  Recommended plan
                </div>

                <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <div className="text-sm text-slate-400">Starter plan</div>
                    <div className="mt-2 text-4xl font-semibold text-white">
                      {starterPriceDisplay || "Paid monthly"}
                    </div>
                    <div className="mt-2 text-sm text-slate-400">
                      Upgrade when you need more than the free lifetime upload
                      allowance.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 xl:text-right">
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Best for
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white">
                      Ongoing invoice operations
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="text-sm font-semibold text-white">
                      Unlimited supplier invoices
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Keep uploading as your workflow grows.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="text-sm font-semibold text-white">
                      Reminders stay active
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      No lockout after the free upload threshold.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="text-sm font-semibold text-white">
                      Alert recipients stay active
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Keep finance follow-up running as volume increases.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="text-sm font-semibold text-white">
                      Future premium features
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Gives you a clearer path for product expansion.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
                  Upgrade is handled securely through Stripe. You will be able
                  to manage billing later from your billing portal.
                </div>

                <button
                  onClick={startCheckout}
                  disabled={actionLoading || paid}
                  className="mt-8 w-full rounded-2xl bg-white px-4 py-3 font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {paid
                    ? "Starter plan active"
                    : actionLoading
                    ? "Redirecting..."
                    : "Upgrade to Starter"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
              Your company is currently{" "}
              <span className="font-semibold text-white">
                {paid ? "on a paid plan" : "on the free plan"}
              </span>
              .
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}