-- Estrutura operacional do Censo Municipal: domicílios, visitas e respostas.
-- Não insere dados pessoais de teste nem apaga registros existentes.

alter table public.census_questionnaires
  add column if not exists version integer not null default 1;

alter table public.census_map_imports
  add column if not exists division_saved_at timestamptz;

update public.census_map_imports map_import
set division_saved_at = coalesce(map_import.published_at, map_import.updated_at, map_import.created_at, now())
where map_import.division_saved_at is null
  and map_import.status in ('DRAFT', 'PUBLISHED')
  and exists (
    select 1 from public.census_map_lots lot
    where lot.import_id = map_import.id and lot.is_valid is true
  )
  and not exists (
    select 1 from public.census_map_lots lot
    where lot.import_id = map_import.id and lot.is_valid is true and lot.zone_id is null
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.census_questionnaires'::regclass
      and conname = 'census_questionnaires_version_positive'
  ) then
    alter table public.census_questionnaires
      add constraint census_questionnaires_version_positive check (version > 0);
  end if;
end;
$$;

create or replace function public.census_questionnaires_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (new.slug, new.title, new.subtitle, new.description, new.form_schema)
     is distinct from
     (old.slug, old.title, old.subtitle, old.description, old.form_schema) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.census_households (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.census_map_lots(id) on delete restrict,
  label text not null default 'Domicílio'
    check (length(btrim(label)) between 1 and 100),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.census_households is
  'Domicílios vinculados a lotes; um lote pode conter vários domicílios. Identificação pessoal fica nas respostas protegidas.';
create index if not exists census_households_lot_active_idx
  on public.census_households (lot_id, active, created_at);

create table if not exists public.census_visits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.census_households(id) on delete restrict,
  acs_id uuid references public.census_acs(id) on delete restrict,
  visit_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'COMPLETED', 'NO_CONTACT', 'CANCELLED')),
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.census_visits is
  'Histórico de visitas a domicílios; linhas são preservadas e não podem ser apagadas por usuários do Censo.';
create index if not exists census_visits_household_date_idx
  on public.census_visits (household_id, visit_date desc, created_at desc);
create index if not exists census_visits_acs_date_idx
  on public.census_visits (acs_id, visit_date desc);

create table if not exists public.census_questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.census_visits(id) on delete restrict,
  questionnaire_id uuid not null references public.census_questionnaires(id) on delete restrict,
  questionnaire_version integer not null check (questionnaire_version > 0),
  questionnaire_snapshot jsonb not null
    check (jsonb_typeof(questionnaire_snapshot) = 'object'),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 1048576),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED')),
  submitted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id, questionnaire_id),
  check ((status = 'DRAFT' and submitted_at is null) or (status = 'SUBMITTED' and submitted_at is not null))
);

comment on table public.census_questionnaire_responses is
  'Respostas domiciliares protegidas, versionadas e vinculadas à visita e ao snapshot imutável do questionário utilizado.';
create index if not exists census_questionnaire_responses_visit_idx
  on public.census_questionnaire_responses (visit_id, created_at desc);
create index if not exists census_questionnaire_responses_questionnaire_status_idx
  on public.census_questionnaire_responses (questionnaire_id, status, submitted_at desc);
create index if not exists census_questionnaire_responses_answers_gin_idx
  on public.census_questionnaire_responses using gin (answers jsonb_path_ops);

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
          on map_import.id = lot.import_id and map_import.division_saved_at is not null
        join public.census_zones zone
          on zone.id = lot.zone_id and zone.active is true
        join public.census_acs_zone_assignments assignment
          on assignment.zone_id = lot.zone_id and assignment.active is true
        join public.census_acs acs
          on acs.id = assignment.acs_id and acs.active is true
        where lot.id = p_lot_id
          and map_import.status in ('DRAFT', 'PUBLISHED')
          and lot.is_valid is true
          and nullif(lower(btrim(acs.email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
      )
    );
$$;

create or replace function public.census_user_can_access_import(p_import_id uuid)
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
          on map_import.id = lot.import_id and map_import.division_saved_at is not null
        where lot.import_id = p_import_id
          and map_import.status in ('DRAFT', 'PUBLISHED')
          and lot.is_valid is true
          and public.census_user_can_access_lot(lot.id)
      )
    );
