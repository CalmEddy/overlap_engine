# Disable Auth and Payments - Make App Functional

## Overview
Deactivate Supabase authentication, OAuth, and Stripe payment configurations to get the core overlap engine working without external dependencies. The app should function with just OpenAI API access.

## Current Issues
1. **Dependencies not installed** - `node_modules` missing
2. **Incorrect OpenAI API usage** - `client.responses.create()` doesn't exist, should use `client.chat.completions.create()`
3. **Auth blocking access** - `requireUser()` redirects to login, blocking engine access
4. **Credit checks blocking** - API route checks credits/subscription before allowing report generation
5. **Missing environment variables** - Need at minimum OpenAI API key

## Implementation Steps

### 1. Install Dependencies
- Run `npm install` to install all packages

### 2. Fix OpenAI API Implementation
**File**: `lib/openai.ts`
- Replace `client.responses.create()` with `client.chat.completions.create()`
- Update response handling:
  - Change `phase1Response.output_text` to `phase1Response.choices[0].message.content`
  - Change `phase2Response.output_text` to `phase2Response.choices[0].message.content`
- Update model default to a valid OpenAI model (e.g., "gpt-4" or "gpt-3.5-turbo")

### 3. Bypass Authentication
**File**: `lib/auth.ts`
- Modify `requireUser()` to return a mock user object instead of checking Supabase
- Return: `{ id: "dev-user", email: "dev@example.com" }`
- Remove redirect to `/login`

### 4. Bypass Subscription/Credit Checks
**File**: `lib/subscription.ts`
- Modify `getUserAccess()` to always return `{ active: true, credits: 999 }`
- Modify `decrementCredit()` to be a no-op (do nothing, just return)

### 5. Simplify API Route
**File**: `app/api/report/route.ts`
- Remove Supabase auth check (lines 10-15)
- Remove credit/subscription checks (lines 17-23)
- Remove `decrementCredit()` call (line 26)
- Keep the core report generation logic

### 6. Simplify Engine Page
**File**: `app/engine/page.tsx`
- Keep `requireUser()` call (will now return mock user)
- Keep `getUserAccess()` call (will now return unlimited credits)
- Display can remain the same

### 7. Simplify Billing Page
**File**: `app/billing/page.tsx`
- Keep `requireUser()` and `getUserAccess()` calls
- Add a message indicating billing is disabled in development mode
- Optionally disable the form or show a message

### 8. Create Minimal Environment File
**File**: `.env.local` (create new)
- Add only: `OPENAI_API_KEY=your_key_here`
- Optionally: `OPENAI_MODEL=gpt-4` (or another valid model)

## Files to Modify

1. `lib/openai.ts` - Fix API calls and response handling
2. `lib/auth.ts` - Return mock user instead of checking Supabase
3. `lib/subscription.ts` - Return mock unlimited access
4. `app/api/report/route.ts` - Remove auth and credit checks
5. `app/billing/page.tsx` - Add development mode message
6. `.env.local` - Create with OpenAI API key only

## Files to Leave Unchanged (for future re-enablement)
- `lib/supabase-server.ts`
- `lib/supabase-browser.ts`
- `lib/stripe.ts`
- `app/api/stripe/*` routes
- `app/auth/callback/route.ts`
- `app/login/page.tsx`

## Testing Checklist
- [ ] `npm install` completes successfully
- [ ] `npm run dev` starts without errors
- [ ] Can access `/engine` page without login redirect
- [ ] Can generate reports without auth/credit errors
- [ ] OpenAI API calls work correctly
- [ ] Reports are generated and displayed

