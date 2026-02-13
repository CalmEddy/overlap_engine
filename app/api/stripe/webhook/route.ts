import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { planByPrice } from "@/lib/billing-config";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

function mapStatus(status: Stripe.Subscription.Status) {
  if (["active", "trialing"].includes(status)) return "active";
  if (["past_due", "unpaid"].includes(status)) return "past_due";
  return "canceled";
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook secret missing" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const subscription =
      event.type === "checkout.session.completed"
        ? await stripe.subscriptions.retrieve((event.data.object as Stripe.Checkout.Session).subscription as string)
        : (event.data.object as Stripe.Subscription);

    const userId = String(subscription.metadata.userId ?? "");
    const priceId = subscription.items.data[0]?.price?.id ?? "";
    const plan = planByPrice(priceId);

    if (userId) {
      await admin
        .from("profiles")
        .upsert({
          id: userId,
          subscription_status: mapStatus(subscription.status),
          stripe_subscription_id: subscription.id,
          plan_code: plan?.code ?? null,
          credits_remaining: plan?.monthlyCredits ?? 0,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
        });
    }
  }

  return NextResponse.json({ received: true });
}
