create extension if not exists pgcrypto;

create table if not exists public.census_map_imports (
  id uuid primary key default gen_random_uuid(), file_name text not null, mime_type text not null default 'application/octet-stream', file_size bigint not null default 0, storage_path text not null unique, source_layer text, status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ERROR')), total_features integer not null default 0, valid_features integer not null default 0, problematic_features integer not null default 0, bbox jsonb, raw_metadata jsonb not null default '{}'::jsonb, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz
);
create table if not exists public.census_map_zones (
  id uuid primary key default gen_random_uuid(), import_id uuid not null references public.census_map_imports(id) on delete cascade, zone_number smallint not null check (zone_number between 1 and 5), name text not null, color text not null, created_at timestamptz not null default now(), unique (import_id, zone_number)
);
create table if not exists public.census_map_lots (
  id uuid primary key default gen_random_uuid(), import_id uuid not null references public.census_map_imports(id) on delete cascade, source_handle text not null, label text, layer_name text not null default 'Lotes Urbanos', geometry jsonb not null, area numeric, is_valid boolean not null default true, problem_reasons text[] not null default '{}'::text[], zone_number smallint check (zone_number between 1 and 5), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (import_id, source_handle)
);
create index if not exists census_map_imports_status_idx on public.census_map_imports(status, updated_at desc);
create index if not exists census_map_lots_import_idx on public.census_map_lots(import_id);
create index if not exists census_map_lots_zone_idx on public.census_map_lots(import_id, zone_number);

alter table public.census_map_imports enable row level security;
alter table public.census_map_zones enable row level security;
alter table public.census_map_lots enable row level security;
drop policy if exists census_map_imports_open_authenticated on public.census_map_imports;
create policy census_map_imports_open_authenticated on public.census_map_imports for all to authenticated using (true) with check (true);
drop policy if exists census_map_zones_open_authenticated on public.census_map_zones;
create policy census_map_zones_open_authenticated on public.census_map_zones for all to authenticated using (true) with check (true);
drop policy if exists census_map_lots_open_authenticated on public.census_map_lots;
create policy census_map_lots_open_authenticated on public.census_map_lots for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public) values ('census-maps', 'census-maps', false) on conflict (id) do nothing;
drop policy if exists census_maps_storage_authenticated on storage.objects;
create policy census_maps_storage_authenticated on storage.objects for all to authenticated using (bucket_id = 'census-maps') with check (bucket_id = 'census-maps');

create or replace function public.census_map_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists census_map_imports_touch_updated_at on public.census_map_imports;
create trigger census_map_imports_touch_updated_at before update on public.census_map_imports for each row execute function public.census_map_touch_updated_at();
drop trigger if exists census_map_lots_touch_updated_at on public.census_map_lots;
create trigger census_map_lots_touch_updated_at before update on public.census_map_lots for each row execute function public.census_map_touch_updated_at();
