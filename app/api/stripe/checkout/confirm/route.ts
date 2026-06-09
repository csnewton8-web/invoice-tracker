import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireCurrentCompany } from "@/lib/current-company";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unixToIso(value?: number | null) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function getPlanFromSubscriptionStatus(status: Stripe.Subscription.Status) {
  if (status === "active" || status === "trialing" || status === "past_due") {
    return "starter";
  }

  return "free";
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireCurrentCompany(req);
    const supabaseAdmin = createAdminClient();

    const body = await req.json();
    const sessionId =
      typeof body.session_id === "string" ? body.session_id.trim() : "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing checkout session ID" },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const sessionCompanyId =
      checkoutSession.metadata?.companyId ||
      checkoutSession.client_reference_id;

    if (sessionCompanyId !== companyId) {
      return NextResponse.json(
        { error: "Checkout session does not belong to this workspace" },
        { status: 403 }
      );
    }

    if (checkoutSession.status !== "complete") {
      return NextResponse.json({
        confirmed: false,
        status: checkoutSession.status,
        payment_status: checkoutSession.payment_status,
        message: "Checkout has not completed yet.",
      });
    }

    const subscription =
      typeof checkoutSession.subscription === "string"
        ? await stripe.subscriptions.retrieve(checkoutSession.subscription)
        : checkoutSession.subscription;

    if (!subscription) {
      return NextResponse.json(
        { error: "Stripe subscription was not found" },
        { status: 500 }
      );
    }

    const stripeSubscription = subscription as Stripe.Subscription;
    const firstItem = stripeSubscription.items.data[0];

    const plan = getPlanFromSubscriptionStatus(stripeSubscription.status);

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("companies")
      .update({
        stripe_customer_id:
          typeof checkoutSession.customer === "string"
            ? checkoutSession.customer
            : null,
        stripe_subscription_id: stripeSubscription.id,
        stripe_price_id: firstItem?.price?.id || null,
        subscription_status: stripeSubscription.status,
        current_period_end: unixToIso(
          (stripeSubscription as any).current_period_end ??
            firstItem?.current_period_end ??
            null
        ),
        plan,
      })
      .eq("id", companyId)
      .select(
        "id, name, billing_email, plan, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status, current_period_end, invoice_upload_count, logo_url, logo_storage_path"
      );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const updatedCompany = updatedRows?.[0];

    if (!updatedCompany) {
      return NextResponse.json(
        { error: "No company row was updated" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      confirmed: true,
      company: updatedCompany,
      checkout: {
        status: checkoutSession.status,
        payment_status: checkoutSession.payment_status,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to confirm checkout" },
      { status: 500 }
    );
  }
}