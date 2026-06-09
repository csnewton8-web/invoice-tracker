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
    const starterPriceId = process.env.STRIPE_STARTER_PRICE_ID;

    if (!appUrl || !starterPriceId) {
      console.error("Missing billing environment variables");
      return jsonError("Billing is not configured", 500);
    }

    const { supabase, companyId, user, role } =
      await requireCurrentCompany(req);

    if (!canManageBilling(role)) {
      return jsonError("You do not have permission to manage billing", 403);
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, billing_email, plan, stripe_customer_id")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      console.error("Failed to load company for checkout:", companyError);
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

      const { error: updateCustomerError } = await supabase
        .from("companies")
        .update({
          stripe_customer_id: stripeCustomerId,
        })
        .eq("id", company.id);

      if (updateCustomerError) {
        console.error("Failed to save Stripe customer ID:", updateCustomerError);
        return jsonError("Could not prepare billing account", 500);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      client_reference_id: company.id,
      line_items: [
        {
          price: starterPriceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
      metadata: {
        companyId: company.id,
      },
      subscription_data: {
        metadata: {
          companyId: company.id,
        },
      },
    });

    if (!session.url) {
      console.error("Stripe checkout session missing URL:", session.id);
      return jsonError("Could not create checkout session", 500);
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Stripe checkout route error:", error);
    return jsonError("Failed to create checkout session", 500);
  }
}