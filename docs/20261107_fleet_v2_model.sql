-- DESENHO DE MODELAGEM — MÓDULO DE GESTÃO DE FROTAS v2.0
-- Projeto: Inteligência Municipal / Supabase principal
-- Status: DRAFT — NÃO APLICAR SEM REVISÃO ADMINISTRATIVA E TÉCNICA
-- Base: MÓDULO DE GESTÃO DE FROTAS — versão 2.0
--
-- Esta migration modela o primeiro ciclo operacional:
-- veículos, combustíveis, motoristas, postos, usuários de postos,
-- autorizações de cessão, submissão de abastecimentos, comprovantes,
-- conferência e fechamento mensal.
-- Relatórios, manutenção, multas, seguros e custos consolidados ficam para fases futuras.
--
-- Reuso do backend existente:
-- public.municipios (tenant), public.unidades_organizacionais (secretarias),
-- public.usuarios (identidade municipal), public.fornecedores (fornecedor/posto quando aplicável),
-- public.auditoria_eventos/permissões existentes devem ser avaliados antes de duplicação.

create extension if not exists pgcrypto;

create type public.fleet_user_role as enum (
  'ADMINISTRADOR',
  'GESTOR_FROTAS',
  'FISCAL_FROTAS',
  'PREFEITO',
  'GESTOR_SECRETARIA',
  'POSTO_REPRESENTANTE',
  'POSTO_OPERADOR'
);

create type public.fleet_vehicle_status as enum ('ATIVO', 'INATIVO', 'EM_MANUTENCAO', 'BAIXADO', 'CEDIDO');
create type public.fleet_station_status as enum ('PENDENTE', 'ATIVO', 'SUSPENSO', 'INATIVO');
create type public.fleet_station_member_role as enum ('REPRESENTANTE_LEGAL', 'OPERADOR', 'FRENTISTA', 'CAIXA_CONFERENTE');
create type public.fleet_authorization_status as enum ('RASCUNHO', 'PENDENTE', 'APROVADA', 'REJEITADA', 'EXPIRADA', 'CANCELADA');
create type public.fleet_fueling_status as enum (
  'RASCUNHO', 'ENVIADO_PELO_POSTO', 'PENDENTE_DE_COMPROVANTE', 'PENDENTE_DE_CONFERENCIA',
  'EM_ANALISE', 'COM_INCONSISTENCIA', 'SOLICITADA_CORRECAO', 'CORRIGIDO',
  'CONFERIDO', 'INCLUIDO_NO_FECHAMENTO', 'CANCELADO'
);
create type public.fleet_document_status as enum ('PENDENTE', 'ENVIADO', 'EM_ANALISE', 'ACEITO', 'REJEITADO', 'SUBSTITUIDO');
create type public.fleet_closure_status as enum ('ABERTO', 'EM_CONFERENCIA', 'COM_DIVERGENCIA', 'CONFERIDO', 'FECHADO', 'REABERTO');

create table public.fleet_roles (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  usuario_id integer not null references public.usuarios(id),
  role public.fleet_user_role not null,
  ativo boolean not null default true,
  concedido_por integer references public.usuarios(id),
  justificativa text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipio_id, usuario_id, role)
);

create table public.fleet_fuel_types (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  nome text not null,
  sigla text,
  unidade_medida text not null default 'L',
  ativo boolean not null default true,
  created_by integer references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipio_id, nome)
);

create table public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  placa text not null,
  marca text,
  modelo text,
  ano_fabricacao smallint,
  ano_modelo smallint,
  chassi text,
  renavam text,
  fuel_type_id uuid references public.fleet_fuel_types(id),
  tank_capacity_l numeric(10,2) not null check (tank_capacity_l > 0),
  responsible_unit_id uuid references public.unidades_organizacionais(id),
  operational_status public.fleet_vehicle_status not null default 'ATIVO',
  current_odometer_km numeric(14,2) check (current_odometer_km >= 0),
  photo_path text,
  notes text,
  created_by integer references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipio_id, placa),
  unique (municipio_id, chassi)
);

create table public.fleet_vehicle_history (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  vehicle_id uuid not null references public.fleet_vehicles(id),
  event_type text not null check (event_type in ('CADASTRO','ALTERACAO','TRANSFERENCIA','SITUACAO','CAPACIDADE_TANQUE','INATIVACAO')),
  previous_data jsonb,
  new_data jsonb,
  reason text,
  changed_by integer references public.usuarios(id),
  changed_at timestamptz not null default now()
);

