begin;

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists postgis;

create schema if not exists app;

create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.current_org_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  password_hash text not null,
  mfa_secret text,
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  scope text not null check (scope in ('full', 'enroll')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table login_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table login_attempts (
  id bigint generated always as identity primary key,
  email citext not null,
  attempted_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 140),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'America/Chicago',
  household_prefix text not null default 'H' check (household_prefix ~ '^[A-Z]{1,4}$'),
  case_prefix text not null default 'AC' check (case_prefix ~ '^[A-Z]{1,4}$'),
  demo boolean not null default false,
  purge_after timestamptz,
  created_at timestamptz not null default now()
);

create table memberships (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in (
    'owner', 'administrator', 'case_worker', 'field_worker',
    'volunteer_coordinator', 'inventory_manager', 'viewer'
  )),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create unique index memberships_one_owner
  on memberships (organization_id)
  where role = 'owner' and status = 'active';

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  email citext not null,
  role text not null check (role in (
    'owner', 'administrator', 'case_worker', 'field_worker',
    'volunteer_coordinator', 'inventory_manager', 'viewer'
  )),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  invited_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create table counters (
  organization_id uuid not null references organizations (id) on delete cascade,
  kind text not null check (kind in ('household', 'case')),
  value integer not null,
  primary key (organization_id, kind)
);

create table role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

create table case_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);

insert into case_transitions (from_status, to_status) values
  ('new', 'assessment'), ('new', 'active'), ('new', 'closed'),
  ('assessment', 'active'), ('assessment', 'waiting'), ('assessment', 'closed'),
  ('active', 'waiting'), ('active', 'resolved'), ('active', 'closed'),
  ('waiting', 'active'), ('waiting', 'resolved'), ('waiting', 'closed'),
  ('resolved', 'closed'), ('resolved', 'active'),
  ('closed', 'active');

insert into role_permissions (role, permission)
select role, permission
from (
  values
    ('owner'), ('administrator'), ('case_worker'), ('field_worker'),
    ('volunteer_coordinator'), ('inventory_manager'), ('viewer')
) as roles(role)
cross join (
  values
    ('household.read'), ('household.read_contact'), ('household.read_address'), ('household.write'),
    ('case.read'), ('case.read_notes'), ('case.write'), ('case.assign'), ('case.reopen'),
    ('program.read'), ('program.write'),
    ('assistance.write'),
    ('inventory.read'), ('inventory.write'), ('inventory.export'),
    ('volunteer.read'), ('volunteer.write'),
    ('directory.read'), ('directory.write'),
    ('referral.write'),
    ('document.read'), ('document.write'),
    ('report.read'), ('report.export'),
    ('member.invite'), ('member.manage'),
    ('org.manage'), ('org.delete'),
    ('audit.read'), ('notification.read')
) as perms(permission)
where role = 'owner';

insert into role_permissions (role, permission)
select 'administrator', permission from role_permissions where role = 'owner' and permission <> 'org.delete';

insert into role_permissions (role, permission) values
  ('case_worker', 'household.read'), ('case_worker', 'household.read_contact'),
  ('case_worker', 'household.read_address'), ('case_worker', 'household.write'),
  ('case_worker', 'case.read'), ('case_worker', 'case.read_notes'),
  ('case_worker', 'case.write'), ('case_worker', 'case.assign'),
  ('case_worker', 'program.read'), ('case_worker', 'assistance.write'),
  ('case_worker', 'inventory.read'), ('case_worker', 'directory.read'),
  ('case_worker', 'referral.write'), ('case_worker', 'document.read'),
  ('case_worker', 'document.write'), ('case_worker', 'report.read'),
  ('case_worker', 'notification.read'),
  ('field_worker', 'household.read'), ('field_worker', 'household.read_contact'),
  ('field_worker', 'household.read_address'), ('field_worker', 'household.write'),
  ('field_worker', 'case.read'), ('field_worker', 'case.read_notes'),
  ('field_worker', 'case.write'), ('field_worker', 'program.read'),
  ('field_worker', 'assistance.write'), ('field_worker', 'inventory.read'),
  ('field_worker', 'directory.read'), ('field_worker', 'document.read'),
  ('field_worker', 'document.write'), ('field_worker', 'notification.read'),
  ('volunteer_coordinator', 'program.read'), ('volunteer_coordinator', 'volunteer.read'),
  ('volunteer_coordinator', 'volunteer.write'), ('volunteer_coordinator', 'directory.read'),
  ('volunteer_coordinator', 'report.read'), ('volunteer_coordinator', 'notification.read'),
  ('inventory_manager', 'program.read'), ('inventory_manager', 'inventory.read'),
  ('inventory_manager', 'inventory.write'), ('inventory_manager', 'inventory.export'),
  ('inventory_manager', 'report.read'), ('inventory_manager', 'notification.read'),
  ('viewer', 'household.read'), ('viewer', 'case.read'), ('viewer', 'program.read'),
  ('viewer', 'directory.read'), ('viewer', 'report.read'), ('viewer', 'notification.read');

create or replace function app.member_role() returns text
language sql stable security definer set search_path = public, app as $$
  select m.role
  from memberships m
  where m.user_id = app.current_user_id()
    and m.organization_id = app.current_org_id()
    and m.status = 'active'
$$;

create or replace function app.allowed(perm text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1
    from memberships m
    join role_permissions p on p.role = m.role and p.permission = perm
    where m.user_id = app.current_user_id()
      and m.organization_id = app.current_org_id()
      and m.status = 'active'
  )
$$;

create or replace function app.allocate_code(p_org uuid, p_kind text) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  n integer;
  prefix text;
  start_at integer;
