-- Supabase/Postgres schema (MVP)

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_lead_stage') then
    create type crm_lead_stage as enum (
      'nuevo',
      'contactado',
      'cualificado',
      'cerrado_venta',
      'cerrado_no_venta'
    );
  end if;
end $$;

create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  meta_lead_id text,
  full_name text not null,
  email text,
  phone text,
  source text not null default 'facebook',
  stage crm_lead_stage not null default 'nuevo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads(id) on delete cascade,
  event_name text not null,
  event_time timestamptz not null default now(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists crm_facebook_pages (
  id uuid primary key default gen_random_uuid(),
  page_id text not null,
  access_token text not null,
  name text,
  tenant_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_leads_stage on crm_leads(stage);
create index if not exists idx_crm_leads_meta_lead_id on crm_leads(meta_lead_id);
create index if not exists idx_crm_lead_events_lead_id on crm_lead_events(lead_id);
create unique index if not exists idx_crm_facebook_pages_page_id on crm_facebook_pages(page_id);
