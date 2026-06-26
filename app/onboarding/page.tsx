"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceDropzone } from "@/components/invoice-dropzone";
import SelectedInvoicePanel from "@/components/selected-invoice-panel";
import { PdfViewer } from "@/components/pdf-viewer";
import { PayLinkSettings } from "@/components/pay-link-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { RecipientSettings } from "@/components/recipient-settings";
import { createClient } from "@/lib/supabase/browser";

type Invoice = {
  id: string;
  supplier?: string | null;
  invoice_number?: string | null;
  po_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  total?: number | null;
  currency?: string | null;
  is_paid?: boolean | null;
  notes?: string[] | null;
};

type OnboardingStatus = {
  show_onboarding: boolean;
  onboarding_completed: boolean;
  onboarding: {
    uploaded_first_invoice: boolean;
    added_alert_recipient: boolean;
    configured_reminder_schedule: boolean;
  };
};

const steps = [
  "Welcome",
  "Upload invoice",
  "Review details",
  "Payment link",
  "Payment reminders",
  "Finish",
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [message, setMessage] = useState("");
  const [payLinkSaved, setPayLinkSaved] = useState(false);
  const [remindersChoice, setRemindersChoice] = useState<
    "done" | "later" | null
  >(null);

  const hasActiveRecipient = Boolean(
    status?.onboarding.added_alert_recipient
  );

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  }

  async function loadStatus() {
    setLoading(true);
    setMessage("");

    try {
      const token = await getAccessToken();

      if (!token) {
        router.push("/login?redirect=/onboarding");
        return;
      }

      await fetch("/api/companies/bootstrap", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await fetch("/api/onboarding/status", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to load onboarding");
      }

      setStatus(body);

      if (body.onboarding_completed) {
        router.push("/invoices");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load onboarding"
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateInvoice(id: string, field: string, value: unknown) {
    setSelectedInvoice((prev) =>
      prev && prev.id === id ? { ...prev, [field]: value } : prev
    );

    const token = await getAccessToken();

    if (!token) {
      router.push("/login?redirect=/onboarding");
      return;
    }

    const res = await fetch("/api/invoices/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id,
        [field]: value,
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || "Failed to update invoice");
    }

    if (body.invoice) {
      setSelectedInvoice((prev) =>
        prev && prev.id === id ? { ...prev, ...body.invoice } : prev
      );
    }
  }

  async function finishOnboarding() {
    setMessage("");
    setFinishing(true);

    try {
      const token = await getAccessToken();

      if (!token) {
        router.push("/login?redirect=/onboarding");
        return;
      }

      const res = await fetch("/api/onboarding/status", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : null;

      if (!res.ok) {
        throw new Error(body?.error || "Failed to finish onboarding");
      }

      router.push("/invoices");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to finish onboarding"
      );
      setFinishing(false);
    }
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020817] px-6 py-10 text-white">
        <div className="mx-auto max-w-5xl rounded-[32px] border border-slate-800 bg-slate-900 p-8">
          Loading your workspace...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-slate-800 bg-slate-900 p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
                New workspace setup
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                Let’s set up FlashFox
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Upload your first invoice, check the extracted details, add your
                payment link, configure reminders, then continue to your invoice
                workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={finishOnboarding}
              className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Skip setup
            </button>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                className={[
                  "rounded-2xl border px-4 py-4 text-left transition",
                  step === index
                    ? "border-blue-400 bg-blue-500/20"
                    : index < step
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-950",
                ].join(" ")}
              >
                <div className="text-xs text-slate-500">Step {index + 1}</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {label}
                </div>
              </button>
            ))}
          </div>
        </section>

        {message ? (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {message}
          </div>
        ) : null}

        {step === 0 ? (
          <section className="rounded-[32px] border border-slate-800 bg-slate-900 p-8">
            <h2 className="text-2xl font-semibold">Your workspace is ready</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              FlashFox extracts supplier, invoice number, dates, totals and
              payment status from uploaded PDFs. You’ll review the extracted
              data before moving into the main workspace.
            </p>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Continue
            </button>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-4">
            <div className="rounded-[32px] border border-slate-800 bg-slate-900 p-8">
              <h2 className="text-2xl font-semibold">
                Upload your first invoice
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Choose a PDF invoice. FlashFox will extract the key details and
                take you to the review step.
              </p>
            </div>

            <InvoiceDropzone
              uploading={uploading}
              onUploadStart={() => {
                setUploading(true);
                setMessage("");
              }}
              onUploadError={(error) => {
                setUploading(false);
                setMessage(error);
              }}
              onUploaded={async (invoice) => {
                setUploading(false);

                if (invoice) {
                  setSelectedInvoice(invoice);
                  await loadStatus();
                  setStep(2);
                  return;
                }

                const token = await getAccessToken();

                if (!token) {
                  router.push("/login?redirect=/onboarding");
                  return;
                }

                const res = await fetch("/api/invoices/list", {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                  cache: "no-store",
                });

                const body = await res.json();

                if (!res.ok) {
                  throw new Error(
                    body.error || "Failed to load uploaded invoice"
                  );
                }

                const latestInvoice = body.invoices?.[0] || null;

                setSelectedInvoice(latestInvoice);
                await loadStatus();
                setStep(2);
              }}
            />

            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-2xl border border-slate-700 px-5 py-3 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              I’ll upload one later
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <div className="rounded-[32px] border border-slate-800 bg-slate-900 p-8">
              <h2 className="text-2xl font-semibold">
                Review extracted invoice details
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Check the extracted fields. You can edit anything that looks
                wrong before continuing.
              </p>
            </div>

            {selectedInvoice ? (
              <>
                <div className="rounded-[32px] border border-slate-800 bg-slate-900 p-6">
                  <SelectedInvoicePanel
                    invoice={selectedInvoice}
                    onUpdate={updateInvoice}
                  />

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                    >
                      Confirm invoice details
                    </button>
                  </div>
                </div>

                <PdfViewer invoiceId={selectedInvoice.id} />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-2xl border border-slate-700 px-5 py-3 text-sm text-slate-200 transition hover:bg-slate-800"
                  >
                    Upload a different invoice
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-[32px] border border-orange-500/30 bg-orange-500/10 p-8">
                <h3 className="text-xl font-semibold text-orange-100">
                  No uploaded invoice to review
                </h3>
                <p className="mt-2 text-sm text-orange-200">
                  Upload an invoice first, or skip this step for now.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                  >
                    Upload invoice
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="rounded-2xl border border-orange-400/30 px-5 py-3 text-sm text-orange-100 transition hover:bg-orange-500/10"
                  >
                    Skip review
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <div className="rounded-[32px] border border-slate-800 bg-slate-900 p-8">
              <h2 className="text-2xl font-semibold">Payment link settings</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Add the payment page or portal link that appears against
                invoices in the table. You can skip this and add it later from
                settings.
              </p>
            </div>

            <PayLinkSettings
              onSaved={(payLinkUrl) => {
                setPayLinkSaved(Boolean(payLinkUrl));
              }}
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                {payLinkSaved ? "Continue" : "Skip payment link for now"}
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-4">
            <div className="rounded-[32px] border border-slate-800 bg-slate-900 p-8">
              <h2 className="text-2xl font-semibold">Payment reminders</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Add at least one active recipient first, then configure reminder
                timing and send options.
              </p>
            </div>

            <RecipientSettings />

            <button
              type="button"
              onClick={loadStatus}
              className="rounded-2xl border border-blue-400/30 bg-blue-500/10 px-5 py-3 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20"
            >
              I’ve added a recipient — enable reminder settings
            </button>

            {!hasActiveRecipient ? (
              <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                Add and enable at least one alert recipient before using
                reminder settings or sending a reminder now.
              </div>
            ) : null}

            <NotificationSettings
              disabled={!hasActiveRecipient}
              upgradeMessage="Add and enable at least one alert recipient before using reminder settings or sending a reminder now."
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!hasActiveRecipient}
                onClick={() => {
                  setRemindersChoice("done");
                  setStep(5);
                }}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>

              <button
                type="button"
                onClick={() => {
                  setRemindersChoice("later");
                  setStep(5);
                }}
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm text-slate-200 transition hover:bg-slate-800"
              >
                I’ll configure reminders later
              </button>
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="rounded-[32px] border border-slate-800 bg-slate-900 p-8">
            <h2 className="text-2xl font-semibold">You’re ready to go</h2>

            <div className="mt-6 space-y-3">
              {[
                ["Step 1", "Welcome", "Complete"],
                [
                  "Step 2",
                  "Upload invoice",
                  selectedInvoice ? "Complete" : "Skipped",
                ],
                [
                  "Step 3",
                  "Review details",
                  selectedInvoice ? "Complete" : "Skipped",
                ],
                [
                  "Step 4",
                  "Payment link",
                  payLinkSaved ? "Complete" : "Skipped",
                ],
                [
                  "Step 5",
                  "Payment reminders",
                  remindersChoice === "done"
                    ? "Complete"
                    : remindersChoice === "later"
                    ? "Skipped"
                    : status?.onboarding.configured_reminder_schedule
                    ? "Complete"
                    : "Skipped",
                ],
              ].map(([stepNumber, label, result]) => (
                <div
                  key={`${stepNumber}-${label}`}
                  className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm"
                >
                  <span className="font-semibold">{stepNumber}</span>
                  {" — "}
                  <span>{label}</span>
                  {" — "}
                  <span
                    className={
                      result === "Complete"
                        ? "font-semibold text-emerald-300"
                        : "font-semibold text-amber-300"
                    }
                  >
                    {result}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={finishOnboarding}
              disabled={finishing}
              className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {finishing ? "Opening dashboard..." : "Finish and open dashboard"}
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}