begin
  start_at := case p_kind when 'case' then 2041 else 1042 end;
  insert into counters (organization_id, kind, value)
  values (p_org, p_kind, start_at)
  on conflict (organization_id, kind) do update set value = counters.value + 1
  returning value into n;
  select case p_kind when 'case' then case_prefix else household_prefix end
    into prefix
  from organizations
  where id = p_org;
  return prefix || '-' || n::text;
end $$;

create table households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  code text,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  location_label text not null check (char_length(btrim(location_label)) between 1 and 180),
  location_precision text not null default 'neighborhood'
    check (location_precision in ('city', 'zip', 'neighborhood', 'address')),
  street_address text,
  phone text,
  email text,
  geom geography(point, 4326),
  geocode_status text not null default 'untried'
    check (geocode_status in ('untried', 'geocoded', 'manual', 'unavailable')),
  assigned_worker_id uuid references users (id),
  consent_at timestamptz not null,
  consent_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  preferred_name text not null check (char_length(btrim(preferred_name)) between 1 and 120),
  relationship text not null check (relationship in (
    'self', 'spouse', 'partner', 'child', 'parent', 'sibling',
    'grandparent', 'grandchild', 'other_relative', 'unrelated'
  )),
  age_band text check (age_band in ('child', 'youth', 'adult', 'senior')),
  phone text,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table household_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  author_id uuid not null references users (id),
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  created_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 140),
  description text not null default '',
  eligibility text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table program_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,40}$'),
  label text not null,
  field_type text not null check (field_type in ('short_text', 'long_text', 'number', 'date', 'single_select', 'boolean')),
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  unique (program_id, key)
);

create table items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 140),
  unit text not null default 'each',
  low_stock_threshold numeric(12, 2),
  active boolean not null default true,
  unique (organization_id, name)
);

create table stock_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  unique (organization_id, name)
);

create table stock_balances (
  item_id uuid not null references items (id) on delete cascade,
  location_id uuid not null references stock_locations (id) on delete cascade,
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  primary key (item_id, location_id)
);

create table program_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  name text not null,
  unit text not null default 'each',
  tracks_inventory boolean not null default false,
  item_id uuid references items (id),
  active boolean not null default true,
  check (not tracks_inventory or item_id is not null)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  started_on date not null default current_date,
  ended_on date,
  field_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table case_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  program_id uuid references programs (id),
  active boolean not null default true,
  unique (organization_id, name)
);

create table cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  code text,
  case_type_id uuid not null references case_types (id),
  household_id uuid not null references households (id),
  status text not null default 'new' check (status in (
    'new', 'assessment', 'active', 'waiting', 'resolved', 'closed'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_id uuid references users (id),
  opened_on date not null default current_date,
  summary text not null check (char_length(btrim(summary)) between 1 and 180),
  last_transition_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table case_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  author_id uuid not null references users (id),
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  due_on date,
  volunteer_visible boolean not null default false,
  area_label text,
  household_label text,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  starts_at timestamptz not null,
  place_label text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'missed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table assistance_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null references cases (id),
  program_service_id uuid not null references program_services (id),
  quantity numeric(12, 2) not null check (quantity > 0),
  item_id uuid references items (id),
  location_id uuid references stock_locations (id),
  household_code text not null,
  actor_id uuid not null references users (id),
  served_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  item_id uuid not null references items (id),
  location_id uuid not null references stock_locations (id),
  quantity numeric(12, 2) not null check (quantity <> 0),
  reason text not null check (reason in ('receive', 'issue', 'adjust', 'loss')),
  note text,
  assistance_id uuid references assistance_lines (id),
  actor_id uuid references users (id),
  created_at timestamptz not null default now()
);

create table volunteers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  skills text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  volunteer_id uuid not null references volunteers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  role_label text not null default 'General',
  check (ends_at > starts_at)
);

create table volunteer_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  volunteer_id uuid not null references volunteers (id) on delete cascade,
  worked_on date not null default current_date,
  hours numeric(6, 2) not null check (hours > 0 and hours <= 24),
  note text not null default ''
);

create table service_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  category text not null default 'General',
  eligibility text not null default '',
  hours_label text not null default '',
  phone text,
  area_label text not null default '',
  street_address text,
  geom geography(point, 4326),
  geocode_status text not null default 'untried'
    check (geocode_status in ('untried', 'geocoded', 'manual', 'unavailable')),
  last_verified_on date,
  active boolean not null default true
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  kind text not null check (kind in ('internal_program', 'directory')),
  program_id uuid references programs (id),
  service_site_id uuid references service_sites (id),
  packet_need text not null check (char_length(btrim(packet_need)) between 1 and 500),
  packet_contact text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'completed', 'declined')),
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  check (
    (kind = 'internal_program' and program_id is not null)
    or (kind = 'directory' and service_site_id is not null)
  )
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  household_id uuid references households (id) on delete cascade,
  case_id uuid references cases (id) on delete cascade,
  storage_key text not null unique,
  filename text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (household_id is not null or case_id is not null)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  dedupe text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  done_at timestamptz,
  last_error text
);

