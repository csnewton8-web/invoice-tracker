import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceDropzone } from "@/components/invoice-dropzone";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { InvoiceRecord } from "@/types/invoice";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/auth");
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Supplier invoice tracker</h1>
            <p className="mt-2 text-slate-600">
              Signed in as {userData.user.email}
            </p>
          </div>

          <form action="/auth/signout" method="post">
            <button className="rounded-xl border bg-white px-4 py-2">
              Sign out
            </button>
          </form>
        </div>

        <InvoiceDropzone />



        <InvoiceWorkspace invoices={(invoices || []) as InvoiceRecord[]} />


      </div>
    </main>
  );
}