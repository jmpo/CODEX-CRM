-- Supabase/Postgres schema (MVP)

create extension if not exists "uuid-ossp";

create type lead_stage as enum (
  'nuevo',
  'contactado',
  'cualificado',
  'cerrado_venta',
  'cerrado_no_venta'
);

create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  source text not null default 'facebook',
  stage lead_stage not null default 'nuevo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_events (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  event_name text not null,
  event_time timestamptz not null default now(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists facebook_pages (
  id uuid primary key default uuid_generate_v4(),
  page_id text not null,
  access_token text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_stage on leads(stage);
create index if not exists idx_lead_events_lead_id on lead_events(lead_id);
