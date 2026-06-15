create table if not exists public.xero_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists xero_oauth_states_state_idx
  on public.xero_oauth_states(state);

create index if not exists xero_oauth_states_cleanup_idx
  on public.xero_oauth_states(expires_at, used_at);