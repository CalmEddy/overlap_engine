# John Branyan's Overlap Comedy Engine

Production-ready MVP using Next.js App Router + TypeScript, Supabase Auth, Stripe subscriptions, and OpenAI two-phase report generation.

## What this app does
- Auth via Supabase (email/password + magic link)
- Subscription billing via Stripe Checkout
- Stripe webhook synchronization for access revocation
- Monthly report credits by plan
- Stateless two-phase report generation pipeline with server-side prompt protection

## Routes
- `/login` - authentication
- `/billing` - choose a subscription and launch Stripe Checkout
- `/engine` - submit premise + style and generate report
- `/api/report` - protected report generation endpoint
- `/api/stripe/checkout` - create checkout session
- `/api/stripe/webhook` - verify stripe signature and sync profile status

## Environment variables
Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STUDIO=
STRIPE_PRICE_PRO=
STRIPE_PRICE_PROFESSIONAL=
```

## Supabase setup
1. Enable Email auth providers in Supabase.
2. Add redirect URL: `http://localhost:3000/auth/callback`.
3. Run SQL:

```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  subscription_status text default 'canceled',
  plan_code text,
  credits_remaining integer default 0,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

create or replace function decrement_credit(user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update profiles
  set credits_remaining = greatest(credits_remaining - 1, 0),
      updated_at = now()
  where id = user_id;
end;
$$;
```

## Stripe setup
1. Create 3 recurring prices in Stripe for Studio/Pro/Professional.
2. Put price IDs into env vars.
3. Add webhook endpoint locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

4. Copy signing secret into `STRIPE_WEBHOOK_SECRET`.

## Local development
```bash
npm install
npm run dev
```

## Tests
```bash
npm run test
```

## Two-phase stateless chat-quality architecture
All prompt engineering lives server-side in `lib/openai.ts`.

1. **Phase 1 (Discovery)** generates strict JSON with mechanical overlap anchors.
2. **Phase 2 (Reauthor)** receives style contract + phase1 JSON and rewrites into final report.
3. The phase2 prompt includes a hidden self-revision checklist (scene/certainty/variety/anchor checks) so each API call behaves like a refined chat continuation without storing chat memory.
4. Client only sends `{ premise, styleId }`. Prompts never leave server routes.

## Key file map
- `app/api/report/route.ts` - gated report generation endpoint
- `lib/openai.ts` - two-phase generation + prompt contracts + JSON enforcement
- `lib/style-contracts.ts` - binding style rules
- `app/api/stripe/webhook/route.ts` - Stripe signature verification + status sync
- `app/billing/page.tsx` and `app/engine/page.tsx` - protected MVP UI
- `lib/schemas.ts` and `tests/schemas.test.ts` - runtime and test validation guards