$$;

create or replace function public.census_user_can_access_household(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.census_households household
    where household.id = p_household_id
      and household.active is true
      and public.census_user_can_access_lot(household.lot_id)
  );
$$;

revoke all on function public.census_user_can_access_lot(uuid) from public, anon;
revoke all on function public.census_user_can_access_import(uuid) from public, anon;
revoke all on function public.census_user_can_access_household(uuid) from public, anon;
grant execute on function public.census_user_can_access_lot(uuid) to authenticated;
grant execute on function public.census_user_can_access_import(uuid) to authenticated;
grant execute on function public.census_user_can_access_household(uuid) to authenticated;

create or replace function public.census_visits_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  if new.status = 'COMPLETED' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'COMPLETED' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists census_visits_touch_updated_at on public.census_visits;
create trigger census_visits_touch_updated_at
  before insert or update on public.census_visits
  for each row execute function public.census_visits_touch_updated_at();

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
      join public.census_zones zone on zone.id = lot.zone_id and zone.active is true
      join public.census_acs_zone_assignments assignment
        on assignment.zone_id = zone.id and assignment.acs_id = new.acs_id and assignment.active is true
      join public.census_acs acs on acs.id = assignment.acs_id and acs.active is true
      where household.id = new.household_id and lot.is_valid is true
    ) then
      raise exception 'O ACS informado não está ativo e vinculado à zona deste domicílio.' using errcode = '23514';
    end if;
    return new;
  end if;

  select acs.id into matched_acs_id
  from public.census_households household
  join public.census_map_lots lot on lot.id = household.lot_id
  join public.census_map_imports map_import
    on map_import.id = lot.import_id and map_import.division_saved_at is not null
  join public.census_zones zone on zone.id = lot.zone_id and zone.active is true
  join public.census_acs_zone_assignments assignment
    on assignment.zone_id = zone.id and assignment.active is true
  join public.census_acs acs on acs.id = assignment.acs_id and acs.active is true
  where household.id = new.household_id
    and map_import.status in ('DRAFT', 'PUBLISHED')
    and lot.is_valid is true
    and nullif(lower(btrim(acs.email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
  order by acs.id
  limit 1;

  if matched_acs_id is null then
    raise exception 'Sua conta não está vinculada como ACS ativo à zona deste domicílio.' using errcode = '42501';
  end if;
  if new.acs_id is not null and new.acs_id <> matched_acs_id then
    raise exception 'O ACS da visita é definido pelo usuário autenticado.' using errcode = '42501';
  end if;
  new.acs_id := matched_acs_id;
  return new;
end;
$$;

drop trigger if exists census_visits_assign_acs_actor on public.census_visits;
create trigger census_visits_assign_acs_actor
  before insert or update on public.census_visits
  for each row execute function public.census_visits_assign_acs_actor();

revoke all on function public.census_visits_assign_acs_actor() from public, anon, authenticated;

create or replace function public.census_validate_questionnaire_answers(p_form_schema jsonb, p_answers jsonb, p_require_complete boolean)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  section_value jsonb;
  question_value jsonb;
  answer_value jsonb;
  row_value jsonb;
  column_value jsonb;
  cell_value jsonb;
  choice_value jsonb;
  question_id text;
  question_label text;
  question_type text;
  answer_text text;
  numeric_value numeric;
  signature_x numeric;
  signature_y numeric;
  required_value boolean;
  blank_value boolean;
  other_allowed boolean;
  filled_rows integer;
  selected_count integer;
begin
  if jsonb_typeof(p_form_schema) <> 'object'
     or jsonb_typeof(p_form_schema -> 'sections') <> 'array'
     or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'O formulário ou o conteúdo das respostas tem formato inválido.' using errcode = '23514';
  end if;

  for section_value in
    select element from jsonb_array_elements(p_form_schema -> 'sections') as sections(element)
  loop
    if jsonb_typeof(section_value -> 'questions') <> 'array' then continue; end if;
    for question_value in
      select element from jsonb_array_elements(section_value -> 'questions') as questions(element)
    loop
      question_id := nullif(question_value ->> 'id', '');
      question_label := coalesce(nullif(question_value ->> 'label', ''), 'Pergunta');
      question_type := question_value ->> 'type';
      required_value := coalesce((question_value ->> 'required')::boolean, false);
      other_allowed := coalesce((question_value ->> 'allowOther')::boolean, false);
      answer_value := p_answers -> question_id;
      blank_value := coalesce(answer_value is null
        or jsonb_typeof(answer_value) = 'null'
        or (jsonb_typeof(answer_value) = 'string' and btrim(answer_value #>> '{}') = '')
        or (jsonb_typeof(answer_value) = 'array' and jsonb_array_length(answer_value) = 0)
        or (question_type = 'signature' and jsonb_typeof(answer_value) = 'object'
            and jsonb_typeof(answer_value -> 'strokes') = 'array'
            and jsonb_array_length(answer_value -> 'strokes') = 0), false);

      if question_id is null or question_type is null then
        raise exception 'Há uma pergunta sem identificador ou tipo válido no snapshot.' using errcode = '23514';
      end if;
      if blank_value then
        if p_require_complete and required_value then
          raise exception 'Preencha a pergunta obrigatória: %.', question_label using errcode = '23514';
        end if;
        continue;
      end if;

      if question_type in ('short_text', 'long_text', 'phone') then
        if jsonb_typeof(answer_value) <> 'string' then
          raise exception 'A resposta de "%" deve ser texto.', question_label using errcode = '23514';
        end if;
        answer_text := answer_value #>> '{}';
        if p_require_complete and question_value #> '{validation,minLength}' is not null
           and char_length(btrim(answer_text)) < (question_value #>> '{validation,minLength}')::integer then
          raise exception 'A resposta de "%" está abaixo do tamanho mínimo.', question_label using errcode = '23514';
        end if;
        if question_value #> '{validation,maxLength}' is not null
           and char_length(answer_text) > (question_value #>> '{validation,maxLength}')::integer then
          raise exception 'A resposta de "%" excede o tamanho máximo.', question_label using errcode = '23514';
        end if;
      elsif question_type in ('number', 'currency') then
        if jsonb_typeof(answer_value) not in ('number', 'string') then
          raise exception 'A resposta de "%" deve ser numérica.', question_label using errcode = '23514';
        end if;
        answer_text := answer_value #>> '{}';
        if answer_text !~ '^[+-]?[0-9]+([.][0-9]+)?$' then
          raise exception 'A resposta de "%" deve ser um número válido.', question_label using errcode = '23514';
        end if;
        numeric_value := answer_text::numeric;
        if question_type = 'number' and numeric_value <> trunc(numeric_value) then
          raise exception 'A resposta de "%" deve ser um número inteiro.', question_label using errcode = '23514';
        end if;
        if p_require_complete and question_value #> '{validation,min}' is not null
           and numeric_value < (question_value #>> '{validation,min}')::numeric then
          raise exception 'A resposta de "%" está abaixo do mínimo permitido.', question_label using errcode = '23514';
        end if;
        if p_require_complete and question_value #> '{validation,max}' is not null
           and numeric_value > (question_value #>> '{validation,max}')::numeric then
          raise exception 'A resposta de "%" excede o máximo permitido.', question_label using errcode = '23514';
        end if;
      elsif question_type = 'date' then
        if jsonb_typeof(answer_value) <> 'string' or (answer_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception 'Informe uma data válida em "%".', question_label using errcode = '23514';
        end if;
        begin
          perform (answer_value #>> '{}')::date;
        exception when others then
          raise exception 'Informe uma data válida em "%".', question_label using errcode = '23514';
        end;
      elsif question_type = 'yes_no' then
        if jsonb_typeof(answer_value) <> 'boolean' then
          raise exception 'Escolha Sim ou Não em "%".', question_label using errcode = '23514';
        end if;
      elsif question_type = 'single_choice' then
        if jsonb_typeof(answer_value) <> 'string' then
          raise exception 'Selecione uma opção válida em "%".', question_label using errcode = '23514';
        end if;
        answer_text := answer_value #>> '{}';
        if other_allowed and answer_text like 'Outro:%' then
          if p_require_complete and btrim(substr(answer_text, 7)) = '' then
            raise exception 'Especifique a opção Outro em "%".', question_label using errcode = '23514';
          end if;
        elsif not exists (
          select 1 from jsonb_array_elements_text(coalesce(question_value -> 'options', '[]'::jsonb)) as options(option_text)
          where options.option_text = answer_text
        ) then
          raise exception 'Selecione uma opção válida em "%".', question_label using errcode = '23514';
        end if;
      elsif question_type = 'multiple_choice' then
        if jsonb_typeof(answer_value) <> 'array' then
          raise exception 'As opções de "%" estão em formato inválido.', question_label using errcode = '23514';
        end if;
        selected_count := jsonb_array_length(answer_value);
        if p_require_complete and question_value #> '{validation,minSelections}' is not null
           and selected_count < (question_value #>> '{validation,minSelections}')::integer then
          raise exception 'Selecione mais opções em "%".', question_label using errcode = '23514';
        end if;
        if p_require_complete and question_value #> '{validation,maxSelections}' is not null
           and selected_count > (question_value #>> '{validation,maxSelections}')::integer then
          raise exception 'Selecione menos opções em "%".', question_label using errcode = '23514';
        end if;
        for choice_value in select element from jsonb_array_elements(answer_value) as choices(element)
        loop
          if jsonb_typeof(choice_value) <> 'string' then
            raise exception 'Há uma opção inválida em "%".', question_label using errcode = '23514';
          end if;
          answer_text := choice_value #>> '{}';
          if other_allowed and answer_text like 'Outro:%' then
            if p_require_complete and btrim(substr(answer_text, 7)) = '' then
              raise exception 'Especifique a opção Outro em "%".', question_label using errcode = '23514';
            end if;
          elsif not exists (
            select 1 from jsonb_array_elements_text(coalesce(question_value -> 'options', '[]'::jsonb)) as options(option_text)
            where options.option_text = answer_text
          ) then
            raise exception 'Há uma opção inválida em "%".', question_label using errcode = '23514';
          end if;
        end loop;
      elsif question_type = 'table' then
        if jsonb_typeof(answer_value) <> 'array' then
          raise exception 'A tabela de "%" está em formato inválido.', question_label using errcode = '23514';
        end if;
        filled_rows := 0;
        for row_value in select element from jsonb_array_elements(answer_value) as answer_rows(element)
        loop
          if jsonb_typeof(row_value) <> 'object' then continue; end if;
          if exists (
            select 1 from jsonb_each(row_value) as cells(key, value)
            where cells.value <> 'null'::jsonb
              and not (jsonb_typeof(cells.value) = 'string' and btrim(cells.value #>> '{}') = '')
          ) then
            filled_rows := filled_rows + 1;
          end if;
          for column_value in select element from jsonb_array_elements(coalesce(question_value -> 'columns', '[]'::jsonb)) as column_rows(element)
          loop
            if column_value ->> 'type' <> 'number' then continue; end if;
            cell_value := row_value -> (column_value ->> 'id');
            if cell_value is null or jsonb_typeof(cell_value) = 'null'
               or (jsonb_typeof(cell_value) = 'string' and btrim(cell_value #>> '{}') = '') then continue; end if;
            answer_text := cell_value #>> '{}';
            if jsonb_typeof(cell_value) not in ('number', 'string') or answer_text !~ '^[+-]?[0-9]+([.][0-9]+)?$' then
              raise exception 'A coluna "%" da tabela precisa conter um número válido.', column_value ->> 'label' using errcode = '23514';
            end if;
            numeric_value := answer_text::numeric;
            if numeric_value <> trunc(numeric_value) then
              raise exception 'A coluna "%" da tabela precisa conter um número inteiro.', column_value ->> 'label' using errcode = '23514';
            end if;
          end loop;
        end loop;
        if p_require_complete and required_value and filled_rows = 0 then
          raise exception 'Preencha pelo menos uma linha em "%".', question_label using errcode = '23514';
        end if;
        if p_require_complete and question_value #> '{validation,minRows}' is not null
           and filled_rows < (question_value #>> '{validation,minRows}')::integer then
          raise exception 'Preencha mais linhas em "%".', question_label using errcode = '23514';
        end if;
        if p_require_complete and question_value #> '{validation,maxRows}' is not null
           and filled_rows > (question_value #>> '{validation,maxRows}')::integer then
          raise exception 'A tabela de "%" excede o limite de linhas.', question_label using errcode = '23514';
        end if;
      elsif question_type = 'signature' then
        if jsonb_typeof(answer_value) is distinct from 'object'
           or jsonb_typeof(answer_value -> 'strokes') is distinct from 'array'
           or coalesce(case when jsonb_typeof(answer_value -> 'strokes') = 'array'
             then jsonb_array_length(answer_value -> 'strokes') = 0
               or jsonb_array_length(answer_value -> 'strokes') > 20 else true end, true) then
          raise exception 'Registre uma assinatura em "%".', question_label using errcode = '23514';
        end if;
        selected_count := 0;
        for row_value in select element from jsonb_array_elements(answer_value -> 'strokes') as signature_strokes(element)
        loop
          if jsonb_typeof(row_value) is distinct from 'array'
             or coalesce(case when jsonb_typeof(row_value) = 'array' then jsonb_array_length(row_value) = 0 else true end, true) then
            raise exception 'A assinatura de "%" contém um traço inválido.', question_label using errcode = '23514';
          end if;
          for choice_value in select element from jsonb_array_elements(row_value) as signature_points(element)
          loop
            selected_count := selected_count + 1;
            if selected_count > 600
               or jsonb_typeof(choice_value) is distinct from 'array'
               or coalesce(case when jsonb_typeof(choice_value) = 'array' then jsonb_array_length(choice_value) <> 2 else true end, true)
               or jsonb_typeof(choice_value -> 0) is distinct from 'number'
               or jsonb_typeof(choice_value -> 1) is distinct from 'number' then
              raise exception 'A assinatura de "%" contém um ponto inválido.', question_label using errcode = '23514';
            end if;
            signature_x := (choice_value ->> 0)::numeric;
            signature_y := (choice_value ->> 1)::numeric;
            if signature_x < 0 or signature_x > 100 or signature_y < 0 or signature_y > 48 then
              raise exception 'A assinatura de "%" ultrapassa os limites do campo.', question_label using errcode = '23514';
            end if;
          end loop;
        end loop;
        if p_require_complete and selected_count < 2 then
          raise exception 'A assinatura de "%" precisa conter pelo menos dois pontos.', question_label using errcode = '23514';
        end if;
      else
        raise exception 'O tipo de pergunta "%" não é aceito.', question_type using errcode = '23514';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.census_validate_questionnaire_answers(jsonb, jsonb, boolean) from public, anon, authenticated;

create or replace function public.census_questionnaire_responses_prepare()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  questionnaire public.census_questionnaires%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into questionnaire
    from public.census_questionnaires
    where id = new.questionnaire_id and status = 'ACTIVE';

    if not found then
      raise exception 'O questionário não está ativo para iniciar novas respostas.' using errcode = '23514';
    end if;

    if new.questionnaire_version is not null and new.questionnaire_version <> questionnaire.version then
      raise exception 'O questionário foi alterado. Atualize a tela e abra uma nova resposta.' using errcode = '23514';
    end if;

    new.questionnaire_version := questionnaire.version;
    new.questionnaire_snapshot := jsonb_build_object(
      'id', questionnaire.id,
      'slug', questionnaire.slug,
      'version', questionnaire.version,
      'title', questionnaire.title,
      'subtitle', questionnaire.subtitle,
      'description', questionnaire.description,
      'form_schema', questionnaire.form_schema
    );
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
  else
    if new.visit_id is distinct from old.visit_id
       or new.questionnaire_id is distinct from old.questionnaire_id
       or new.questionnaire_version is distinct from old.questionnaire_version
       or new.questionnaire_snapshot is distinct from old.questionnaire_snapshot
       or new.created_by is distinct from old.created_by then
      raise exception 'O vínculo e a versão do questionário são imutáveis.' using errcode = '23514';
    end if;
    if old.status = 'SUBMITTED' then
      raise exception 'Uma resposta enviada não pode ser alterada; registre uma nova visita para correções.' using errcode = '23514';
    end if;
    new.updated_at := now();
  end if;

  perform public.census_validate_questionnaire_answers(
    new.questionnaire_snapshot -> 'form_schema', new.answers, new.status = 'SUBMITTED'
  );
  if new.status = 'SUBMITTED' then
    new.submitted_at := now();
  else
    new.submitted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists census_questionnaire_responses_prepare on public.census_questionnaire_responses;
create trigger census_questionnaire_responses_prepare
  before insert or update on public.census_questionnaire_responses
  for each row execute function public.census_questionnaire_responses_prepare();

revoke all on function public.census_questionnaire_responses_prepare() from public, anon, authenticated;

alter table public.census_households enable row level security;
alter table public.census_visits enable row level security;
alter table public.census_questionnaire_responses enable row level security;

drop policy if exists census_households_select_assigned on public.census_households;
create policy census_households_select_assigned
  on public.census_households for select to authenticated
  using (public.census_user_can_access_lot(lot_id));
drop policy if exists census_households_insert_assigned on public.census_households;
create policy census_households_insert_assigned
  on public.census_households for insert to authenticated
  with check (created_by = auth.uid() and public.census_user_can_access_lot(lot_id));
drop policy if exists census_households_update_assigned on public.census_households;
create policy census_households_update_assigned
  on public.census_households for update to authenticated
  using (public.census_user_can_access_lot(lot_id))
  with check ((created_by = auth.uid() or app_private.current_user_is_admin()) and public.census_user_can_access_lot(lot_id));

drop policy if exists census_visits_select_assigned on public.census_visits;
create policy census_visits_select_assigned
  on public.census_visits for select to authenticated
  using (public.census_user_can_access_household(household_id));
drop policy if exists census_visits_insert_assigned on public.census_visits;
create policy census_visits_insert_assigned
  on public.census_visits for insert to authenticated
  with check (created_by = auth.uid() and public.census_user_can_access_household(household_id));
drop policy if exists census_visits_update_assigned on public.census_visits;
create policy census_visits_update_assigned
  on public.census_visits for update to authenticated
  using (public.census_user_can_access_household(household_id))
  with check (public.census_user_can_access_household(household_id));

drop policy if exists census_responses_select_assigned on public.census_questionnaire_responses;
create policy census_responses_select_assigned
  on public.census_questionnaire_responses for select to authenticated
  using (exists (
    select 1 from public.census_visits visit
    where visit.id = visit_id
      and public.census_user_can_access_household(visit.household_id)
  ));
drop policy if exists census_responses_insert_assigned on public.census_questionnaire_responses;
create policy census_responses_insert_assigned
  on public.census_questionnaire_responses for insert to authenticated
  with check (created_by = auth.uid() and exists (
    select 1 from public.census_visits visit
    where visit.id = visit_id
      and public.census_user_can_access_household(visit.household_id)
  ));
drop policy if exists census_responses_update_assigned on public.census_questionnaire_responses;
create policy census_responses_update_assigned
  on public.census_questionnaire_responses for update to authenticated
  using (exists (
    select 1 from public.census_visits visit
    where visit.id = visit_id
      and public.census_user_can_access_household(visit.household_id)
  ))
  with check (exists (
    select 1 from public.census_visits visit
    where visit.id = visit_id
      and public.census_user_can_access_household(visit.household_id)
  ));

revoke all on table public.census_households, public.census_visits, public.census_questionnaire_responses from anon, authenticated;
grant select, insert, update on table public.census_households, public.census_visits, public.census_questionnaire_responses to authenticated;

create or replace view public.census_territory_map_imports
with (security_invoker = true)
as
select
  map_import.id,
  map_import.file_name,
  map_import.status,
  map_import.bbox,
  map_import.updated_at,
  map_import.division_saved_at
from public.census_map_imports map_import
where map_import.division_saved_at is not null
  and map_import.status in ('DRAFT', 'PUBLISHED')
  and public.census_user_can_access_import(map_import.id);

comment on view public.census_territory_map_imports is
  'Imports cuja divisão foi salva; ACS só veem mapas que contenham lotes autorizados para sua zona.';
revoke all on table public.census_territory_map_imports from anon, authenticated;
grant select on table public.census_territory_map_imports to authenticated;

create or replace view public.census_territory_map_lots
with (security_invoker = true)
as
select
  lot.id,
  lot.import_id,
  lot.source_handle,
  lot.label,
  lot.layer_name,
  lot.geometry,
  lot.area,
  lot.is_valid,
  lot.zone_number,
  lot.zone_id
from public.census_map_lots lot
join public.census_map_imports map_import on map_import.id = lot.import_id
where map_import.division_saved_at is not null
  and map_import.status in ('DRAFT', 'PUBLISHED')
  and lot.is_valid is true
  and public.census_user_can_access_lot(lot.id);

comment on view public.census_territory_map_lots is
  'Mapa territorial limitado aos lotes vinculados às zonas autorizadas para o usuário autenticado.';
revoke all on table public.census_territory_map_lots from anon, authenticated;
grant select on table public.census_territory_map_lots to authenticated;

create or replace view public.census_household_map_summary
with (security_invoker = true)
as
select
  household.id as household_id,
  household.lot_id,
  (
    select count(*)::integer
    from public.census_visits visit
    where visit.household_id = household.id and visit.status <> 'CANCELLED'
  ) as visit_count,
  (
    select max(visit.visit_date)
    from public.census_visits visit
    where visit.household_id = household.id and visit.status <> 'CANCELLED'
  ) as last_visit_date,
  (
    select count(*)::integer
    from public.census_questionnaire_responses response
    join public.census_visits visit on visit.id = response.visit_id
    where visit.household_id = household.id and response.status = 'SUBMITTED'
  ) as submitted_questionnaire_count,
  (
    select case
      when (response.answers ->> 'q-1-1') ~ '^[0-9]{1,3}$'
        then (response.answers ->> 'q-1-1')::integer
      else null
    end
    from public.census_questionnaire_responses response
    join public.census_visits visit on visit.id = response.visit_id
    where visit.household_id = household.id
      and response.status = 'SUBMITTED'
      and response.questionnaire_snapshot ->> 'slug' = 'ficha-cadastro-acompanhamento-domiciliar'
    order by response.submitted_at desc nulls last, response.created_at desc
    limit 1
  ) as resident_count,
  (
    select case
      when response.answers ->> 'q-3-2-faixa' in (
        'Sem renda', 'Até 1 salário mínimo', 'De 1 a 2 salários mínimos',
        'De 2 a 3 salários mínimos', 'Acima de 3 salários mínimos'
      ) then response.answers ->> 'q-3-2-faixa'
      else null
    end
    from public.census_questionnaire_responses response
    join public.census_visits visit on visit.id = response.visit_id
    where visit.household_id = household.id
      and response.status = 'SUBMITTED'
      and response.questionnaire_snapshot ->> 'slug' = 'ficha-cadastro-acompanhamento-domiciliar'
    order by response.submitted_at desc nulls last, response.created_at desc
    limit 1
  ) as income_band
from public.census_households household
where household.active is true;

comment on view public.census_household_map_summary is
  'Resumo mínimo para o mapa: contagens, data de visita, população declarada e faixa de renda; não inclui respostas de saúde, nomes, assinatura ou valor exato.';
revoke all on table public.census_household_map_summary from anon, authenticated;
grant select on table public.census_household_map_summary to authenticated;

-- Substitui as policies abertas herdadas antes da captura de dados domiciliares.
alter table public.census_map_imports enable row level security;
alter table public.census_map_zones enable row level security;
alter table public.census_map_lots enable row level security;
alter table public.census_zones enable row level security;
alter table public.census_acs enable row level security;
alter table public.census_acs_zone_assignments enable row level security;
alter table public.census_questionnaires enable row level security;

drop policy if exists census_map_imports_open_authenticated on public.census_map_imports;
drop policy if exists census_map_imports_select_accessible on public.census_map_imports;
create policy census_map_imports_select_accessible
  on public.census_map_imports for select to authenticated
  using (public.census_user_can_access_import(id));
drop policy if exists census_map_imports_admin_manage on public.census_map_imports;
create policy census_map_imports_admin_manage
  on public.census_map_imports for all to authenticated
  using (app_private.current_user_is_admin())
  with check (app_private.current_user_is_admin());

drop policy if exists census_map_zones_open_authenticated on public.census_map_zones;
drop policy if exists census_map_zones_select_accessible on public.census_map_zones;
create policy census_map_zones_select_accessible
  on public.census_map_zones for select to authenticated
  using (public.census_user_can_access_import(import_id));
drop policy if exists census_map_zones_admin_manage on public.census_map_zones;
create policy census_map_zones_admin_manage
  on public.census_map_zones for all to authenticated
  using (app_private.current_user_is_admin())
  with check (app_private.current_user_is_admin());

drop policy if exists census_map_lots_open_authenticated on public.census_map_lots;
drop policy if exists census_map_lots_select_accessible on public.census_map_lots;
create policy census_map_lots_select_accessible
  on public.census_map_lots for select to authenticated
  using (public.census_user_can_access_lot(id));
drop policy if exists census_map_lots_admin_manage on public.census_map_lots;
create policy census_map_lots_admin_manage
  on public.census_map_lots for all to authenticated
  using (app_private.current_user_is_admin())
  with check (app_private.current_user_is_admin());

drop policy if exists census_zones_open_authenticated on public.census_zones;
drop policy if exists census_zones_select_authenticated on public.census_zones;
create policy census_zones_select_authenticated
  on public.census_zones for select to authenticated
  using (auth.uid() is not null);
drop policy if exists census_zones_admin_manage on public.census_zones;
create policy census_zones_admin_manage
  on public.census_zones for all to authenticated
  using (app_private.current_user_is_admin())
  with check (app_private.current_user_is_admin());

drop policy if exists census_acs_open_authenticated on public.census_acs;
drop policy if exists census_acs_select_self_or_admin on public.census_acs;
create policy census_acs_select_self_or_admin
  on public.census_acs for select to authenticated
  using (
    app_private.current_user_is_admin()
    or nullif(lower(btrim(email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
  );
drop policy if exists census_acs_admin_manage on public.census_acs;
create policy census_acs_admin_manage
  on public.census_acs for all to authenticated
  using (app_private.current_user_is_admin())
  with check (app_private.current_user_is_admin());

drop policy if exists census_acs_zone_assignments_open_authenticated on public.census_acs_zone_assignments;
drop policy if exists census_acs_zone_assignments_admin_manage on public.census_acs_zone_assignments;
create policy census_acs_zone_assignments_admin_manage
  on public.census_acs_zone_assignments for all to authenticated
  using (app_private.current_user_is_admin())
  with check (app_private.current_user_is_admin());

drop policy if exists census_questionnaires_authenticated_manage on public.census_questionnaires;
drop policy if exists census_questionnaires_active_read on public.census_questionnaires;
create policy census_questionnaires_active_read
  on public.census_questionnaires for select to authenticated
  using (status = 'ACTIVE' or app_private.current_user_is_admin());
drop policy if exists census_questionnaires_admin_manage on public.census_questionnaires;
create policy census_questionnaires_admin_manage
  on public.census_questionnaires for all to authenticated
  using (app_private.current_user_is_admin())
  with check (app_private.current_user_is_admin());

drop policy if exists census_maps_storage_authenticated on storage.objects;
drop policy if exists census_maps_storage_admin_manage on storage.objects;
create policy census_maps_storage_admin_manage
  on storage.objects for all to authenticated
  using (bucket_id = 'census-maps' and app_private.current_user_is_admin())
  with check (bucket_id = 'census-maps' and app_private.current_user_is_admin());

revoke all on table public.census_map_imports, public.census_map_zones, public.census_map_lots,
  public.census_zones, public.census_acs, public.census_acs_zone_assignments,
  public.census_questionnaires from anon, authenticated;
grant select, insert, update on table public.census_map_imports, public.census_map_zones, public.census_map_lots to authenticated;
grant select, insert, update on table public.census_zones to authenticated;
grant select, insert, update on table public.census_acs, public.census_acs_zone_assignments to authenticated;
grant select, insert, update on table public.census_questionnaires to authenticated;
