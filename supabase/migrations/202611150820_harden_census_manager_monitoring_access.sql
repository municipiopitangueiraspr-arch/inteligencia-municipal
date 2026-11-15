create or replace function public.census_manager_monitoring_context()
returns table (
  lot_id uuid,
  zone_id uuid,
  zone_name text,
  acs_id uuid,
  acs_name text,
  lot_status text,
  visit_status text,
  last_movement_at timestamptz,
  pending_reason text,
  household_count bigint,
  visit_count bigint,
  submitted_response_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
  with current_import as (
    select id from public.census_territory_map_imports
    where division_saved_at is not null and status in ('DRAFT', 'PUBLISHED')
    order by division_saved_at desc nulls last, updated_at desc nulls last limit 1
  ),
  current_lots as (
    select lot.id, lot.zone_id, zone.name as zone_name
    from public.census_territory_map_lots lot
    join current_import map on map.id = lot.import_id
    left join public.census_zones zone on zone.id = lot.zone_id
    where lot.is_valid is true
  ),
  effective_acs as (
    select lot.id as lot_id, coalesce(direct.acs_id, zone_assignment.acs_id) as acs_id
    from current_lots lot
    left join lateral (
      select assignment.acs_id from public.census_lot_acs_assignments assignment
      where assignment.lot_id = lot.id and assignment.active is true
      order by assignment.updated_at desc, assignment.created_at desc limit 1
    ) direct on true
    left join lateral (
      select assignment.acs_id from public.census_acs_zone_assignments assignment
      where assignment.zone_id = lot.zone_id and assignment.active is true
      order by assignment.created_at desc limit 1
    ) zone_assignment on true
  ),
  lot_activity as (
    select lot.id as lot_id,
      count(distinct household.id) filter (where household.active is true) as household_count,
      count(distinct visit.id) as visit_count,
      count(distinct response.id) filter (where response.status = 'SUBMITTED') as submitted_response_count,
      max(greatest(household.created_at, visit.created_at, response.created_at)) as last_movement_at,
      (array_agg(visit.status order by visit.visit_date desc nulls last, visit.created_at desc nulls last))[1] as latest_visit_status,
      (array_agg(nullif(trim(visit.notes), '') order by visit.visit_date desc nulls last, visit.created_at desc nulls last))[1] as latest_visit_notes,
      bool_or(response.status = 'SUBMITTED') as has_submitted_response
    from current_lots lot
    left join public.census_households household on household.lot_id = lot.id and household.active is true
    left join public.census_visits visit on visit.household_id = household.id
    left join public.census_questionnaire_responses response on response.visit_id = visit.id
    group by lot.id
  )
  select lot.id, lot.zone_id, lot.zone_name, effective.acs_id, acs.full_name,
    case when activity.household_count = 0 then 'NOT_STARTED'
      when activity.has_submitted_response is true then 'COMPLETED'
      when activity.latest_visit_status = 'NO_CONTACT' then 'NO_CONTACT' else 'PENDING' end,
    case when activity.household_count = 0 then 'NO_ACTIVITY'
      when activity.visit_count = 0 then 'NO_VISIT'
      when activity.latest_visit_status = 'NO_CONTACT' then 'NO_CONTACT'
      when activity.latest_visit_status = 'IN_PROGRESS' then 'IN_PROGRESS'
      when activity.latest_visit_status = 'CANCELLED' then 'CANCELLED' else 'COMPLETED' end,
    activity.last_movement_at,
    case when activity.household_count = 0 then 'Nenhum domicílio cadastrado.'
      when activity.latest_visit_status = 'NO_CONTACT' then coalesce(activity.latest_visit_notes, 'Sem contato informado pelo ACS.')
      when activity.visit_count = 0 then 'Domicílio cadastrado, mas sem visita registrada.'
      when activity.has_submitted_response is not true then 'Visita registrada, mas falta concluir o questionário.' else null end,
    activity.household_count, activity.visit_count, activity.submitted_response_count
  from current_lots lot
  join lot_activity activity on activity.lot_id = lot.id
  left join effective_acs effective on effective.lot_id = lot.id
  left join public.census_acs acs on acs.id = effective.acs_id and acs.active is true
  where auth.uid() is not null
    and public.municipal_user_has_module('census')
    and (public.municipal_user_has_role('SYSTEM_ADMIN')
      or public.municipal_user_has_role('EXECUTIVE_VIEW')
      or public.municipal_user_has_role('UNIT_MANAGER'))
  order by lot.zone_name nulls last, lot.id;
$$;

comment on function public.census_manager_monitoring_context() is
  'Leitura gerencial do território limitada a Admin, Prefeito e Secretário/Gestor; não expõe conteúdo de respostas.';
revoke all on function public.census_manager_monitoring_context() from public, anon;
grant execute on function public.census_manager_monitoring_context() to authenticated;
