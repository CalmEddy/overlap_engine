// Temporarily disabled: Supabase subscription checks bypassed for development
// Returns unlimited access instead of checking database

export async function getUserAccess(userId: string) {
  // Return unlimited access for development
  return { active: true, credits: 999 };
}

export async function decrementCredit(userId: string) {
  // No-op: credits are not actually decremented in development mode
  return;
}
