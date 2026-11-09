create table if not exists public.census_questionnaires (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (length(btrim(title)) > 0),
  subtitle text not null default '',
  description text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'INACTIVE')),
  form_schema jsonb not null default '{"sections":[]}'::jsonb
    check (
      jsonb_typeof(form_schema) = 'object'
      and coalesce(jsonb_typeof(form_schema -> 'sections') = 'array', false)
    ),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.census_questionnaires is
  'Definições e versões de questionários do Censo Municipal; não armazena respostas de domicílios.';

create index if not exists census_questionnaires_status_updated_idx
  on public.census_questionnaires (status, updated_at desc);

create or replace function public.census_questionnaires_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists census_questionnaires_touch_updated_at on public.census_questionnaires;
create trigger census_questionnaires_touch_updated_at
  before update on public.census_questionnaires
  for each row execute function public.census_questionnaires_touch_updated_at();

alter table public.census_questionnaires enable row level security;

drop policy if exists census_questionnaires_authenticated_manage on public.census_questionnaires;
create policy census_questionnaires_authenticated_manage
  on public.census_questionnaires
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on table public.census_questionnaires from anon, authenticated;
grant select, insert, update on table public.census_questionnaires to authenticated;

insert into public.census_questionnaires (slug, title, subtitle, description, status, form_schema)
values (
  'ficha-cadastro-acompanhamento-domiciliar',
  'FICHA DE CADASTRO E ACOMPANHAMENTO DOMICILIAR',
  'Levantamento Socioeconômico, Habitacional e de Saúde Familiar',
  'Ficha de levantamento socioeconômico, habitacional e de saúde familiar para cadastro e acompanhamento domiciliar.',
  'DRAFT',
  $questionnaire$
  {
    "sections": [
      {
        "id": "identificacao-domicilio",
        "title": "Identificação do domicílio",
        "description": "Dados da visita e do responsável pelo preenchimento.",
        "questions": [
          {"id":"ident-data","label":"Data do Preenchimento","type":"date","required":false},
          {"id":"ident-telefone","label":"Telefone","type":"phone","required":false},
          {"id":"ident-responsavel","label":"Responsável pelo Preenchimento","type":"short_text","required":false},
          {"id":"ident-bairro","label":"Bairro / Comunidade","type":"short_text","required":false},
          {"id":"ident-endereco","label":"Endereço Completo","type":"long_text","required":false}
        ]
      },
      {
        "id": "composicao-familiar",
        "title": "1. COMPOSIÇÃO FAMILIAR",
        "questions": [
          {"id":"q-1-1","code":"1.1","label":"1.1. Quantas pessoas moram na residência (incluindo crianças e idosos)?","type":"number","required":false,"helpText":"Total de moradores:","validation":{"min":0}},
          {"id":"q-1-2","code":"1.2","label":"1.2. Relação de moradores e suas respectivas idades:","type":"table","required":false,"columns":[{"id":"morador-nome-parentesco","label":"Nome / Parentesco do Morador","type":"short_text"},{"id":"morador-idade","label":"Idade","type":"number"}],"rowLabels":["1. (Responsável)","2.","3.","4.","5.","6.","7.","8."],"validation":{"minRows":0,"maxRows":8}}
        ]
      },
      {
        "id": "moradia-infraestrutura",
        "title": "2. CONDIÇÕES DE MORADIA E INFRAESTRUTURA",
        "questions": [
          {"id":"q-2-1","code":"2.1","label":"2.1. Situação do imóvel:","type":"single_choice","required":false,"options":["Própria","Alugada","Cedida / Emprestada","Outra (com especificação)"]},
          {"id":"q-2-1-outra","label":"Se selecionou Outra, especifique:","type":"short_text","required":false},
          {"id":"q-2-2","code":"2.2","label":"2.2. Quantos cômodos possui a casa ao todo (incluindo banheiro e cozinha)?","type":"number","required":false,"helpText":"Total de cômodos:","validation":{"min":0}},
          {"id":"q-2-3","code":"2.3","label":"2.3. A residência possui caixa d'água?","type":"yes_no","required":false}
        ]
      },
      {
        "id": "trabalho-renda-beneficios",
        "title": "3. TRABALHO, RENDA E BENEFÍCIOS SOCIAIS",
        "questions": [
          {"id":"q-3-1","code":"3.1","label":"3.1. Quantas pessoas trabalham na residência (trabalho formal ou informal)?","type":"number","required":false,"helpText":"Total de trabalhadores:","validation":{"min":0}},
          {"id":"q-3-2-faixa","code":"3.2","label":"3.2. Qual é a renda familiar mensal aproximada (soma de todos os moradores)?","type":"single_choice","required":false,"options":["Sem renda","Até 1 salário mínimo","De 1 a 2 salários mínimos","De 2 a 3 salários mínimos","Acima de 3 salários mínimos"]},
          {"id":"q-3-2-valor","label":"Valor estimado: R$","type":"currency","required":false,"helpText":"Valor aproximado da renda familiar mensal, se disponível.","validation":{"min":0}},
          {"id":"q-3-3-sim-nao","code":"3.3","label":"3.3. A família recebe algum benefício municipal ou federal?","type":"yes_no","required":false},
          {"id":"q-3-3-beneficios","label":"Sim — Assinale qual(is):","type":"multiple_choice","required":false,"helpText":"Se respondeu Sim, marque todos os benefícios recebidos.","options":["Bolsa Família","BPC / LOAS","Auxílio Gás","Tarifa Social de Energia","Outro(s) benefício(s) — especificar"]},
          {"id":"q-3-3-outro-detalhe","label":"Outro(s) benefício(s), com especificação em texto:","type":"long_text","required":false}
        ]
      },
      {
        "id": "saude-familia",
        "title": "4. CONDIÇÕES DE SAÚDE DA FAMÍLIA",
        "questions": [
          {"id":"q-4-1-sim-nao","code":"4.1","label":"4.1. Alguma pessoa na residência possui algum tipo de doença crônica?","type":"yes_no","required":false,"helpText":"Ex: hipertensão, diabetes, asma, problemas cardíacos."},
          {"id":"q-4-1-detalhe","label":"Sim — Especifique quem e qual a doença:","type":"long_text","required":false,"helpText":"Preencha se respondeu Sim à pergunta 4.1."},
          {"id":"q-4-2-sim-nao","code":"4.2","label":"4.2. Há alguém na residência aguardando algum tipo de serviço médico?","type":"yes_no","required":false},
          {"id":"q-4-2-servicos","label":"Sim — Assinale o(s) serviço(s) e informe a especialidade / procedimento:","type":"multiple_choice","required":false,"helpText":"Se respondeu Sim, selecione os serviços aguardados.","options":["Cirurgia","Consulta Especializada","Exame de média/alta complexidade"]},
          {"id":"q-4-2-cirurgia","label":"Cirurgia. Qual?","type":"short_text","required":false},
          {"id":"q-4-2-consulta","label":"Consulta Especializada. Qual?","type":"short_text","required":false},
          {"id":"q-4-2-exame","label":"Exame de média/alta complexidade. Qual?","type":"short_text","required":false},
          {"id":"q-4-3-sim-nao","code":"4.3","label":"4.3. Alguém na residência faz uso de medicamentos contínuos?","type":"yes_no","required":false},
          {"id":"q-4-3-detalhe","label":"Sim — Quais medicamentos são utilizados?","type":"long_text","required":false,"helpText":"Preencha se respondeu Sim à pergunta 4.3."},
          {"id":"q-4-4-sim-nao","code":"4.4","label":"4.4. Alguém na casa fuma?","type":"yes_no","required":false},
          {"id":"q-4-4-quantidade","label":"Sim — Quantas pessoas?","type":"number","required":false,"helpText":"Preencha se respondeu Sim à pergunta 4.4.","validation":{"min":0}},
          {"id":"assinatura-morador-responsavel","label":"Assinatura do Morador Responsável","type":"signature","required":false}
        ]
      }
    ]
  }
  $questionnaire$::jsonb
)
on conflict (slug) do nothing;
