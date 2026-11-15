create or replace function public.census_manager_lot_assignments()
returns table (lot_id uuid, acs_id uuid, acs_name text)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
  with current_import as (
    select id
    from public.census_territory_map_imports
    where division_saved_at is not null
      and status in ('DRAFT', 'PUBLISHED')
    order by division_saved_at desc nulls last, updated_at desc nulls last
    limit 1
  ),
  current_lots as (
    select lot.id, lot.zone_id
    from public.census_territory_map_lots lot
    join current_import map on map.id = lot.import_id
    where lot.is_valid is true
  ),
  effective as (
    select lot.id as lot_id,
      coalesce(direct.acs_id, zone_assignment.acs_id) as acs_id
    from current_lots lot
    left join lateral (
      select assignment.acs_id
      from public.census_lot_acs_assignments assignment
      where assignment.lot_id = lot.id and assignment.active is true
      order by assignment.updated_at desc, assignment.created_at desc
      limit 1
    ) direct on true
    left join lateral (
      select assignment.acs_id
      from public.census_acs_zone_assignments assignment
      where assignment.zone_id = lot.zone_id and assignment.active is true
      order by assignment.created_at desc
      limit 1
    ) zone_assignment on true
  )
  select effective.lot_id, acs.id, acs.full_name
  from effective
  join public.census_acs acs on acs.id = effective.acs_id and acs.active is true
  where auth.uid() is not null
  order by acs.full_name, effective.lot_id;
$$;

comment on function public.census_manager_lot_assignments() is
  'Leitura gerencial das atribuições efetivas: vínculo direto do lote prevalece sobre vínculo da zona.';

revoke all on function public.census_manager_lot_assignments() from public, anon;
grant execute on function public.census_manager_lot_assignments() to authenticated;
