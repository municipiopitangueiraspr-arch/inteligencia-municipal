-- Atribuição específica de ACS por lote, mantendo a atribuição por zona como padrão.
-- Não altera lotes, domicílios, visitas ou respostas existentes.

create table if not exists public.census_lot_acs_assignments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.census_map_lots(id) on delete restrict,
  acs_id uuid not null references public.census_acs(id) on delete restrict,
  active boolean not null default true,
  assigned_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lot_id, acs_id)
);

comment on table public.census_lot_acs_assignments is
  'ACS responsável principal exibido para um lote específico; o vínculo não revoga a autorização existente por zona.';

create unique index if not exists census_lot_acs_assignments_one_active_per_lot_idx
  on public.census_lot_acs_assignments (lot_id)
  where active is true;
create index if not exists census_lot_acs_assignments_acs_active_idx
  on public.census_lot_acs_assignments (acs_id, lot_id)
  where active is true;

alter table public.census_lot_acs_assignments enable row level security;
revoke all on table public.census_lot_acs_assignments from public, anon, authenticated;

create or replace function public.census_user_can_access_lot(p_lot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
  select auth.uid() is not null
    and (
      coalesce(app_private.current_user_is_admin(), false)
      or exists (
        select 1
        from public.census_map_lots lot
        join public.census_map_imports map_import
          on map_import.id = lot.import_id
         and map_import.division_saved_at is not null
         and map_import.status in ('DRAFT', 'PUBLISHED')
        join public.census_lot_acs_assignments lot_assignment
          on lot_assignment.lot_id = lot.id and lot_assignment.active is true
        join public.census_acs acs
          on acs.id = lot_assignment.acs_id and acs.active is true
        where lot.id = p_lot_id
          and lot.is_valid is true
          and nullif(lower(btrim(acs.email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
      )
      or exists (
        select 1
        from public.census_map_lots lot
        join public.census_map_imports map_import
          on map_import.id = lot.import_id
         and map_import.division_saved_at is not null
         and map_import.status in ('DRAFT', 'PUBLISHED')
        join public.census_zones zone
          on zone.id = lot.zone_id and zone.active is true
        join public.census_acs_zone_assignments assignment
          on assignment.zone_id = lot.zone_id and assignment.active is true
        join public.census_acs acs
          on acs.id = assignment.acs_id and acs.active is true
        where lot.id = p_lot_id
          and lot.is_valid is true
          and nullif(lower(btrim(acs.email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
      )
    );
$$;

revoke all on function public.census_user_can_access_lot(uuid) from public, anon;
grant execute on function public.census_user_can_access_lot(uuid) to authenticated;

create or replace function public.census_can_manage_lot_acs()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
  select auth.uid() is not null and coalesce(app_private.current_user_is_admin(), false);
$$;

create or replace function public.census_get_lot_acs(p_lot_id uuid)
returns table (acs_id uuid, full_name text, scope text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
begin
  if auth.uid() is null or not public.census_user_can_access_lot(p_lot_id) then
    raise exception 'Acesso não autorizado ao lote.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.census_lot_acs_assignments assignment
    join public.census_acs acs on acs.id = assignment.acs_id and acs.active is true
    where assignment.lot_id = p_lot_id and assignment.active is true
  ) then
    return query
    select acs.id, acs.full_name, 'LOTE'::text
    from public.census_lot_acs_assignments assignment
    join public.census_acs acs on acs.id = assignment.acs_id and acs.active is true
    where assignment.lot_id = p_lot_id and assignment.active is true
    order by acs.full_name;
  else
    return query
    select acs.id, acs.full_name, 'ZONA'::text
    from public.census_map_lots lot
    join public.census_zones zone on zone.id = lot.zone_id and zone.active is true
    join public.census_acs_zone_assignments assignment
      on assignment.zone_id = zone.id and assignment.active is true
    join public.census_acs acs on acs.id = assignment.acs_id and acs.active is true
    where lot.id = p_lot_id
    order by acs.full_name;
  end if;
end;
$$;

create or replace function public.census_assign_acs_to_lot(p_lot_id uuid, p_acs_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
begin
  if auth.uid() is null or not coalesce(app_private.current_user_is_admin(), false) then
    raise exception 'Somente um administrador municipal pode vincular ACS a lotes.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.census_acs acs
    where acs.id = p_acs_id
      and acs.active is true
      and nullif(btrim(acs.email), '') is not null
  ) then
    raise exception 'Selecione um ACS ativo com e-mail cadastrado para permitir o acesso ao lote.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.census_map_lots lot
    join public.census_map_imports map_import on map_import.id = lot.import_id
    where lot.id = p_lot_id
      and lot.is_valid is true
      and map_import.division_saved_at is not null
      and map_import.status in ('DRAFT', 'PUBLISHED')
  ) then
    raise exception 'O lote precisa pertencer a uma divisão válida e salva.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_lot_id::text, 0));

  update public.census_lot_acs_assignments
  set active = false, updated_at = now()
  where lot_id = p_lot_id and active is true and acs_id <> p_acs_id;

  insert into public.census_lot_acs_assignments (lot_id, acs_id, active, assigned_by)
  values (p_lot_id, p_acs_id, true, auth.uid())
  on conflict (lot_id, acs_id) do update
    set active = true, assigned_by = auth.uid(), updated_at = now();
end;
$$;

revoke all on function public.census_can_manage_lot_acs() from public, anon;
revoke all on function public.census_get_lot_acs(uuid) from public, anon;
revoke all on function public.census_assign_acs_to_lot(uuid, uuid) from public, anon;
grant execute on function public.census_can_manage_lot_acs() to authenticated;
grant execute on function public.census_get_lot_acs(uuid) to authenticated;
grant execute on function public.census_assign_acs_to_lot(uuid, uuid) to authenticated;

create or replace function public.census_visits_assign_acs_actor()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare
  matched_acs_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É necessário autenticar para registrar uma visita.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.household_id is distinct from old.household_id
       or new.acs_id is distinct from old.acs_id
       or new.created_by is distinct from old.created_by then
      raise exception 'O domicílio e o agente responsável pela visita são imutáveis.' using errcode = '23514';
    end if;
    return new;
  end if;

  new.created_by := auth.uid();
  if coalesce(app_private.current_user_is_admin(), false) then
    if new.acs_id is not null and not exists (
      select 1
      from public.census_households household
      join public.census_map_lots lot on lot.id = household.lot_id
      join public.census_acs acs on acs.id = new.acs_id and acs.active is true
      where household.id = new.household_id
        and lot.is_valid is true
        and (
          exists (
            select 1 from public.census_lot_acs_assignments direct_assignment
            where direct_assignment.lot_id = lot.id
              and direct_assignment.acs_id = acs.id
              and direct_assignment.active is true
          )
          or exists (
            select 1
            from public.census_zones zone
            join public.census_acs_zone_assignments zone_assignment
              on zone_assignment.zone_id = zone.id
             and zone_assignment.acs_id = acs.id
             and zone_assignment.active is true
            where zone.id = lot.zone_id and zone.active is true
          )
        )
    ) then
      raise exception 'O ACS informado não está vinculado a este lote ou à sua zona.' using errcode = '23514';
    end if;
    return new;
  end if;

  select acs.id into matched_acs_id
  from public.census_households household
  join public.census_map_lots lot on lot.id = household.lot_id
  join public.census_map_imports map_import
    on map_import.id = lot.import_id and map_import.division_saved_at is not null
  join public.census_acs acs on acs.active is true
  where household.id = new.household_id
    and map_import.status in ('DRAFT', 'PUBLISHED')
    and lot.is_valid is true
    and nullif(lower(btrim(acs.email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
    and (
      exists (
        select 1 from public.census_lot_acs_assignments direct_assignment
        where direct_assignment.lot_id = lot.id
          and direct_assignment.acs_id = acs.id
          and direct_assignment.active is true
      )
      or exists (
        select 1
        from public.census_zones zone
        join public.census_acs_zone_assignments zone_assignment
          on zone_assignment.zone_id = zone.id
         and zone_assignment.acs_id = acs.id
         and zone_assignment.active is true
        where zone.id = lot.zone_id and zone.active is true
      )
    )
  order by acs.id
  limit 1;

  if matched_acs_id is null then
    raise exception 'Sua conta não está vinculada como ACS ativo ao lote ou à zona deste domicílio.' using errcode = '42501';
  end if;
  if new.acs_id is not null and new.acs_id <> matched_acs_id then
    raise exception 'O ACS da visita é definido pelo usuário autenticado.' using errcode = '42501';
  end if;
  new.acs_id := matched_acs_id;
  return new;
end;
$$;

revoke all on function public.census_visits_assign_acs_actor() from public, anon, authenticated;
