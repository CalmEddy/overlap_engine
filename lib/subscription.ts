import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function getUserAccess(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_status, credits_remaining")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return { active: false, credits: 0 };
  }

  const active = ["active", "trialing"].includes(data.subscription_status ?? "");
  return { active, credits: data.credits_remaining ?? 0 };
}

export async function decrementCredit(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decrement_credit", { user_id: userId });
  if (error) {
    throw new Error(`Unable to decrement credit: ${error.message}`);
  }
}