create table public.fleet_drivers (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  usuario_id integer references public.usuarios(id),
  nome text not null,
  matricula text,
  cpf text,
  cnh_number text,
  cnh_valid_until date,
  unidade_id uuid references public.unidades_organizacionais(id),
  ativo boolean not null default true,
  created_by integer references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipio_id, matricula)
);

create table public.fleet_vehicle_authorized_drivers (
  vehicle_id uuid not null references public.fleet_vehicles(id),
  driver_id uuid not null references public.fleet_drivers(id),
  municipio_id uuid not null references public.municipios(id),
  valid_from date,
  valid_until date,
  ativo boolean not null default true,
  created_by integer references public.usuarios(id),
  created_at timestamptz not null default now(),
  primary key (vehicle_id, driver_id)
);

create table public.fleet_fuel_stations (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  fornecedor_id integer references public.fornecedores(id),
  razao_social_snapshot text not null,
  nome_fantasia_snapshot text,
  cnpj_snapshot text not null,
  endereco text,
  cidade text,
  uf char(2),
  representante_nome text not null,
  representante_documento text,
  representante_email text,
  representante_telefone text,
  status public.fleet_station_status not null default 'PENDENTE',
  credenciamento_started_at date,
  credenciamento_ends_at date,
  notes text,
  created_by integer references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipio_id, cnpj_snapshot)
);

create table public.fleet_station_members (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  station_id uuid not null references public.fleet_fuel_stations(id),
  usuario_id integer not null references public.usuarios(id),
  role public.fleet_station_member_role not null,
  ativo boolean not null default true,
  is_primary_contact boolean not null default false,
  granted_by integer references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, usuario_id)
);

create table public.fleet_vehicle_authorizations (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  vehicle_id uuid not null references public.fleet_vehicles(id),
  responsible_unit_id uuid not null references public.unidades_organizacionais(id),
  beneficiary_unit_id uuid not null references public.unidades_organizacionais(id),
  requested_by integer not null references public.usuarios(id),
  authorized_by integer references public.usuarios(id),
  purpose text not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  status public.fleet_authorization_status not null default 'PENDENTE',
  approval_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until > valid_from),
  check (responsible_unit_id <> beneficiary_unit_id or purpose is not null)
);

create table public.fleet_fuelings (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  vehicle_id uuid not null references public.fleet_vehicles(id),
  station_id uuid not null references public.fleet_fuel_stations(id),
  fuel_type_id uuid not null references public.fleet_fuel_types(id),
  driver_id uuid references public.fleet_drivers(id),
  responsible_unit_id uuid not null references public.unidades_organizacionais(id),
  beneficiary_unit_id uuid references public.unidades_organizacionais(id),
  authorization_id uuid references public.fleet_vehicle_authorizations(id),
  -- Submissão do posto não é o mesmo que cadastro oficial municipal.
  status public.fleet_fueling_status not null default 'ENVIADO_PELO_POSTO',
  performed_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  created_by integer not null references public.usuarios(id),
  registered_officially_by integer references public.usuarios(id),
  registered_officially_at timestamptz,
  liters numeric(10,3) not null check (liters > 0),
  unit_price numeric(12,4) not null check (unit_price >= 0),
  total_amount numeric(14,2) generated always as (round(liters * unit_price, 2)) stored,
  odometer_km numeric(14,2) not null check (odometer_km >= 0),
  station_receipt_number text,
  notes text,
  inconsistency_code text,
  inconsistency_notes text,
  correction_requested_at timestamptz,
  correction_requested_by integer references public.usuarios(id),
  corrected_at timestamptz,
  corrected_by integer references public.usuarios(id),
  canceled_at timestamptz,
  canceled_by integer references public.usuarios(id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, station_receipt_number),
  check (beneficiary_unit_id is not null or authorization_id is null)
);

create table public.fleet_fueling_documents (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  fueling_id uuid not null references public.fleet_fuelings(id),
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  document_status public.fleet_document_status not null default 'ENVIADO',
  uploaded_by integer not null references public.usuarios(id),
  uploaded_at timestamptz not null default now(),
  due_at timestamptz not null,
  reviewed_by integer references public.usuarios(id),
  reviewed_at timestamptz,
  rejection_reason text,
  replaced_document_id uuid references public.fleet_fueling_documents(id),
  is_current boolean not null default true
);

