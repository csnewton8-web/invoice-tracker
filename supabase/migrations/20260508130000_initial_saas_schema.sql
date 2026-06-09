-- Initial production schema for the invoice tracker SaaS.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_user_id uuid references auth.users(id) on delete set null,
  plan text not null default 'free',
  subscription_status text not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_end timestamptz,
  billing_email text,
  onboarding_completed boolean not null default false,
  is_active boolean not null default true,
  invoice_upload_count integer not null default 0,
  logo_url text,
  logo_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'finance', 'viewer')) default 'admin',
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'finance', 'viewer')) default 'viewer',
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier text,
  invoice_number text,
  po_number text,
  invoice_date date,
  due_date date,
  payment_terms text,
  total numeric(14,2),
  currency text,
  confidence numeric(5,4),
  extraction_method text,
  fingerprint text,
  file_name text,
  file_path text,
  file_size bigint,
  raw_text text,
  notes text[] not null default '{}',
  is_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, fingerprint)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, email)
);

create table if not exists public.notification_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default true,
  frequency text not null default 'weekly',
  day_of_week integer not null default 1 check (day_of_week between 0 and 6),
  send_time text not null default '09:00',
  timezone text not null default 'Europe/London',
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  payment_link text,
  pay_link_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_memberships_user_active
on public.company_memberships(user_id, is_active);

create index if not exists idx_invoices_company_created
on public.invoices(company_id, created_at desc);

create index if not exists idx_invoices_company_due
on public.invoices(company_id, due_date)
where is_paid = false;

create index if not exists idx_notification_recipients_company
on public.notification_recipients(company_id, is_active);

create index if not exists idx_audit_logs_company_created
on public.audit_logs(company_id, created_at desc);

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.has_company_role(
  target_company_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and is_active = true
      and role = any(allowed_roles)
  );
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.company_invitations enable row level security;
alter table public.invoices enable row level security;
alter table public.suppliers enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_settings enable row level security;
alter table public.user_app_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_self"
on public.profiles
for select
using (id = auth.uid());

create policy "profiles_upsert_self"
on public.profiles
for all
using (id = auth.uid())
with check (id = auth.uid());

create policy "companies_member_select"
on public.companies
for select
using (public.is_company_member(id));

create policy "companies_admin_update"
on public.companies
for update
using (public.has_company_role(id, array['admin']))
with check (public.has_company_role(id, array['admin']));

create policy "memberships_member_select"
on public.company_memberships
for select
using (public.is_company_member(company_id));

create policy "memberships_admin_manage"
on public.company_memberships
for all
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

create policy "company_invitations_admin_manage"
on public.company_invitations
for all
using (public.has_company_role(company_id, array['admin']))
with check (public.has_company_role(company_id, array['admin']));

create policy "invoices_member_select"
on public.invoices
for select
using (public.is_company_member(company_id));

create policy "invoices_finance_insert"
on public.invoices
for insert
with check (
  public.has_company_role(company_id, array['admin','finance'])
);

create policy "invoices_finance_update"
on public.invoices
for update
using (
  public.has_company_role(company_id, array['admin','finance'])
)
with check (
  public.has_company_role(company_id, array['admin','finance'])
);

create policy "invoices_finance_delete"
on public.invoices
for delete
using (
  public.has_company_role(company_id, array['admin','finance'])
);

create policy "suppliers_member_select"
on public.suppliers
for select
using (public.is_company_member(company_id));

create policy "suppliers_finance_manage"
on public.suppliers
for all
using (
  public.has_company_role(company_id, array['admin','finance'])
)
with check (
  public.has_company_role(company_id, array['admin','finance'])
);

create policy "recipients_member_select"
on public.notification_recipients
for select
using (public.is_company_member(company_id));

create policy "recipients_admin_manage"
on public.notification_recipients
for all
using (
  public.has_company_role(company_id, array['admin'])
)
with check (
  public.has_company_role(company_id, array['admin'])
);

create policy "notification_settings_member_select"
on public.notification_settings
for select
using (public.is_company_member(company_id));

create policy "notification_settings_admin_manage"
on public.notification_settings
for all
using (
  public.has_company_role(company_id, array['admin'])
)
with check (
  public.has_company_role(company_id, array['admin'])
);

create policy "user_app_settings_self"
on public.user_app_settings
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "audit_logs_member_select"
on public.audit_logs
for select
using (public.is_company_member(company_id));

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "invoice_files_member_read"
on storage.objects
for select
using (
  bucket_id = 'invoices'
  and public.is_company_member((split_part(name, '/', 1))::uuid)
);

create policy "invoice_files_finance_insert"
on storage.objects
for insert
with check (
  bucket_id = 'invoices'
  and public.has_company_role(
    (split_part(name, '/', 1))::uuid,
    array['admin','finance']
  )
);

create policy "invoice_files_finance_delete"
on storage.objects
for delete
using (
  bucket_id = 'invoices'
  and public.has_company_role(
    (split_part(name, '/', 1))::uuid,
    array['admin','finance']
  )
);