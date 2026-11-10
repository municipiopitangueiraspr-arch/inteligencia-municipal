create table if not exists public.census_medical_visits (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.census_map_lots(id) on delete restrict,
  visit_date date not null,
  status text not null check (status in ('COMPLETED', 'NO_CONTACT', 'CANCELLED')),
  follow_up_date date,
  follow_up_status text,
  follow_up_completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint census_medical_visits_follow_up_status_check
    check (follow_up_status is null or follow_up_status in ('PENDING', 'COMPLETED', 'CANCELLED')),
  constraint census_medical_visits_follow_up_fields_check
    check (
      (follow_up_date is null and follow_up_status is null and follow_up_completed_at is null)
      or (follow_up_date is not null and follow_up_status is not null)
    ),
  constraint census_medical_visits_follow_up_date_check
    check (follow_up_date is null or follow_up_date >= visit_date),
  constraint census_medical_visits_follow_up_completion_check
    check ((follow_up_status = 'COMPLETED') = (follow_up_completed_at is not null))
);

create index if not exists census_medical_visits_lot_date_idx
  on public.census_medical_visits (lot_id, visit_date desc, created_at desc);
create index if not exists census_medical_visits_pending_follow_up_idx
  on public.census_medical_visits (follow_up_date, lot_id)
  where follow_up_status = 'PENDING';

create or replace function public.census_medical_visits_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  if new.follow_up_status = 'COMPLETED' and (tg_op = 'INSERT' or old.follow_up_status is distinct from 'COMPLETED') then
    new.follow_up_completed_at := now();
  elsif new.follow_up_status is distinct from 'COMPLETED' then
    new.follow_up_completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.census_medical_visits_touch_updated_at() from public, anon, authenticated;
drop trigger if exists census_medical_visits_touch_updated_at on public.census_medical_visits;
create trigger census_medical_visits_touch_updated_at
  before insert or update on public.census_medical_visits
  for each row execute function public.census_medical_visits_touch_updated_at();

alter table public.census_medical_visits enable row level security;
drop policy if exists census_medical_visits_admin_select on public.census_medical_visits;
create policy census_medical_visits_admin_select
  on public.census_medical_visits for select to authenticated
  using (coalesce(app_private.current_user_is_admin(), false));
drop policy if exists census_medical_visits_admin_insert on public.census_medical_visits;
create policy census_medical_visits_admin_insert
  on public.census_medical_visits for insert to authenticated
  with check (
    coalesce(app_private.current_user_is_admin(), false)
    and created_by = auth.uid()
    and exists (
      select 1
      from public.census_map_lots lot
      join public.census_map_imports map_import on map_import.id = lot.import_id
      where lot.id = lot_id
        and lot.is_valid is true
        and map_import.division_saved_at is not null
        and map_import.status in ('DRAFT', 'PUBLISHED')
    )
  );
drop policy if exists census_medical_visits_admin_update on public.census_medical_visits;
create policy census_medical_visits_admin_update
  on public.census_medical_visits for update to authenticated
  using (coalesce(app_private.current_user_is_admin(), false))
  with check (coalesce(app_private.current_user_is_admin(), false));

revoke all on table public.census_medical_visits from anon, authenticated;
grant select, insert, update on table public.census_medical_visits to authenticated;

comment on table public.census_medical_visits is
  'Agenda operacional de visitas médicas por lote. Não armazena paciente, diagnóstico, respostas clínicas nem observações clínicas. RLS restrito a administradores ativos enquanto o acesso da equipe médica não for definido.';
comment on column public.census_medical_visits.lot_id is
  'Referência ao lote territorial; deliberadamente não vincula a pessoa ou as respostas do Censo/ACS.';
comment on column public.census_medical_visits.follow_up_date is
  'Data do retorno operacional agendado, sem motivo clínico associado.';

update public.municipal_modules
set is_ready = true,
    status_label = 'Disponível'
where id = 'medical-visits';
