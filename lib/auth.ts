// Temporarily disabled: Supabase auth bypassed for development
// Returns a mock user instead of checking authentication
export async function requireUser() {
  return {
    id: "dev-user",
    email: "dev@example.com"
  };
}
