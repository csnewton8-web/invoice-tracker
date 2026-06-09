import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function unixToIso(value?: number | null) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function planFromStatus(status: Stripe.Subscription.Status) {
  return status === "active" || status === "trialing" || status === "past_due"
    ? "starter"
    : "free";
}

async function updateCompanyFromSubscription(
  subscription: Stripe.Subscription,
  fallbackCompanyId?: string | null
) {
  const supabase = createAdminClient();

  const companyId = subscription.metadata?.companyId || fallbackCompanyId;
  const firstItem = subscription.items.data[0];

  const updatePayload = {
    stripe_customer_id:
      typeof subscription.customer === "string" ? subscription.customer : null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: firstItem?.price?.id || null,
    subscription_status: subscription.status,
    current_period_end: unixToIso(firstItem?.current_period_end ?? null),
    plan: planFromStatus(subscription.status),
    updated_at: new Date().toISOString(),
  };

  if (companyId) {
    const { error } = await supabase
      .from("companies")
      .update(updatePayload)
      .eq("id", companyId);

    if (error) {
      console.error("Failed to update company from subscription by company ID:", {
        companyId,
        subscriptionId: subscription.id,
        error,
      });

      throw new Error("Failed to update company subscription");
    }

    return;
  }

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null;

  if (!customerId) {
    throw new Error("Subscription has no companyId metadata or customer ID");
  }

  const { error } = await supabase
    .from("companies")
    .update(updatePayload)
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update company from subscription by customer ID:", {
      customerId,
      subscriptionId: subscription.id,
      error,
    });

    throw new Error("Failed to update company subscription");
  }
}

async function markCompanyPastDueFromInvoice(invoice: Stripe.Invoice) {
  const supabase = createAdminClient();

  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : null;

  if (!customerId) return;

  const { error } = await supabase
    .from("companies")
    .update({
      subscription_status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to mark company past due from invoice:", {
      customerId,
      invoiceId: invoice.id,
      error,
    });

    throw new Error("Failed to update payment status");
  }
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error("Missing Stripe webhook signature or webhook secret");
    return jsonError("Webhook not configured", 400);
  }

  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: unknown) {
    console.error("Stripe webhook signature verification failed:", error);
    return jsonError("Invalid webhook signature", 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode !== "subscription") {
          break;
        }

        const companyId =
          session.metadata?.companyId || session.client_reference_id || null;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;

        if (!subscriptionId) {
          console.error("Checkout session completed without subscription ID:", {
            sessionId: session.id,
            companyId,
          });

          break;
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await updateCompanyFromSubscription(subscription, companyId);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await updateCompanyFromSubscription(subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await markCompanyPastDueFromInvoice(invoice);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

const subscriptionId =
  typeof (invoice as any).subscription === "string"
    ? (invoice as any).subscription
    : typeof (invoice as any).parent?.subscription_details?.subscription === "string"
      ? (invoice as any).parent.subscription_details.subscription
      : null;

if (subscriptionId) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await updateCompanyFromSubscription(subscription);
}

        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error("Stripe webhook handler failed:", {
      type: event.type,
      eventId: event.id,
      error,
    });

    return jsonError("Webhook handler failed", 500);
  }
}