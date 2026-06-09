import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 md:py-14">
        <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo/flashfox-icon.png"
              alt="FlashFox"
              width={40}
              height={40}
              priority
            />
            <div>
              <div className="text-2xl font-semibold leading-none">FlashFox</div>
              <div className="mt-1 text-xs text-slate-400">
                Fast. Smart. On Time.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-900"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-200"
            >
              Start free
            </Link>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 md:grid-cols-2 md:py-16">
          <div>
            <div className="mb-5 inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-300">
              Supplier invoice tracking built for speed and clarity
            </div>

            <div className="mb-6">
              <Image
                src="/logo/flashfox-logo.png"
                alt="FlashFox"
                width={300}
                height={94}
                priority
                className="h-auto w-auto"
              />
            </div>

            <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
              Never miss a supplier payment again.
            </h1>

            <p className="mt-6 max-w-2xl text-xl text-slate-200">
              Upload invoices in seconds and receive automated due-date alerts.
            </p>

            <p className="mt-4 max-w-2xl text-lg text-slate-300">
              FlashFox gives small businesses a faster way to store invoices,
              review payment status, monitor due dates, and stay organised
              without relying on spreadsheets or scattered email trails.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="rounded-2xl bg-white px-6 py-3 font-medium text-slate-950 transition hover:bg-slate-200"
              >
                Create your account
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-slate-700 px-6 py-3 font-medium text-slate-200 transition hover:bg-slate-900"
              >
                Log in
              </Link>
            </div>

            <div className="mt-10 grid gap-4 text-sm text-slate-300 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="font-medium text-white">Upload invoices</div>
                <p className="mt-2">
                  Store PDF supplier invoices in one organised workspace.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="font-medium text-white">Track due dates</div>
                <p className="mt-2">
                  See what is due soon, overdue, unpaid, or already settled.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="font-medium text-white">Stay on time</div>
                <p className="mt-2">
                  Use reminders and status tracking so payments do not get
                  missed.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-blue-500/30 bg-slate-900 p-6 shadow-2xl shadow-blue-500/10">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Upcoming payments</div>
                <div className="mt-1 text-2xl font-semibold">£18,460 due</div>
              </div>
              <div className="rounded-xl bg-green-500/10 px-3 py-2 text-sm text-green-300">
                4 invoices due this week
              </div>
            </div>

            <div className="space-y-4">
              {[
                {
                  supplier: "Steel Supplies Ltd",
                  amount: "£4,250.00",
                  due: "Due in 2 days",
                  status: "Upcoming",
                  tone: "border-slate-800",
                },
                {
                  supplier: "Northern Tooling Co",
                  amount: "£1,980.00",
                  due: "Overdue by 3 days",
                  status: "Overdue",
                  tone: "border-red-500/30 bg-red-500/5",
                },
                {
                  supplier: "Precision Components UK",
                  amount: "£6,740.00",
                  due: "Due today",
                  status: "Due today",
                  tone: "border-amber-500/30 bg-amber-500/5",
                },
              ].map((invoice) => (
                <div
                  key={`${invoice.supplier}-${invoice.amount}`}
                  className={`rounded-2xl border bg-slate-950 p-4 ${invoice.tone}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-white">
                        {invoice.supplier}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {invoice.due}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-white">
                        {invoice.amount}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {invoice.status}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-sm font-medium text-white">
                Reminder summary
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Overdue, due today, and upcoming invoices can be reviewed in one
                clear workspace.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}