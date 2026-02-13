import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { BILLING_PLANS } from "@/lib/billing-config";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const planCode = String(formData.get("planCode") ?? "");
  const plan = BILLING_PLANS.find((p) => p.code === planCode);
  if (!plan || !plan.stripePriceId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${new URL(request.url).origin}/billing?success=1`,
    cancel_url: `${new URL(request.url).origin}/billing?canceled=1`,
    customer_email: data.user.email,
    metadata: { userId: data.user.id, planCode }
  });

  return NextResponse.redirect(session.url ?? `${new URL(request.url).origin}/billing`);
}