create table client_mutations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  idempotency_key uuid not null,
  kind text not null,
  payload jsonb not null,
  status text not null check (status in ('applied', 'conflict')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, idempotency_key)
);

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  actor_id uuid references users (id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index households_org_label_idx on households using gin (label gin_trgm_ops);
create index households_geom_idx on households using gist (geom);
create index cases_org_status_idx on cases (organization_id, status);
create index cases_assignee_idx on cases (assignee_id);
create index activity_org_time_idx on activity_events (organization_id, created_at desc);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index service_sites_geom_idx on service_sites using gist (geom);

create or replace function app.assign_household_code() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := app.allocate_code(new.organization_id, 'household');
  end if;
  return new;
end $$;

create or replace function app.assign_case_code() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := app.allocate_code(new.organization_id, 'case');
  end if;
  if not exists (
    select 1 from households h
    where h.id = new.household_id and h.organization_id = new.organization_id
  ) then
    raise exception 'household is not in this organization';
  end if;
  return new;
end $$;

create or replace function app.guard_case_status() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if app.member_role() = 'field_worker' and new.assignee_id is distinct from old.assignee_id then
    raise exception 'you cannot reassign this case' using errcode = '42501';
  end if;
  if old.status is distinct from new.status then
    if not exists (
      select 1 from case_transitions t
      where t.from_status = old.status and t.to_status = new.status
    ) then
      raise exception 'invalid status transition' using errcode = '23514';
    end if;
    if old.status = 'closed' then
      if app.member_role() not in ('owner', 'administrator') then
        raise exception 'only an owner or administrator can reopen a closed case' using errcode = '42501';
      end if;
      if coalesce(btrim(new.last_transition_reason), '') = '' then
        raise exception 'a reason is required to reopen a closed case' using errcode = '23514';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function app.touch_household() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.guard_program_field() returns trigger
language plpgsql as $$
begin
  if new.key ~* '(ssn|social_security|diagnosis|hiv|immigration|passport|biometric|password)' then
    raise exception 'sensitive field denied' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function app.guard_enrollment() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  field_key text;
  required_field record;
begin
  if new.field_values is null then
    new.field_values := '{}'::jsonb;
  end if;
  for field_key in select jsonb_object_keys(new.field_values)
  loop
    if field_key ~* '(ssn|social_security|diagnosis|hiv|immigration|passport|biometric|password)' then
      raise exception 'sensitive field denied' using errcode = '23514';
    end if;
    if not exists (
      select 1 from program_fields pf
      where pf.program_id = new.program_id and pf.key = field_key
    ) then
      raise exception 'unknown field' using errcode = '23514';
    end if;
  end loop;
  for required_field in
    select key from program_fields where program_id = new.program_id and required
  loop
    if coalesce(new.field_values ->> required_field.key, '') = '' then
      raise exception 'missing required field' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

create or replace function app.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.quantity < 0 then
    update stock_balances
      set quantity = quantity + new.quantity
      where item_id = new.item_id
        and location_id = new.location_id
        and quantity + new.quantity >= 0;
    if not found then
      raise exception 'insufficient stock' using errcode = '23514';
    end if;
  else
    insert into stock_balances (item_id, location_id, quantity)
    values (new.item_id, new.location_id, new.quantity)
    on conflict (item_id, location_id) do update
      set quantity = stock_balances.quantity + excluded.quantity;
  end if;
  insert into notifications (organization_id, user_id, kind, title, body, dedupe)
  select i.organization_id, m.user_id, 'low_stock', 'Low stock',
    i.name || ' is at ' || b.quantity::text || ' ' || i.unit,
    'low:' || i.id::text || ':' || to_char(now(), 'YYYY-MM-DD')
  from items i
  join stock_balances b on b.item_id = i.id and b.location_id = new.location_id
  join memberships m on m.organization_id = i.organization_id
    and m.role = 'inventory_manager' and m.status = 'active'
  where i.id = new.item_id
    and i.low_stock_threshold is not null
    and b.quantity <= i.low_stock_threshold
  on conflict (dedupe) do nothing;
  return new;
end $$;

create or replace function app.copy_household_code() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  select h.code into new.household_code
  from cases c
  join households h on h.id = c.household_id
  where c.id = new.case_id and c.organization_id = new.organization_id;
  if new.household_code is null then
    raise exception 'case is not in this organization';
  end if;
  return new;
end $$;

create or replace function app.track() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  payload_old jsonb;
  payload_new jsonb;
  action_name text;
  entity uuid;
  org uuid;
begin
  if tg_op = 'INSERT' then
    payload_new := to_jsonb(new);
    action_name := 'create';
    entity := new.id;
    org := new.organization_id;
  elsif tg_op = 'UPDATE' then
    payload_old := to_jsonb(old);
    payload_new := to_jsonb(new);
    action_name := 'update';
    if tg_table_name = 'cases' then
      if old.status is distinct from new.status then
        action_name := 'status';
      end if;
    end if;
    entity := new.id;
    org := new.organization_id;
  else
    payload_old := to_jsonb(old);
    action_name := 'delete';
    entity := old.id;
    org := old.organization_id;
  end if;
  insert into activity_events (organization_id, actor_id, entity_type, entity_id, action, before, after)
  values (org, app.current_user_id(), tg_argv[0], entity, action_name, payload_old, payload_new);
  if tg_table_name = 'cases' and tg_op = 'UPDATE' then
    if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
      insert into notifications (organization_id, user_id, kind, title, body, dedupe)
      values (
        new.organization_id,
        new.assignee_id,
        'case_assigned',
        'Case assigned',
        new.code || ' was assigned to you',
        'assign:' || new.id::text || ':' || new.assignee_id::text || ':' || clock_timestamp()::text
      );
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger households_code before insert on households
  for each row execute function app.assign_household_code();
create trigger households_touch before update on households
  for each row execute function app.touch_household();
create trigger households_track after insert or update on households
  for each row execute function app.track('household');

create trigger cases_code before insert on cases
  for each row execute function app.assign_case_code();
create trigger cases_status before update on cases
  for each row execute function app.guard_case_status();
create trigger cases_track after insert or update on cases
  for each row execute function app.track('case');

create trigger notes_track after insert on case_notes
  for each row execute function app.track('case_note');
create trigger assistance_code before insert on assistance_lines
  for each row execute function app.copy_household_code();
create trigger assistance_track after insert on assistance_lines
  for each row execute function app.track('assistance');
create trigger stock_apply after insert on stock_movements
  for each row execute function app.apply_stock_movement();
create trigger enrollment_guard before insert or update on enrollments
  for each row execute function app.guard_enrollment();
create trigger field_guard before insert or update on program_fields
  for each row execute function app.guard_program_field();
create trigger referral_track after insert or update on referrals
  for each row execute function app.track('referral');

create or replace function app.field_worker_sees_household(p_household uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from households h
    where h.id = p_household
      and h.organization_id = p_org
      and (
        h.assigned_worker_id = app.current_user_id()
        or exists (
          select 1 from cases c
          where c.household_id = h.id
            and c.assignee_id = app.current_user_id()
            and c.organization_id = h.organization_id
        )
      )
  )
$$;

create or replace view v_households with (security_barrier = true) as
select
  h.id,
  h.organization_id,
  h.code,
  case when app.allowed('household.read_contact') then h.label else 'Household ' || h.code end as label,
  h.location_label,
  h.location_precision,
  case when app.allowed('household.read_address') then h.street_address else null end as street_address,
  case when app.allowed('household.read_contact') then h.phone else null end as phone,
  case when app.allowed('household.read_contact') then h.email else null end as email,
  case
    when h.location_precision = 'address' and not app.allowed('household.read_address') then null
    else st_y(h.geom::geometry)
  end as lat,
  case
    when h.location_precision = 'address' and not app.allowed('household.read_address') then null
    else st_x(h.geom::geometry)
  end as lng,
  h.geocode_status,
  h.assigned_worker_id,
  h.consent_at,
  h.created_at,
  h.updated_at
from households h
where h.organization_id = app.current_org_id()
  and app.allowed('household.read')
  and (
    app.member_role() is distinct from 'field_worker'
    or app.field_worker_sees_household(h.id, h.organization_id)
  );

create or replace view v_people with (security_barrier = true) as
select
  p.id,
  p.organization_id,
  p.household_id,
  case when app.allowed('household.read_contact') then p.preferred_name else initcap(replace(p.relationship, '_', ' ')) end as preferred_name,
  p.relationship,
  p.age_band,
  p.is_primary,
  case when app.allowed('household.read_contact') then p.phone else null end as phone,
  case when app.allowed('household.read_contact') then p.email else null end as email
from people p
join v_households h on h.id = p.household_id;

create or replace view v_assistance_ledger with (security_barrier = true) as
select
  a.id,
  a.organization_id,
  a.quantity,
  a.served_on,
  a.household_code,
  i.name as item_name,
  p.name as program_name
from assistance_lines a
left join items i on i.id = a.item_id
left join program_services ps on ps.id = a.program_service_id
left join programs p on p.id = ps.program_id
where a.organization_id = app.current_org_id()
  and (app.allowed('inventory.read') or app.allowed('case.read_notes') or app.allowed('assistance.write'));

create or replace function app.report_cases()
returns table(status text, priority text, total bigint)
language sql stable security definer set search_path = public, app as $$
  select c.status, c.priority, count(*)
  from cases c
  where c.organization_id = app.current_org_id()
    and app.allowed('report.read')
    and (
      app.member_role() is distinct from 'field_worker'
      or c.assignee_id = app.current_user_id()
    )
  group by c.status, c.priority
$$;

create or replace function app.report_services()
returns table(program_name text, units numeric)
language sql stable security definer set search_path = public, app as $$
  select p.name, coalesce(sum(a.quantity), 0)
  from programs p
  left join program_services ps on ps.program_id = p.id
  left join assistance_lines a on a.program_service_id = ps.id
    and a.served_on >= date_trunc('month', now())::date
  where p.organization_id = app.current_org_id()
    and app.allowed('report.read')
  group by p.name
  order by p.name
$$;

create or replace function app.report_inventory()
returns table(item_name text, on_hand numeric, low_stock_threshold numeric)
language sql stable security definer set search_path = public, app as $$
  select i.name, coalesce(sum(b.quantity), 0), i.low_stock_threshold
  from items i
  left join stock_balances b on b.item_id = i.id
  where i.organization_id = app.current_org_id()
    and i.active
    and (app.allowed('report.read') or app.allowed('inventory.read'))
  group by i.name, i.low_stock_threshold
  order by i.name
$$;

create or replace function app.report_volunteer_hours()
returns table(volunteer_name text, hours numeric)
language sql stable security definer set search_path = public, app as $$
  select v.name, coalesce(sum(h.hours), 0)
  from volunteers v
  left join volunteer_hours h on h.volunteer_id = v.id
    and h.worked_on >= date_trunc('month', now())::date
  where v.organization_id = app.current_org_id()
    and app.allowed('report.read')
  group by v.name
  order by v.name
$$;

create or replace function app.enqueue_appointment_reminders() returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  inserted integer := 0;
begin
  insert into notifications (organization_id, user_id, kind, title, body, dedupe)
  select c.organization_id, c.assignee_id, 'appointment',
    'Appointment coming up',
    c.code || ' · ' || a.place_label,
    'appt:' || a.id::text || ':' || to_char(a.starts_at at time zone 'UTC', 'YYYY-MM-DD')
  from appointments a
  join cases c on c.id = a.case_id
  where a.status = 'scheduled'
    and c.assignee_id is not null
    and a.starts_at > now()
    and a.starts_at < now() + interval '24 hours'
  on conflict (dedupe) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

create or replace function app.lookup_login(p_email text)
returns table(id uuid, password_hash text, mfa_enabled boolean, mfa_secret text, name text)
language sql security definer set search_path = public, app as $$
  select u.id, u.password_hash, u.mfa_enabled, u.mfa_secret, u.name
  from users u
  where u.email = p_email
$$;

create or replace function app.note_login_attempt(p_email text) returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  total integer;
begin
  delete from login_attempts where attempted_at < now() - interval '1 day';
  insert into login_attempts (email) values (p_email);
  select count(*) into total
  from login_attempts
  where email = p_email and attempted_at > now() - interval '15 minutes';
  return total;
end $$;

create or replace function app.clear_login_attempts(p_email text) returns void
language sql security definer set search_path = public, app as $$
  delete from login_attempts where email = p_email
$$;

create or replace function app.open_session(p_user uuid, p_hash text, p_scope text, p_expires timestamptz)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  new_id uuid;
begin
  insert into sessions (user_id, token_hash, scope, expires_at)
  values (p_user, p_hash, p_scope, p_expires)
  returning id into new_id;
  return new_id;
end $$;

create or replace function app.read_session(p_hash text)
returns table(user_id uuid, email citext, name text, scope text, mfa_enabled boolean)
language sql security definer set search_path = public, app as $$
  select u.id, u.email, u.name, s.scope, u.mfa_enabled
  from sessions s
  join users u on u.id = s.user_id
  where s.token_hash = p_hash
    and s.revoked_at is null
    and s.expires_at > now()
$$;

create or replace function app.revoke_session(p_hash text) returns void
language sql security definer set search_path = public, app as $$
  update sessions set revoked_at = now()
  where token_hash = p_hash and revoked_at is null
$$;

create or replace function app.revoke_user_sessions(p_user uuid) returns void
language sql security definer set search_path = public, app as $$
  update sessions set revoked_at = now()
  where user_id = p_user and revoked_at is null
$$;

create or replace function app.open_challenge(p_user uuid, p_hash text) returns void
language sql security definer set search_path = public, app as $$
  insert into login_challenges (user_id, token_hash, expires_at)
  values (p_user, p_hash, now() + interval '5 minutes')
$$;

create or replace function app.take_challenge(p_hash text)
returns table(user_id uuid, mfa_secret text, mfa_enabled boolean, email citext, name text)
language plpgsql security definer set search_path = public, app as $$
declare
  challenge login_challenges%rowtype;
begin
  select * into challenge
  from login_challenges
  where token_hash = p_hash and used_at is null and expires_at > now();
  if not found then
    return;
  end if;
  update login_challenges set used_at = now() where id = challenge.id;
  return query
  select u.id, u.mfa_secret, u.mfa_enabled, u.email, u.name
  from users u where u.id = challenge.user_id;
end $$;

create or replace function app.register_owner(
  p_email text, p_name text, p_password_hash text,
  p_org_name text, p_slug text, p_timezone text
) returns table(user_id uuid, organization_id uuid)
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid;
  oid uuid;
begin
  insert into users (email, name, password_hash)
  values (p_email, p_name, p_password_hash)
  returning id into uid;
  insert into organizations (name, slug, timezone)
  values (p_org_name, p_slug, p_timezone)
  returning id into oid;
  insert into memberships (organization_id, user_id, role)
  values (oid, uid, 'owner');
  insert into case_types (organization_id, name) values (oid, 'General');
  insert into stock_locations (organization_id, name) values (oid, 'Main storage');
  user_id := uid;
  organization_id := oid;
  return next;
end $$;

create or replace function app.peek_invite(p_hash text)
returns table(email citext, role text, organization_name text, organization_slug text, expired boolean)
language sql security definer set search_path = public, app as $$
  select i.email, i.role, o.name, o.slug, (i.used_at is not null or i.expires_at <= now())
  from invitations i
  join organizations o on o.id = i.organization_id
  where i.token_hash = p_hash
$$;

create or replace function app.accept_invite_new(p_hash text, p_name text, p_password_hash text)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  inv invitations%rowtype;
  uid uuid;
begin
  select * into inv from invitations
  where token_hash = p_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'invite is invalid or expired';
  end if;
  insert into users (email, name, password_hash)
  values (inv.email, p_name, p_password_hash)
  returning id into uid;
  insert into memberships (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role);
  update invitations set used_at = now() where id = inv.id;
  return uid;
end $$;

create or replace function app.accept_invite_existing(p_hash text, p_user uuid) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  inv invitations%rowtype;
begin
  select * into inv from invitations
  where token_hash = p_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'invite is invalid or expired';
  end if;
  if not exists (select 1 from users u where u.id = p_user and u.email = inv.email) then
    raise exception 'invite email does not match this account';
  end if;
  insert into memberships (organization_id, user_id, role, status)
  values (inv.organization_id, p_user, inv.role, 'active')
  on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active';
  update invitations set used_at = now() where id = inv.id;
  return p_user;
end $$;

create or replace function app.begin_mfa(p_secret text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update users
    set mfa_secret = p_secret, mfa_enabled = false
    where id = app.current_user_id() and mfa_enabled = false;
  if not found then
    raise exception 'multi-factor authentication is already on';
  end if;
end $$;

create or replace function app.confirm_mfa() returns void
language sql security definer set search_path = public, app as $$
  update users set mfa_enabled = true
  where id = app.current_user_id() and mfa_secret is not null
$$;

create or replace function app.my_mfa_secret() returns text
language sql stable security definer set search_path = public, app as $$
  select mfa_secret from users where id = app.current_user_id()
$$;

create or replace function app.promote_session(p_hash text) returns void
language sql security definer set search_path = public, app as $$
  update sessions set scope = 'full'
  where token_hash = p_hash and user_id = app.current_user_id()
$$;

create or replace function app.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  target_role text;
begin
  if not app.allowed('member.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_user = app.current_user_id() then
    raise exception 'you cannot remove yourself';
  end if;
  select role into target_role
  from memberships
  where organization_id = app.current_org_id() and user_id = p_user and status = 'active';
  if target_role is null then
    raise exception 'member was not found';
  end if;
  if target_role = 'owner' then
    raise exception 'transfer ownership before removing the owner';
  end if;
  update memberships set status = 'removed'
  where organization_id = app.current_org_id() and user_id = p_user;
  perform app.revoke_user_sessions(p_user);
end $$;

create or replace function app.transfer_ownership(p_user uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if app.member_role() <> 'owner' then
    raise exception 'only the owner can transfer ownership' using errcode = '42501';
  end if;
  if not exists (
    select 1 from memberships
    where organization_id = app.current_org_id() and user_id = p_user and status = 'active'
  ) then
    raise exception 'that person is not an active member';
  end if;
  update memberships set role = 'administrator'
  where organization_id = app.current_org_id() and user_id = app.current_user_id();
  update memberships set role = 'owner'
  where organization_id = app.current_org_id() and user_id = p_user;
end $$;

create or replace function app.schedule_purge() returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.allowed('org.delete') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update organizations set purge_after = now() + interval '7 days'
  where id = app.current_org_id();
end $$;

create or replace function app.cancel_purge() returns void
language sql security definer set search_path = public, app as $$
  update organizations set purge_after = null
  where id = app.current_org_id() and app.allowed('org.delete')
$$;

create or replace function app.purge_due_organizations()
returns table(storage_key text)
language plpgsql security definer set search_path = public, app as $$
declare
  keys text[];
begin
  select coalesce(array_agg(d.storage_key), '{}') into keys
  from documents d
  join organizations o on o.id = d.organization_id
  where o.purge_after is not null and o.purge_after < now();
  delete from organizations o
  where o.purge_after is not null and o.purge_after < now();
  return query select unnest(keys);
end $$;

alter table users enable row level security;
alter table users force row level security;
alter table organizations enable row level security;
alter table organizations force row level security;
alter table memberships enable row level security;
alter table memberships force row level security;
alter table invitations enable row level security;
alter table invitations force row level security;
alter table households enable row level security;
alter table households force row level security;
alter table people enable row level security;
alter table people force row level security;
alter table household_notes enable row level security;
alter table household_notes force row level security;
alter table programs enable row level security;
alter table programs force row level security;
alter table program_fields enable row level security;
alter table program_fields force row level security;
alter table program_services enable row level security;
alter table program_services force row level security;
alter table enrollments enable row level security;
alter table enrollments force row level security;
alter table case_types enable row level security;
alter table case_types force row level security;
alter table cases enable row level security;
alter table cases force row level security;
alter table case_notes enable row level security;
alter table case_notes force row level security;
alter table tasks enable row level security;
alter table tasks force row level security;
alter table appointments enable row level security;
alter table appointments force row level security;
alter table items enable row level security;
alter table items force row level security;
alter table stock_locations enable row level security;
alter table stock_locations force row level security;
alter table stock_balances enable row level security;
alter table stock_balances force row level security;
alter table stock_movements enable row level security;
alter table stock_movements force row level security;
alter table assistance_lines enable row level security;
alter table assistance_lines force row level security;
alter table volunteers enable row level security;
alter table volunteers force row level security;
alter table shifts enable row level security;
alter table shifts force row level security;
alter table volunteer_hours enable row level security;
alter table volunteer_hours force row level security;
alter table service_sites enable row level security;
alter table service_sites force row level security;
alter table referrals enable row level security;
alter table referrals force row level security;
alter table documents enable row level security;
alter table documents force row level security;
alter table notifications enable row level security;
alter table notifications force row level security;
alter table client_mutations enable row level security;
alter table client_mutations force row level security;
alter table activity_events enable row level security;
alter table activity_events force row level security;

create policy users_select on users for select using (
  id = app.current_user_id()
  or exists (
    select 1 from memberships m
    where m.user_id = users.id
      and m.organization_id = app.current_org_id()
      and m.status = 'active'
  )
);

create policy org_select on organizations for select using (
  exists (
    select 1 from memberships m
    where m.organization_id = organizations.id
      and m.user_id = app.current_user_id()
      and m.status = 'active'
  )
);

create policy org_update on organizations for update using (
  id = app.current_org_id() and app.allowed('org.manage')
) with check (
  id = app.current_org_id() and app.allowed('org.manage')
);

create policy memberships_select on memberships for select using (
  user_id = app.current_user_id()
  or organization_id = app.current_org_id()
);

create policy invites_select on invitations for select using (
  organization_id = app.current_org_id() and app.allowed('member.manage')
);
create policy invites_insert on invitations for insert with check (
  organization_id = app.current_org_id()
  and invited_by = app.current_user_id()
  and app.allowed('member.invite')
);

create policy households_write on households for insert with check (
  organization_id = app.current_org_id()
  and app.allowed('household.write')
  and consent_by = app.current_user_id()
  and (
    app.member_role() is distinct from 'field_worker'
    or assigned_worker_id = app.current_user_id()
  )
);
create policy households_update on households for update using (
  organization_id = app.current_org_id()
  and app.allowed('household.write')
  and (
    app.member_role() is distinct from 'field_worker'
    or assigned_worker_id = app.current_user_id()
  )
) with check (
  organization_id = app.current_org_id()
  and app.allowed('household.write')
  and (
    app.member_role() is distinct from 'field_worker'
    or assigned_worker_id = app.current_user_id()
  )
);
create policy households_select on households for select using (
  organization_id = app.current_org_id()
  and app.allowed('household.read')
  and (
    app.member_role() is distinct from 'field_worker'
    or app.field_worker_sees_household(id, organization_id)
  )
);

create policy people_all on people for all using (
  organization_id = app.current_org_id()
  and exists (select 1 from households h where h.id = people.household_id)
) with check (
  organization_id = app.current_org_id()
  and app.allowed('household.write')
  and exists (select 1 from households h where h.id = people.household_id and h.organization_id = people.organization_id)
);

create policy household_notes_select on household_notes for select using (
  organization_id = app.current_org_id()
  and app.allowed('case.read_notes')
  and exists (select 1 from households h where h.id = household_notes.household_id)
);
create policy household_notes_insert on household_notes for insert with check (
  organization_id = app.current_org_id()
  and author_id = app.current_user_id()
  and app.allowed('household.write')
  and exists (select 1 from households h where h.id = household_notes.household_id)
);

create policy programs_select on programs for select using (
  organization_id = app.current_org_id() and app.allowed('program.read')
);
create policy programs_write on programs for all using (
  organization_id = app.current_org_id() and app.allowed('program.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('program.write')
);

create policy program_fields_select on program_fields for select using (
  organization_id = app.current_org_id() and app.allowed('program.read')
);
create policy program_fields_write on program_fields for all using (
  organization_id = app.current_org_id() and app.allowed('program.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('program.write')
);

create policy services_select on program_services for select using (
  organization_id = app.current_org_id() and app.allowed('program.read')
);
create policy services_write on program_services for all using (
  organization_id = app.current_org_id() and app.allowed('program.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('program.write')
);

create policy enroll_select on enrollments for select using (
  organization_id = app.current_org_id() and app.allowed('household.read')
  and exists (select 1 from households h where h.id = enrollments.household_id)
);
create policy enroll_write on enrollments for insert with check (
  organization_id = app.current_org_id() and app.allowed('household.write')
  and exists (select 1 from households h where h.id = enrollments.household_id)
);
create policy enroll_update on enrollments for update using (
  organization_id = app.current_org_id() and app.allowed('household.write')
  and exists (select 1 from households h where h.id = enrollments.household_id)
) with check (
  organization_id = app.current_org_id() and app.allowed('household.write')
);

create policy case_types_select on case_types for select using (
  organization_id = app.current_org_id() and (app.allowed('case.read') or app.allowed('program.read'))
);
create policy case_types_write on case_types for all using (
  organization_id = app.current_org_id() and app.allowed('program.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('program.write')
);

create policy cases_select on cases for select using (
  organization_id = app.current_org_id()
  and app.allowed('case.read')
  and (
    app.member_role() is distinct from 'field_worker'
    or assignee_id = app.current_user_id()
  )
);
create policy cases_insert on cases for insert with check (
  organization_id = app.current_org_id()
  and app.allowed('case.write')
  and (
    app.member_role() is distinct from 'field_worker'
    or assignee_id = app.current_user_id()
  )
);
create policy cases_update on cases for update using (
  organization_id = app.current_org_id()
  and app.allowed('case.write')
  and (
    app.member_role() is distinct from 'field_worker'
    or assignee_id = app.current_user_id()
  )
) with check (
  organization_id = app.current_org_id()
  and app.allowed('case.write')
  and (
    app.member_role() is distinct from 'field_worker'
    or assignee_id = app.current_user_id()
  )
);

create policy notes_select on case_notes for select using (
  organization_id = app.current_org_id()
  and app.allowed('case.read_notes')
  and exists (select 1 from cases c where c.id = case_notes.case_id)
);
create policy notes_insert on case_notes for insert with check (
  organization_id = app.current_org_id()
  and author_id = app.current_user_id()
  and app.allowed('case.write')
  and exists (select 1 from cases c where c.id = case_notes.case_id)
);

create policy tasks_select on tasks for select using (
  organization_id = app.current_org_id()
  and (
    (
      app.allowed('case.read')
      and (
        app.member_role() is distinct from 'field_worker'
        or exists (
          select 1 from cases c
          where c.id = tasks.case_id and c.assignee_id = app.current_user_id()
        )
      )
    )
    or (volunteer_visible and app.allowed('volunteer.write'))
  )
);
create policy tasks_write on tasks for all using (
  organization_id = app.current_org_id()
  and app.allowed('case.write')
  and exists (select 1 from cases c where c.id = tasks.case_id)
) with check (
  organization_id = app.current_org_id()
  and app.allowed('case.write')
  and exists (select 1 from cases c where c.id = tasks.case_id)
);

create policy appointments_select on appointments for select using (
  organization_id = app.current_org_id()
  and app.allowed('case.read')
  and exists (select 1 from cases c where c.id = appointments.case_id)
);
create policy appointments_write on appointments for all using (
  organization_id = app.current_org_id()
  and app.allowed('case.write')
  and exists (select 1 from cases c where c.id = appointments.case_id)
) with check (
  organization_id = app.current_org_id()
  and app.allowed('case.write')
  and exists (select 1 from cases c where c.id = appointments.case_id)
);

create policy items_select on items for select using (
  organization_id = app.current_org_id() and app.allowed('inventory.read')
);
create policy items_write on items for all using (
  organization_id = app.current_org_id() and app.allowed('inventory.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('inventory.write')
);

create policy locations_select on stock_locations for select using (
  organization_id = app.current_org_id()
  and (app.allowed('inventory.read') or app.allowed('assistance.write'))
);
create policy locations_write on stock_locations for all using (
  organization_id = app.current_org_id() and app.allowed('inventory.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('inventory.write')
);

create policy balances_select on stock_balances for select using (
  exists (
    select 1 from items i
    where i.id = stock_balances.item_id
      and i.organization_id = app.current_org_id()
      and app.allowed('inventory.read')
  )
);

create policy movements_select on stock_movements for select using (
  organization_id = app.current_org_id()
  and (app.allowed('inventory.write') or app.allowed('audit.read'))
);
create policy movements_insert on stock_movements for insert with check (
  organization_id = app.current_org_id()
  and (
    (reason = 'issue' and app.allowed('assistance.write'))
    or (reason <> 'issue' and app.allowed('inventory.write'))
  )
);

create policy assistance_select on assistance_lines for select using (
  organization_id = app.current_org_id()
  and (app.allowed('case.read_notes') or app.allowed('inventory.read') or app.allowed('assistance.write'))
  and (
    app.member_role() is distinct from 'field_worker'
    or exists (
      select 1 from cases c
      where c.id = assistance_lines.case_id and c.assignee_id = app.current_user_id()
    )
  )
);
create policy assistance_insert on assistance_lines for insert with check (
  organization_id = app.current_org_id()
  and actor_id = app.current_user_id()
  and app.allowed('assistance.write')
  and exists (select 1 from cases c where c.id = assistance_lines.case_id)
);

create policy volunteers_select on volunteers for select using (
  organization_id = app.current_org_id() and app.allowed('volunteer.read')
);
create policy volunteers_write on volunteers for all using (
  organization_id = app.current_org_id() and app.allowed('volunteer.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('volunteer.write')
);

create policy shifts_select on shifts for select using (
  organization_id = app.current_org_id() and app.allowed('volunteer.read')
);
create policy shifts_write on shifts for all using (
  organization_id = app.current_org_id() and app.allowed('volunteer.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('volunteer.write')
);

create policy hours_select on volunteer_hours for select using (
  organization_id = app.current_org_id() and app.allowed('volunteer.read')
);
create policy hours_write on volunteer_hours for insert with check (
  organization_id = app.current_org_id() and app.allowed('volunteer.write')
);

create policy sites_select on service_sites for select using (
  organization_id = app.current_org_id() and app.allowed('directory.read')
);
create policy sites_write on service_sites for all using (
  organization_id = app.current_org_id() and app.allowed('directory.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('directory.write')
);

create policy referrals_select on referrals for select using (
  organization_id = app.current_org_id()
  and app.allowed('case.read_notes')
  and exists (select 1 from cases c where c.id = referrals.case_id)
);
create policy referrals_insert on referrals for insert with check (
  organization_id = app.current_org_id()
  and created_by = app.current_user_id()
  and app.allowed('referral.write')
  and exists (select 1 from cases c where c.id = referrals.case_id)
);
create policy referrals_update on referrals for update using (
  organization_id = app.current_org_id()
  and app.allowed('referral.write')
  and exists (select 1 from cases c where c.id = referrals.case_id)
) with check (
  organization_id = app.current_org_id() and app.allowed('referral.write')
);

create policy documents_select on documents for select using (
  organization_id = app.current_org_id()
  and deleted_at is null
  and app.allowed('document.read')
  and (
    (case_id is not null and exists (select 1 from cases c where c.id = documents.case_id))
    or (household_id is not null and exists (select 1 from households h where h.id = documents.household_id))
  )
);
create policy documents_insert on documents for insert with check (
  organization_id = app.current_org_id()
  and uploaded_by = app.current_user_id()
  and app.allowed('document.write')
  and (
    (case_id is not null and exists (select 1 from cases c where c.id = documents.case_id))
    or (household_id is not null and exists (select 1 from households h where h.id = documents.household_id))
  )
);
create policy documents_update on documents for update using (
  organization_id = app.current_org_id() and app.allowed('document.write')
) with check (
  organization_id = app.current_org_id() and app.allowed('document.write')
);

create policy notifications_select on notifications for select using (
  organization_id = app.current_org_id()
  and user_id = app.current_user_id()
  and app.allowed('notification.read')
);
create policy notifications_update on notifications for update using (
  organization_id = app.current_org_id() and user_id = app.current_user_id()
) with check (
  organization_id = app.current_org_id() and user_id = app.current_user_id()
);

create policy mutations_all on client_mutations for all using (
  organization_id = app.current_org_id() and user_id = app.current_user_id()
) with check (
  organization_id = app.current_org_id() and user_id = app.current_user_id()
);

create policy activity_select on activity_events for select using (
  organization_id = app.current_org_id()
  and (
    app.allowed('audit.read')
    or (
      app.allowed('case.read_notes')
      and (
        app.member_role() is distinct from 'field_worker'
        or exists (
          select 1 from cases c
          where c.id = activity_events.entity_id and c.assignee_id = app.current_user_id()
        )
        or actor_id = app.current_user_id()
      )
    )
  )
);

revoke all on schema app from public;
grant usage on schema public, app to aidbridge_app;
grant execute on all functions in schema app to aidbridge_app;
revoke all on all functions in schema app from public;

grant select (id, email, name, mfa_enabled, created_at) on users to aidbridge_app;
grant select, update on organizations to aidbridge_app;
grant select on memberships to aidbridge_app;
grant select, insert on invitations to aidbridge_app;
grant select on role_permissions, case_transitions to aidbridge_app;

grant select, insert, update on
  households, people, household_notes, programs, program_fields, program_services,
  enrollments, case_types, cases, case_notes, tasks, appointments, items, stock_locations,
  stock_balances, stock_movements, assistance_lines, volunteers, shifts, volunteer_hours,
  service_sites, referrals, documents, notifications, client_mutations, activity_events
to aidbridge_app;

grant select on v_households, v_people, v_assistance_ledger to aidbridge_app;

alter role aidbridge_app set statement_timeout = '8s';

commit;