create table public.fleet_fueling_status_history (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  fueling_id uuid not null references public.fleet_fuelings(id),
  previous_status public.fleet_fueling_status,
  new_status public.fleet_fueling_status not null,
  reason text,
  notes text,
  changed_by integer not null references public.usuarios(id),
  changed_at timestamptz not null default now()
);

create table public.fleet_monthly_closures (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  reference_year smallint not null check (reference_year between 2000 and 2200),
  reference_month smallint not null check (reference_month between 1 and 12),
  status public.fleet_closure_status not null default 'ABERTO',
  started_by integer references public.usuarios(id),
  checked_by integer references public.usuarios(id),
  closed_by integer references public.usuarios(id),
  started_at timestamptz,
  checked_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  reopening_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipio_id, reference_year, reference_month)
);

create table public.fleet_monthly_closure_station_checks (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  closure_id uuid not null references public.fleet_monthly_closures(id),
  station_id uuid not null references public.fleet_fuel_stations(id),
  registered_fueling_count integer not null default 0,
  registered_liters numeric(14,3) not null default 0,
  registered_amount numeric(14,2) not null default 0,
  invoiced_amount numeric(14,2),
  divergence_amount numeric(14,2),
  documents_pending_count integer not null default 0,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','CONFERIDO','COM_DIVERGENCIA')),
  checked_by integer references public.usuarios(id),
  checked_at timestamptz,
  notes text,
  unique (closure_id, station_id)
);

create table public.fleet_inconsistencies (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  fueling_id uuid references public.fleet_fuelings(id),
  vehicle_id uuid references public.fleet_vehicles(id),
  code text not null,
  severity text not null check (severity in ('INFORMATIVO','ATENCAO','BLOQUEIO')),
  title text not null,
  description text not null,
  status text not null default 'ABERTA' check (status in ('ABERTA','EM_ANALISE','RESOLVIDA','IGNORADA')),
  resolved_by integer references public.usuarios(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

-- Índices para consultas do dashboard e segregação por escopo.
create index fleet_vehicles_municipio_status_idx on public.fleet_vehicles (municipio_id, operational_status);
create index fleet_fuelings_municipio_date_idx on public.fleet_fuelings (municipio_id, performed_at desc);
create index fleet_fuelings_vehicle_date_idx on public.fleet_fuelings (vehicle_id, performed_at desc);
create index fleet_fuelings_station_date_idx on public.fleet_fuelings (station_id, performed_at desc);
create index fleet_fuelings_status_idx on public.fleet_fuelings (municipio_id, status);
create index fleet_documents_due_idx on public.fleet_fueling_documents (municipio_id, due_at, document_status);
create index fleet_authorizations_validity_idx on public.fleet_vehicle_authorizations (vehicle_id, valid_from, valid_until, status);
create index fleet_closures_ref_idx on public.fleet_monthly_closures (municipio_id, reference_year, reference_month);

-- Funções auxiliares de autorização: devem ser ajustadas ao padrão definitivo de auth/tenant já adotado.
create or replace function public.fleet_current_usuario_id()
returns integer
language sql stable security definer set search_path = public
as $$
  select u.id from public.usuarios u where u.uuid = auth.uid() and u.ativo = true limit 1;
$$;

create or replace function public.fleet_current_municipio_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select municipio_id from public.usuarios_modulos um where um.usuario_id = public.fleet_current_usuario_id() and um.permitido = true and um.modulo = 'frotas' limit 1),
    (select m.id from public.municipios m where m.ativo = true order by m.created_at limit 1)
  );
$$;

create or replace function public.fleet_has_role(expected_role public.fleet_user_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.fleet_roles r
    where r.usuario_id = public.fleet_current_usuario_id()
      and r.role = expected_role and r.ativo = true
  );
$$;

create or replace function public.fleet_is_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.fleet_has_role('ADMINISTRADOR') or public.fleet_has_role('GESTOR_FROTAS');
$$;

create or replace function public.fleet_is_mayor_or_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.fleet_is_manager() or public.fleet_has_role('PREFEITO');
$$;

-- Validação central da capacidade do tanque. A regra pode converter excesso em inconsistência
-- em vez de bloquear, caso a Administração aprove exceções auditáveis.
create or replace function public.fleet_validate_fueling()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  capacity numeric;
  auth_ok boolean;
