create table if not exists public.census_medical_lot_priorities (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.census_map_lots(id) on delete restrict,
  priority_date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  status text not null default 'PENDING' check (status in ('PENDING', 'VISITED', 'CANCELLED')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint census_medical_lot_priorities_lot_day_key unique (lot_id, priority_date)
);

create index if not exists census_medical_lot_priorities_day_status_idx
  on public.census_medical_lot_priorities (priority_date, status, created_at);

create or replace function public.census_medical_lot_priorities_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.census_medical_lot_priorities_touch_updated_at() from public, anon, authenticated;
create trigger census_medical_lot_priorities_touch_updated_at
  before update on public.census_medical_lot_priorities
  for each row execute function public.census_medical_lot_priorities_touch_updated_at();

alter table public.census_medical_lot_priorities enable row level security;
create policy census_medical_lot_priorities_admin_select
  on public.census_medical_lot_priorities for select to authenticated
  using (coalesce(app_private.current_user_is_admin(), false));
create policy census_medical_lot_priorities_admin_insert
  on public.census_medical_lot_priorities for insert to authenticated
  with check (
    coalesce(app_private.current_user_is_admin(), false)
    and created_by = auth.uid()
    and exists (
      select 1
      from public.census_map_lots lot
      join public.census_map_imports map_import on map_import.id = lot.import_id
      where lot.id = census_medical_lot_priorities.lot_id
        and lot.is_valid is true
        and map_import.division_saved_at is not null
        and map_import.status in ('DRAFT', 'PUBLISHED')
    )
  );
create policy census_medical_lot_priorities_admin_update
  on public.census_medical_lot_priorities for update to authenticated
  using (coalesce(app_private.current_user_is_admin(), false))
  with check (coalesce(app_private.current_user_is_admin(), false));

revoke all on table public.census_medical_lot_priorities from anon, authenticated;
grant select, insert, update on table public.census_medical_lot_priorities to authenticated;

comment on table public.census_medical_lot_priorities is
  'Indicações administrativas da Secretaria para roteiros diários de lotes. Não representa necessidade hospitalar ou clínica. RLS restrito a administradores ativos; preserva histórico por data e não permite exclusão.';
comment on column public.census_medical_lot_priorities.status is
  'Estado operacional da indicação: pendente, visitado ou cancelado; não é diagnóstico nem classificação clínica.';
