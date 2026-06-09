import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { getStripe } from "@/lib/stripe";
import { canManageBilling } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appUrl) {
      console.error("Missing NEXT_PUBLIC_APP_URL");
      return jsonError("Billing is not configured", 500);
    }

    const { supabase, companyId, user, role } =
      await requireCurrentCompany(req);

    if (!canManageBilling(role)) {
      return jsonError("You do not have permission to manage billing", 403);
    }

    const { data: company, error } = await supabase
      .from("companies")
      .select("id, name, billing_email, stripe_customer_id")
      .eq("id", companyId)
      .single();

    if (error || !company) {
      console.error("Failed to load company for billing portal:", error);
      return jsonError("Company not found", 404);
    }

    const stripe = getStripe();

    let stripeCustomerId = company.stripe_customer_id as string | null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: company.billing_email || user.email || undefined,
        name: company.name || undefined,
        metadata: {
          companyId: company.id,
        },
      });

      stripeCustomerId = customer.id;

      const { error: updateError } = await supabase
        .from("companies")
        .update({
          stripe_customer_id: stripeCustomerId,
        })
        .eq("id", company.id);

      if (updateError) {
        console.error("Failed to save Stripe customer ID:", updateError);
        return jsonError("Could not prepare billing account", 500);
      }
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Billing portal route error:", error);
    return jsonError("Failed to create billing portal session", 500);
  }
}