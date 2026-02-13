import { requireUser } from "@/lib/auth";
import { BILLING_PLANS } from "@/lib/billing-config";
import { getUserAccess } from "@/lib/subscription";

export default async function BillingPage() {
  const user = await requireUser();
  const access = await getUserAccess(user.id);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Billing</h1>
      <p>Status: {access.active ? "Active" : "Inactive"}</p>
      <p>Credits remaining: {access.credits}</p>
      <form action="/api/stripe/checkout" method="POST" className="space-y-3">
        {BILLING_PLANS.map((plan) => (
          <label key={plan.code} className="flex items-center gap-2 rounded border border-slate-700 p-3">
            <input type="radio" name="planCode" value={plan.code} required />
            <span>{plan.name} — {plan.monthlyCredits} reports/month</span>
          </label>
        ))}
        <button className="rounded bg-emerald-600 px-4 py-2" type="submit">Checkout</button>
      </form>
    </div>
  );
}
