"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InvoiceDropzone } from "@/components/invoice-dropzone";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { createClient } from "@/lib/supabase/browser";
import {
  FREE_PLAN_MAX_INVOICES,
  canUploadMoreInvoices,
  isPaidPlan,
} from "@/lib/plans";
import { InvoiceRecord } from "@/types/invoice";

type CompanySummary = {
  id: string;
  name: string;
  plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  billing_email: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
};

type ProfileSummary = {
  full_name: string | null;
  email: string | null;
  initials: string;
};

function WorkspaceLogo({
  company,
  size = "normal",
}: {
  company: CompanySummary | null;
  size?: "normal" | "large";
}) {
  const boxClass =
    size === "large"
      ? "flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-950"
      : "flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-950";

  const initials = (company?.name || "FF").slice(0, 2).toUpperCase();

  if (company?.logo_url) {
    return (
      <div className={boxClass}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={company.logo_url}
          alt={`${company.name || "Workspace"} logo`}
          className="h-full w-full object-contain p-2"
        />
      </div>
    );
  }

  return (
    <div className={boxClass}>
      <span className="text-sm font-semibold text-blue-200">{initials}</span>
    </div>
  );
}

export default function InvoicesPage() {
  const supabase = useMemo(() => createClient(), []);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [company, setCompany] = useState<CompanySummary | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [uploadNotice, setUploadNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/invoices/list", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to load invoices");
      }

      setInvoices(body.invoices || []);
      setCompany(body.company || null);

      const profileRes = await fetch("/api/profile/me", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const profileBody = await profileRes.json();

      if (profileRes.ok) {
        setProfile(profileBody.profile);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (!uploadNotice) return;

    const timeout = window.setTimeout(() => {
      setUploadNotice(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [uploadNotice]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;

      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleSignOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const paid = isPaidPlan(company?.plan, company?.subscription_status);
  const invoiceCount = invoices.length;
  const freeSlotsRemaining = Math.max(
    0,
    FREE_PLAN_MAX_INVOICES - invoiceCount
  );

  const canUpload = paid
    ? true
    : canUploadMoreInvoices(
        company?.plan,
        company?.subscription_status,
        invoiceCount
      );

  const remindersLocked = !paid && invoiceCount >= FREE_PLAN_MAX_INVOICES;

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-[32px] border border-slate-800 bg-slate-900 px-6 py-6 shadow-2xl shadow-blue-500/5">
          <div className="grid items-center gap-4 md:grid-cols-[220px_minmax(0,1fr)_300px]">
            <div className="flex items-center gap-3">
              <Image
                src="/logo/flashfox-icon.png"
                alt="FlashFox"
                width={44}
                height={44}
                priority
              />

              <div>
                <div className="text-2xl font-semibold leading-none text-white">
                  FlashFox
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Fast. Smart. On Time.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 text-center">
              <WorkspaceLogo company={company} />

              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Active workspace
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  {company?.name || "FlashFox workspace"}
                </h1>
              </div>
            </div>

            <div ref={menuRef} className="relative flex justify-end">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-left transition hover:border-slate-700 hover:bg-slate-950"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-sm font-semibold text-emerald-200">
                  {profile?.initials || "FF"}
                </div>

                <div className="hidden min-w-0 lg:block">
                  <div className="max-w-[150px] truncate text-sm font-medium text-white">
                    {profile?.full_name || "User"}
                  </div>
                  <div className="max-w-[150px] truncate text-xs text-slate-500">
                    {profile?.email || ""}
                  </div>
                </div>

                <div className="text-slate-500">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 7.5L10 12.5L15 7.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </button>

              {menuOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
                  <div className="border-b border-slate-800 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-sm font-semibold text-emerald-200">
                        {profile?.initials || "FF"}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {profile?.full_name || "User"}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {profile?.email || ""}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                      <WorkspaceLogo company={company} />

                      <div className="min-w-0">
                        <div className="truncate text-xs uppercase tracking-[0.16em] text-slate-500">
                          Workspace
                        </div>
                        <div className="truncate text-sm font-medium text-white">
                          {company?.name || "FlashFox workspace"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-900"
                    >
                      <span>Settings</span>
                      <span className="text-xs text-slate-500">Workspace</span>
                    </Link>

                    <Link
                      href="/billing"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-900"
                    >
                      <span>Billing</span>
                      <span className="text-xs text-slate-500">
                        Plan & usage
                      </span>
                    </Link>

                    <div className="my-2 h-px bg-slate-800" />

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm text-rose-200 transition hover:bg-rose-500/10"
                    >
                      <span>Sign out</span>
                      <span className="text-xs text-rose-300/70">Exit</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {uploadNotice ? (
          <div
            className={
              uploadNotice.type === "success"
                ? "rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200"
                : "rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
            }
          >
            {uploadNotice.message}
          </div>
        ) : null}

        {!loading && company && !paid ? (
          <div className="rounded-3xl border border-sky-500/30 bg-sky-500/10 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">
                  You are on the Free plan
                </div>
                <p className="mt-2 text-sm text-sky-100">
                  Your free workspace includes supplier invoice payment reminders
                  until you reach {FREE_PLAN_MAX_INVOICES} uploaded invoices.
                </p>
                <p className="mt-2 text-sm text-sky-100/90">
                  You are using {invoiceCount} of {FREE_PLAN_MAX_INVOICES} free
                  invoice uploads. {freeSlotsRemaining} remaining.
                </p>
              </div>

              <Link
                href="/billing"
                className="inline-flex rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-200"
              >
                Upgrade to Starter Plan
              </Link>
            </div>
          </div>
        ) : null}

        {!loading && !error ? <OnboardingChecklist /> : null}

        {!loading && !canUpload ? (
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
            <div className="text-lg font-semibold text-white">
              Free upload limit reached
            </div>
            <p className="mt-2 text-sm text-amber-100">
              You have used all {FREE_PLAN_MAX_INVOICES} free invoice uploads.
              Upgrade to Starter Plan to keep uploading invoices and keep
              reminders active.
            </p>
            <Link
              href="/billing"
              className="mt-4 inline-flex rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-slate-200"
            >
              Upgrade now
            </Link>
          </div>
        ) : null}

        {!loading && canUpload ? (
          <div id="upload-invoice">
            <InvoiceDropzone
              uploading={uploading}
              onUploadStart={() => {
                setUploading(true);
                setUploadNotice(null);
              }}
              onUploadError={(message) => {
                setUploading(false);
                setUploadNotice({
                  type: "error",
                  message,
                });
              }}
              onUploaded={async () => {
                await loadInvoices();
                setUploading(false);
                setUploadNotice({
                  type: "success",
                  message: "Invoice uploaded and processed successfully.",
                });
              }}
            />
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            Loading invoices...
          </div>
        ) : null}

        {error && !loading ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && !error && invoices.length === 0 ? (
          <div className="overflow-hidden rounded-3xl border border-blue-500/20 bg-slate-900 shadow-2xl shadow-blue-500/5">
            <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="p-8 md:p-10">
                <div className="flex items-center gap-4">
                  <Image
                    src="/logo/flashfox-icon.png"
                    alt="FlashFox"
                    width={56}
                    height={56}
                    priority
                  />
                  <div>
                    <div className="text-sm font-medium uppercase tracking-[0.2em] text-blue-300">
                      Welcome to FlashFox
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      Fast. Smart. On Time.
                    </div>
                  </div>
                </div>

                {company ? (
                  <div className="mt-8 flex items-center gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                    <WorkspaceLogo company={company} size="large" />

                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Workspace
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {company.name || "FlashFox workspace"}
                      </div>
                    </div>
                  </div>
                ) : null}

                <h2 className="mt-8 max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Upload your first supplier invoice and start tracking payments
                  in minutes.
                </h2>

                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
                  FlashFox helps you capture invoice details, stay on top of due
                  dates, and keep payment follow-up organised without digging
                  through email threads or spreadsheets.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <div className="text-sm font-semibold text-white">
                      1. Upload PDFs
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Drag in supplier invoices and let FlashFox process the key
                      details for you.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <div className="text-sm font-semibold text-white">
                      2. Review clearly
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Check supplier, amount, invoice dates, due dates, and notes
                      in one clean workflow.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <div className="text-sm font-semibold text-white">
                      3. Stay on time
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Track what is paid, what is due, and what needs attention
                      before it becomes overdue.
                    </p>
                  </div>
                </div>

                {!paid ? (
                  <div className="mt-8 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
                    Your free workspace includes up to{" "}
                    {FREE_PLAN_MAX_INVOICES} invoice uploads, plus payment
                    reminders and alert recipients while you stay under that
                    limit.
                  </div>
                ) : null}
              </div>

              <div className="border-t border-slate-800 bg-slate-950/80 p-8 lg:border-l lg:border-t-0">
                <div className="rounded-3xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-slate-900 p-6">
                  <div className="text-sm font-medium uppercase tracking-[0.18em] text-blue-300">
                    What you get
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <div className="text-sm font-semibold text-white">
                        Due date visibility
                      </div>
                      <p className="mt-2 text-sm text-slate-400">
                        See which invoices are due soon and which ones are
                        already overdue.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <div className="text-sm font-semibold text-white">
                        Cleaner payment tracking
                      </div>
                      <p className="mt-2 text-sm text-slate-400">
                        Keep paid and unpaid invoices organised in one place
                        with a clear flow.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <div className="text-sm font-semibold text-white">
                        Better follow-up
                      </div>
                      <p className="mt-2 text-sm text-slate-400">
                        Use reminders and alert recipients from day one, then
                        upgrade when you are ready for unlimited volume.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-200">
                    Tip: start by dragging a PDF into the upload panel above,
                    then open it in the workspace to review details and the
                    original invoice together.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && invoices.length > 0 ? (
          <InvoiceWorkspace
            invoices={invoices as InvoiceRecord[]}
            remindersLocked={remindersLocked}
          />
        ) : null}
      </div>
    </main>
  );
}