begin
  select tank_capacity_l into capacity from public.fleet_vehicles where id = new.vehicle_id and municipio_id = new.municipio_id;
  if capacity is null then raise exception 'Veículo sem capacidade de tanque válida'; end if;
  if new.liters > capacity then
    new.status := 'COM_INCONSISTENCIA';
    new.inconsistency_code := 'LITROS_ACIMA_DA_CAPACIDADE';
    new.inconsistency_notes := coalesce(new.inconsistency_notes,'') || format(' Litros informados: %s; capacidade: %s.', new.liters, capacity);
  end if;
  if new.authorization_id is not null then
    select exists (
      select 1 from public.fleet_vehicle_authorizations a
      where a.id = new.authorization_id and a.vehicle_id = new.vehicle_id
        and a.status = 'APROVADA' and new.performed_at between a.valid_from and a.valid_until
        and a.beneficiary_unit_id = new.beneficiary_unit_id
    ) into auth_ok;
    if not auth_ok then raise exception 'Autorização de uso/abastecimento inválida ou expirada'; end if;
  end if;
  return new;
end;
$$;

create trigger fleet_fueling_validate_before_write
before insert or update of vehicle_id, liters, performed_at, authorization_id, beneficiary_unit_id
on public.fleet_fuelings for each row execute function public.fleet_validate_fueling();

-- RLS: políticas abaixo são a base de desenho e devem ser revisadas contra o padrão
-- de funções/claims já usado pelo projeto antes de aplicar em produção.
alter table public.fleet_roles enable row level security;
alter table public.fleet_fuel_types enable row level security;
alter table public.fleet_vehicles enable row level security;
alter table public.fleet_vehicle_history enable row level security;
alter table public.fleet_drivers enable row level security;
alter table public.fleet_vehicle_authorized_drivers enable row level security;
alter table public.fleet_fuel_stations enable row level security;
alter table public.fleet_station_members enable row level security;
alter table public.fleet_vehicle_authorizations enable row level security;
alter table public.fleet_fuelings enable row level security;
alter table public.fleet_fueling_documents enable row level security;
alter table public.fleet_fueling_status_history enable row level security;
alter table public.fleet_monthly_closures enable row level security;
alter table public.fleet_monthly_closure_station_checks enable row level security;
alter table public.fleet_inconsistencies enable row level security;

-- A política operacional central: gestores/admins gerenciam; postos somente submetem
-- registros do próprio posto; prefeitos consultam o consolidado.
create policy fleet_vehicles_read on public.fleet_vehicles for select using (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_mayor_or_manager());
create policy fleet_vehicles_manage on public.fleet_vehicles for all using (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager()) with check (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager());
create policy fleet_fuelings_manager_read on public.fleet_fuelings for select using (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_mayor_or_manager());
create policy fleet_fuelings_station_read on public.fleet_fuelings for select using (municipio_id = public.fleet_current_municipio_id() and exists (select 1 from public.fleet_station_members sm where sm.station_id = fleet_fuelings.station_id and sm.usuario_id = public.fleet_current_usuario_id() and sm.ativo = true));
create policy fleet_fuelings_manager_write on public.fleet_fuelings for all using (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager()) with check (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager());
create policy fleet_fuelings_station_submit on public.fleet_fuelings for insert with check (municipio_id = public.fleet_current_municipio_id() and status in ('RASCUNHO','ENVIADO_PELO_POSTO') and exists (select 1 from public.fleet_station_members sm where sm.station_id = fleet_fuelings.station_id and sm.usuario_id = public.fleet_current_usuario_id() and sm.ativo = true));
create policy fleet_fueling_documents_manager on public.fleet_fueling_documents for all using (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager()) with check (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager());
create policy fleet_closures_manager on public.fleet_monthly_closures for all using (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager()) with check (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager());

-- Supabase Storage: criar bucket PRIVADO 'fleet-documents' e policies de objeto
-- somente depois de confirmar o padrão de claims/tenant. Nunca usar bucket público.
-- O path recomendado é: <municipio_id>/fuelings/<fueling_id>/<uuid>-<filename>.

-- Pontos de revisão antes de aplicar:
-- 1) Confirmar o mapeamento definitivo de secretaria para unidades_organizacionais.
-- 2) Confirmar o vínculo auth.uid() -> usuarios.uuid.
-- 3) Decidir se usuários de posto serão provisionados pela Prefeitura ou pelo representante.
-- 4) Definir se excesso de litros bloqueia ou apenas cria inconsistência.
-- 5) Revisar nomes de módulo/claims e reutilizar auditoria existente.
-- 6) Aplicar somente em homologação com dados fictícios antes de produção.
