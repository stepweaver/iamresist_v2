-- Milestone 1: owned audience layer (Resistance Brief subscribers)

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending',
  source text null,
  consent_version text null,
  consent_text text null,
  signup_ip_hash text null,
  confirmed_ip_hash text null,
  user_agent text null,
  confirmed_at timestamptz null,
  unsubscribed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscribers_status_check'
  ) then
    alter table public.subscribers
      add constraint subscribers_status_check
      check (status in ('pending', 'active', 'unsubscribed'));
  end if;
end $$;

create index if not exists subscribers_created_at_idx on public.subscribers (created_at desc);

