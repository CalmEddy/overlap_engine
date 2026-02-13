export type PlanCode = "studio" | "pro" | "professional";

export type PlanConfig = {
  code: PlanCode;
  name: string;
  monthlyCredits: number;
  stripePriceId: string;
};

export const BILLING_PLANS: PlanConfig[] = [
  { code: "studio", name: "Studio", monthlyCredits: 6, stripePriceId: process.env.STRIPE_PRICE_STUDIO ?? "" },
  { code: "pro", name: "Pro", monthlyCredits: 20, stripePriceId: process.env.STRIPE_PRICE_PRO ?? "" },
  {
    code: "professional",
    name: "Professional",
    monthlyCredits: 50,
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL ?? ""
  }
];

export function planByPrice(priceId: string): PlanConfig | undefined {
  return BILLING_PLANS.find((p) => p.stripePriceId === priceId);
}
