-- Fila auditável para notificações de recebimento de primeiro acesso.
create table if not exists public.fleet_station_email_notifications (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id),
  request_id uuid not null references public.fleet_station_access_requests(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  notification_type text not null default 'PRIMEIRO_ACESSO_RECEBIDO',
  status text not null default 'PENDENTE' check (status in ('PENDENTE','ENVIADO','ERRO')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, notification_type)
);

create index if not exists fleet_station_email_notifications_pending_idx
  on public.fleet_station_email_notifications (status, created_at);

alter table public.fleet_station_email_notifications enable row level security;

drop policy if exists fleet_station_email_notifications_manager_read on public.fleet_station_email_notifications;
create policy fleet_station_email_notifications_manager_read
  on public.fleet_station_email_notifications for select
  using (municipio_id = public.fleet_current_municipio_id() and public.fleet_is_manager());

create or replace function public.fleet_queue_access_received_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.fleet_station_email_notifications (municipio_id, request_id, recipient_email, subject)
  values (
    new.municipio_id,
    new.id,
    new.representante_email,
    'Prefeitura de Pitangueiras — Pedido de Primeiro Acesso recebido'
  )
  on conflict (request_id, notification_type) do nothing;
  return new;
end;
$$;

drop trigger if exists fleet_access_request_queue_email on public.fleet_station_access_requests;
create trigger fleet_access_request_queue_email
after insert on public.fleet_station_access_requests
for each row execute function public.fleet_queue_access_received_email();

create or replace function public.fleet_update_email_notification(
  p_id uuid,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.fleet_station_email_notifications
  set status = p_status,
      attempts = attempts + 1,
      last_error = p_error,
      sent_at = case when p_status = 'ENVIADO' then now() else sent_at end,
      updated_at = now()
  where id = p_id;
  return found;
end;
$$;
