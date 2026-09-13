-- Hanna & Ada DIAG PRO — tuning/licensing/audit core
-- Safe-by-default schema. This migration does not contain ECU binaries, calibration data,
-- security bypasses, immobilizer bypasses, or emissions-delete logic.

create extension if not exists pgcrypto;

create type tuning_product_kind as enum ('stage','premium_character','addon');
create type tuning_entitlement_status as enum ('active','revoked','consumed');
create type flash_session_status as enum ('created','preflight_failed','ready','programming','verifying','verified','recovery_required','recovered','aborted');
create type flash_gate_state as enum ('unknown','pass','fail','not_required');

create table if not exists tuning_products (
  id text primary key,
  kind tuning_product_kind not null,
  stage smallint,
  name text not null,
  price_eur numeric(10,2) not null check (price_eur >= 0),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  constraint stage_number_valid check ((kind = 'stage' and stage between 1 and 7) or (kind <> 'stage' and stage is null))
);

comment on constraint stage_number_valid on tuning_products is
  'Numbered tuning tiers may use Stage 1-7. Stages 4-7 are advanced custom tiers and are not seeded as fixed-price SKUs until individually configured.';

insert into tuning_products (id,kind,stage,name,price_eur,metadata) values
('stage-1-road','stage',1,'Stage 1 — Road Performance',89,'{"marketing":{"label":"UP TO +50 hp / +80 Nm"}}'),
('stage-2-sport','stage',2,'Stage 2 — Sport Hardware',149,'{"marketing":{"label":"UP TO +80 hp / +130 Nm"}}'),
('stage-3-track-fi','stage',3,'Stage 3 — Track / Forced Induction',249,'{"marketing":{"label":"UP TO +120 hp"},"priceQualifier":"base"}'),
('m5-character','premium_character',null,'M5 Character / Booster',179,'{"separateProduct":true,"rule":"Vehicle-specific compatible M62/M62TU calibration only; never blind S62/M5 binary copy"}'),
('addon-m5-character-booster','addon',null,'M5 Character Booster',49,'{}'),
('addon-exhaust-pack','addon',null,'Exhaust Pack',39,'{"compatibleHardwareRequired":true}'),
('addon-throttle-sport-plus','addon',null,'Throttle Sport+',29,'{}'),
('addon-custom-dyno','addon',null,'Custom Dyno',199,'{}')
on conflict (id) do update set
  kind = excluded.kind,
  stage = excluded.stage,
  name = excluded.name,
  price_eur = excluded.price_eur,
  metadata = excluded.metadata;

create table if not exists ecu_stock_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  vin text not null,
  vehicle_profile text not null,
  ecu_family text not null,
  ecu_hw text not null,
  ecu_sw text not null,
  stock_hash_sha256 text not null check (length(stock_hash_sha256) = 64),
  backup_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(owner_id,vin,ecu_family,ecu_hw,ecu_sw,stock_hash_sha256)
);

create table if not exists tuning_entitlements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  product_id text not null references tuning_products(id),
  vin text not null,
  ecu_family text not null,
  ecu_hw text not null,
  ecu_sw text not null,
  stock_hash_sha256 text not null check (length(stock_hash_sha256) = 64),
  status tuning_entitlement_status not null default 'active',
  purchased_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(owner_id,product_id,vin,ecu_hw,ecu_sw,stock_hash_sha256)
);

create table if not exists calibration_manifests (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references tuning_products(id),
  vehicle_profile text not null,
  ecu_family text not null,
  compatible_hw text[] not null default '{}',
  compatible_sw text[] not null default '{}',
  required_stock_hashes text[] not null default '{}',
  calibration_hash_sha256 text not null check (length(calibration_hash_sha256) = 64),
  checksum_scheme text,
  signature_required boolean not null default false,
  validation_state text not null default 'unverified' check (validation_state in ('unverified','validated','blocked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists flash_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  entitlement_id uuid references tuning_entitlements(id),
  vin text not null,
  ecu_family text not null,
  ecu_hw text not null,
  ecu_sw text not null,
  stock_hash_sha256 text not null,
  calibration_manifest_id uuid references calibration_manifests(id),
  status flash_session_status not null default 'created',
  protocol_gate flash_gate_state not null default 'unknown',
  voltage_gate flash_gate_state not null default 'unknown',
  ecu_identity_gate flash_gate_state not null default 'unknown',
  hw_sw_gate flash_gate_state not null default 'unknown',
  stock_backup_gate flash_gate_state not null default 'unknown',
  stock_hash_gate flash_gate_state not null default 'unknown',
  compatibility_gate flash_gate_state not null default 'unknown',
  checksum_gate flash_gate_state not null default 'unknown',
  authorization_gate flash_gate_state not null default 'unknown',
  explicit_confirmation_gate flash_gate_state not null default 'unknown',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists flash_audit_events (
  id bigint generated always as identity primary key,
  flash_session_id uuid not null references flash_sessions(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','error','critical')),
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function flash_session_all_gates_pass(p_session uuid)
returns boolean
language sql
stable
as $$
  select coalesce((
    select protocol_gate = 'pass'
       and voltage_gate = 'pass'
       and ecu_identity_gate = 'pass'
       and hw_sw_gate = 'pass'
       and stock_backup_gate = 'pass'
       and stock_hash_gate = 'pass'
       and compatibility_gate = 'pass'
       and checksum_gate = 'pass'
       and authorization_gate = 'pass'
       and explicit_confirmation_gate = 'pass'
    from flash_sessions where id = p_session
  ), false);
$$;

-- The application must call flash_session_all_gates_pass() immediately before any
-- write/flash operation. Database state alone is not permission to program an ECU;
-- transport-layer verification and physical voltage checks are still mandatory.
