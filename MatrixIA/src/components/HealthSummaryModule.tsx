import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Clock3,
  Database,
  Filter,
  History,
  Pill,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import type { MunicipalRequest } from "../data/requests";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import type { HealthActivitiesDataset } from "../data/healthActivities";
import {
  getHealthReferralSummary,
  type HealthReferralsDataset,
} from "../data/healthReferrals";
import {
  getHealthDiagnosticSummary,
  type HealthDiagnosticsDataset,
} from "../data/healthDiagnostics";
import {
  getHealthSanitarySummary,
  type HealthSanitaryDataset,
} from "../data/healthSanitary";
import {
  getHealthEpidemiologySummary,
  type HealthEpidemiologyDataset,
} from "../data/healthEpidemiology";
import {
  getImmunizationSummary,
  type HealthImmunizationDataset,
} from "../data/healthImmunization";
import {
  getPharmacySummary,
  type HealthPharmacyDataset,
} from "../data/healthPharmacy";
import {
  getHealthMaternalSummary,
  type HealthMaternalDataset,
} from "../data/healthMaternal";
import {
  getHealthChildSummary,
  type HealthChildDataset,
} from "../data/healthChild";
import "./HealthSummaryModule.css";

export type SourceKey =
  | "territory"
  | "activities"
  | "referrals"
  | "diagnostics"
  | "sanitary"
  | "epidemiology"
  | "immunization"
  | "pharmacy"
  | "maternal"
  | "child"
  | "requests";

type Props = {
  requests: MunicipalRequest[];
  healthTerritory: HealthTerritoryDataset;
  healthActivities: HealthActivitiesDataset;
  healthReferrals: HealthReferralsDataset;
  healthDiagnostics: HealthDiagnosticsDataset;
  healthSanitary: HealthSanitaryDataset;
  healthEpidemiology: HealthEpidemiologyDataset;
  healthImmunization: HealthImmunizationDataset;
  healthPharmacy: HealthPharmacyDataset;
  healthMaternal: HealthMaternalDataset;
  healthChild: HealthChildDataset;
  onBack: () => void;
  onOpenSource: (source: SourceKey) => void;
};

type PriorityTone = "critical" | "attention" | "normal";

type SummaryItem = {
  id: string;
  label: string;
  value: number;
  detail: string;
  tone: PriorityTone;
  source: SourceKey;
  sourceLabel: string;
  rule: string;
  records: string[];
  icon: "activity" | "clock" | "clipboard" | "pill" | "shield" | "users";
};

const referenceDate = "2026-11-19";
const sourceNames: Record<SourceKey, string> = {
  territory: "Território, Unidades e Equipes",
  activities: "Visitas e Atendimentos",
  referrals: "Encaminhamentos e Regulação",
  diagnostics: "Exames, Procedimentos e Resultados",
  sanitary: "Vigilância Sanitária",
  epidemiology: "Vigilância Epidemiológica",
  immunization: "Imunização e Vacinação",
  pharmacy: "Assistência Farmacêutica",
  maternal: "Saúde da Mulher, Pré-Natal e Puerpério",
  child: "Acompanhamento da Criança",
  requests: "Solicitações administrativas",
};

const iconFor = (icon: SummaryItem["icon"]) => {
  const props = { size: 18 };
  if (icon === "clock") return <Clock3 {...props} />;
  if (icon === "clipboard") return <ClipboardList {...props} />;
  if (icon === "pill") return <Pill {...props} />;
  if (icon === "shield") return <ShieldAlert {...props} />;
  if (icon === "users") return <UsersRound {...props} />;
  return <Activity {...props} />;
};

export default function HealthSummaryModule({
  requests,
  healthTerritory,
  healthActivities,
  healthReferrals,
  healthDiagnostics,
  healthSanitary,
  healthEpidemiology,
  healthImmunization,
  healthPharmacy,
  healthMaternal,
  healthChild,
  onBack,
  onOpenSource,
}: Props) {
  const [filter, setFilter] = useState<"Todos" | PriorityTone>("Todos");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const referrals = getHealthReferralSummary(
    healthReferrals.referrals,
    referenceDate,
  );
  const diagnostics = getHealthDiagnosticSummary(healthDiagnostics.requests);
  const sanitary = getHealthSanitarySummary(healthSanitary);
  const epidemiology = getHealthEpidemiologySummary(healthEpidemiology);
  const immunization = getImmunizationSummary(
    healthImmunization,
    referenceDate,
  );
  const pharmacy = getPharmacySummary(healthPharmacy, referenceDate);
  const maternal = getHealthMaternalSummary(healthMaternal, referenceDate);
  const child = getHealthChildSummary(healthChild);
  const openRequests = requests.filter(
    (request) =>
      request.department === "Saúde e Vigilância Sanitária" &&
      !["Concluída", "Cancelada"].includes(request.status),
  ).length;
  const activeUnits = healthTerritory.units.filter(
    (item) => item.active,
  ).length;
  const activeTeams = healthTerritory.teams.filter(
    (item) => item.active,
  ).length;
  const openActivities =
    healthActivities.homeVisits.filter((item) =>
      ["Programada", "Retorno necessário"].includes(item.status),
    ).length +
    healthActivities.serviceRecords.filter((item) => item.status === "Agendado")
      .length;

  const items = useMemo<SummaryItem[]>(
    () => [
      {
        id: "regulation",
        label: "Encaminhamentos aguardando vaga",
        value: referrals.waiting,
        detail: `${referrals.waitingOver60Days} acima de 60 dias na referência`,
        tone: referrals.waitingOver60Days ? "critical" : "attention",
        source: "referrals",
        sourceLabel: sourceNames.referrals,
        rule: "Contar registros com situação Aguardando vaga e calcular a espera a partir da data do encaminhamento.",
        records: healthReferrals.referrals
          .filter((item) => item.status === "Aguardando vaga")
          .slice(0, 4)
          .map((item) => item.id),
        icon: "clock",
      },
      {
        id: "diagnostics",
        label: "Resultados aguardando revisão",
        value: diagnostics.resultsPendingReview,
        detail: `${diagnostics.scheduled} pedidos agendados`,
        tone: diagnostics.resultsPendingReview ? "attention" : "normal",
        source: "diagnostics",
        sourceLabel: sourceNames.diagnostics,
        rule: "Contar pedidos de exames ou procedimentos com situação Resultado disponível.",
        records: healthDiagnostics.requests
          .filter((item) => item.status === "Resultado disponível")
          .slice(0, 4)
          .map((item) => item.id),
        icon: "clipboard",
      },
      {
        id: "pharmacy",
        label: "Alertas de estoque e validade",
        value: pharmacy.lowStock + pharmacy.expired,
        detail: `${pharmacy.lowStock} abaixo do mínimo · ${pharmacy.expired} vencidos`,
        tone: pharmacy.expired
          ? "critical"
          : pharmacy.lowStock
            ? "attention"
            : "normal",
        source: "pharmacy",
        sourceLabel: sourceNames.pharmacy,
        rule: "Somar lotes com quantidade positiva vencidos e combinações produto/unidade abaixo do mínimo ilustrativo.",
        records: healthPharmacy.lots
          .filter((item) => item.quantity > 0 && item.expiresAt < referenceDate)
          .slice(0, 4)
          .map((item) => item.id),
        icon: "pill",
      },
      {
        id: "maternal",
        label: "Pendências da Saúde da Mulher",
        value: maternal.openPendings,
        detail: `${maternal.total} acompanhamentos sintéticos`,
        tone: maternal.openPendings ? "attention" : "normal",
        source: "maternal",
        sourceLabel: sourceNames.maternal,
        rule: "Contar pendências administrativas com situação Aberta vinculadas a acompanhamentos maternos.",
        records: healthMaternal.pendings
          .filter((item) => item.status === "Aberta")
          .slice(0, 4)
          .map((item) => item.id),
        icon: "users",
      },
      {
        id: "child",
        label: "Transições infantis pendentes",
        value: child.openPendings,
        detail: `${child.total} transições sintéticas registradas`,
        tone: child.openPendings ? "attention" : "normal",
        source: "child",
        sourceLabel: sourceNames.child,
        rule: "Contar pendências administrativas abertas na transição do puerpério para a APS.",
        records: healthChild.pendings
          .filter((item) => item.status === "Aberta")
          .slice(0, 4)
          .map((item) => item.id),
        icon: "users",
      },
      {
        id: "epidemiology",
        label: "Pendências epidemiológicas",
        value: epidemiology.openPendings + epidemiology.triage,
        detail: `${epidemiology.openPendings} tarefas abertas · ${epidemiology.triage} registros a conferir · coleção atual da sessão`,
        tone: epidemiology.openPendings ? "attention" : "normal",
        source: "epidemiology",
        sourceLabel: sourceNames.epidemiology,
        rule: "Somar pendências administrativas abertas e registros sintéticos Recebidos ou em conferência administrativa.",
        records: [
          ...healthEpidemiology.pendings
            .filter((item) => item.status === "Aberta")
            .slice(0, 2)
            .map((item) => item.id),
          ...healthEpidemiology.notifications
            .filter((item) =>
              ["Recebida", "Em conferência"].includes(item.status),
            )
            .slice(0, 2)
            .map((item) => item.id),
        ],
        icon: "shield",
      },
      {
        id: "sanitary",
        label: "Providências na Vigilância Sanitária",
        value: sanitary.followUps + sanitary.licenseReview,
        detail: `${sanitary.followUps} inspeções em retorno/providência · ${sanitary.licenseReview} licenças em análise`,
        tone: sanitary.followUps ? "attention" : "normal",
        source: "sanitary",
        sourceLabel: sourceNames.sanitary,
        rule: "Somar inspeções em Providência em acompanhamento ou Retorno programado e licenças em análise ou renovação.",
        records: healthSanitary.inspections
          .filter((item) =>
            ["Providência em acompanhamento", "Retorno programado"].includes(
              item.status,
            ),
          )
          .slice(0, 4)
          .map((item) => item.id),
        icon: "shield",
      },
      {
        id: "network",
        label: "Rede com cadastros ativos",
        value: activeUnits + activeTeams,
        detail: `${activeUnits} unidades · ${activeTeams} equipes ativas`,
        tone: "normal",
        source: "territory",
        sourceLabel: sourceNames.territory,
        rule: "Somar unidades e equipes marcadas como ativas no cadastro territorial demonstrativo.",
        records: [
          ...healthTerritory.units
            .filter((item) => item.active)
            .slice(0, 2)
            .map((item) => item.id),
          ...healthTerritory.teams
            .filter((item) => item.active)
            .slice(0, 2)
            .map((item) => item.id),
        ],
        icon: "users",
      },
      {
        id: "activities",
        label: "Atividades com próximo passo",
        value: openActivities,
        detail: `${healthActivities.homeVisits.length} visitas · ${healthActivities.serviceRecords.length} atendimentos`,
        tone: openActivities ? "attention" : "normal",
        source: "activities",
        sourceLabel: sourceNames.activities,
        rule: "Contar visitas Programadas ou com Retorno necessário e atendimentos ainda Agendados.",
        records: [
          ...healthActivities.homeVisits
            .filter((item) =>
              ["Programada", "Retorno necessário"].includes(item.status),
            )
            .slice(0, 2)
            .map((item) => item.id),
          ...healthActivities.serviceRecords
            .filter((item) => item.status === "Agendado")
            .slice(0, 2)
            .map((item) => item.id),
        ],
        icon: "activity",
      },
      {
        id: "immunization",
        label: "Esquemas vacinais em acompanhamento",
        value: immunization.activeSchemes + immunization.overdue,
        detail: `${immunization.overdue} datas demonstrativas anteriores à referência`,
        tone: immunization.overdue ? "attention" : "normal",
        source: "immunization",
        sourceLabel: sourceNames.immunization,
        rule: "Somar esquemas Em andamento e, dentro deles, aqueles cuja próxima data ilustrativa é anterior à referência.",
        records: healthImmunization.courses
          .filter((item) => item.status === "Em andamento")
          .slice(0, 4)
          .map((item) => item.id),
        icon: "activity",
      },
      {
        id: "requests",
        label: "Solicitações administrativas",
        value: openRequests,
        detail: "Abertas na pasta Saúde e Vigilância Sanitária",
        tone: openRequests ? "attention" : "normal",
        source: "requests",
        sourceLabel: sourceNames.requests,
        rule: "Contar solicitações da pasta que não estejam Concluídas ou Canceladas; não misturar com filas clínicas.",
        records: requests
          .filter(
            (item) =>
              item.department === "Saúde e Vigilância Sanitária" &&
              !["Concluída", "Cancelada"].includes(item.status),
          )
          .slice(0, 4)
          .map((item) => item.id),
        icon: "clipboard",
      },
    ],
    [
      activeTeams,
      activeUnits,
      child,
      diagnostics,
      epidemiology,
      healthActivities,
      healthChild,
      healthDiagnostics.requests,
      healthEpidemiology,
      healthImmunization.courses,
      healthMaternal.pendings,
      healthPharmacy.lots,
      healthReferrals.referrals,
      healthSanitary,
      healthTerritory.teams,
      healthTerritory.units,
      immunization,
      maternal,
      openActivities,
      openRequests,
      pharmacy,
      referrals,
      requests,
      sanitary,
    ],
  );

  const visibleItems = items.filter((item) => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    const matchesFilter = filter === "Todos" || item.tone === filter;
    const matchesQuery =
      !normalized ||
      `${item.label} ${item.detail} ${item.records.join(" ")}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized);
    return matchesFilter && matchesQuery;
  });
  const selected =
    items.find((item) => item.id === selectedId) ?? visibleItems[0];
  const attentionCount = items.filter((item) => item.tone !== "normal").length;
  const totalOpen = items
    .filter((item) => item.tone !== "normal")
    .reduce((sum, item) => sum + item.value, 0);

  return (
    <section
      className="health-summary-module"
      aria-labelledby="health-summary-title"
    >
      <button type="button" className="health-summary-back" onClick={onBack}>
        <ArrowRight size={15} /> Voltar aos módulos e serviços
      </button>
      <div className="health-summary-heading">
        <div>
          <span className="health-summary-eyebrow">
            SECRETARIA DE SAÚDE · VISÃO CONSOLIDADA
          </span>
          <h2 id="health-summary-title">Resumo e Prioridades</h2>
          <p>
            Indicadores derivados dos registros operacionais fictícios da rede
            municipal.
          </p>
        </div>
        <span className="health-summary-date">
          <CalendarDays size={15} /> Base de cálculos com prazo: 19/nov/2026
        </span>
      </div>

      <div className="health-summary-safety" role="note">
        <ShieldAlert size={18} />
        <div>
          <strong>Demonstração fictícia — não insira dados reais.</strong>
          <p>
            Este painel organiza acompanhamento administrativo. Não oferece
            condutas clínicas, não substitui protocolos, prontuários ou sistemas
            oficiais e não transmite dados.
          </p>
        </div>
      </div>

      <div className="health-summary-kpis">
        <article>
          <span>Indicadores acompanhados</span>
          <strong>{items.length}</strong>
          <small>Calculados nesta sessão</small>
        </article>
        <article className={attentionCount ? "attention" : "ok"}>
          <span>Pontos que pedem atenção</span>
          <strong>{attentionCount}</strong>
          <small>Com regra e origem identificadas</small>
        </article>
        <article>
          <span>Registros somados nos alertas</span>
          <strong>{totalOpen}</strong>
          <small>Não são pessoas nem casos clínicos</small>
        </article>
        <article>
          <span>Fontes operacionais</span>
          <strong>10</strong>
          <small>Módulos compartilhados</small>
        </article>
      </div>

      <div className="health-summary-toolbar">
        <div className="health-summary-filter">
          <Filter size={15} />
          <span>Mostrar</span>
          {(["Todos", "critical", "attention", "normal"] as const).map(
            (value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {value === "Todos"
                  ? "Todos"
                  : value === "critical"
                    ? "Críticos"
                    : value === "attention"
                      ? "Atenção"
                      : "Em dia"}
              </button>
            ),
          )}
        </div>
        <label className="health-summary-search">
          <Activity size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar indicador ou registro sintético..."
          />
        </label>
      </div>

      <div className="health-summary-layout">
        <div className="health-summary-list">
          {visibleItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`health-summary-item ${selected?.id === item.id ? "selected" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              <span className={`health-summary-item-icon ${item.tone}`}>
                {iconFor(item.icon)}
              </span>
              <span className="health-summary-item-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
                <em>{sourceNames[item.source]}</em>
              </span>
              <span className="health-summary-item-value">
                <b>{item.value}</b>
                <ArrowRight size={15} />
              </span>
            </button>
          ))}
          {!visibleItems.length && (
            <div className="health-summary-empty">
              Nenhum indicador corresponde ao filtro ou à busca.
            </div>
          )}
        </div>
        <aside className="health-summary-detail">
          {selected ? (
            <>
              <span className="health-summary-eyebrow">
                ORIGEM E REGRA DO INDICADOR
              </span>
              <h3>{selected.label}</h3>
              <div className={`health-summary-detail-value ${selected.tone}`}>
                <b>{selected.value}</b>
                <span>{selected.detail}</span>
              </div>
              <dl>
                <div>
                  <dt>Módulo de origem</dt>
                  <dd>{selected.sourceLabel}</dd>
                </div>
                <div>
                  <dt>Regra de cálculo</dt>
                  <dd>{selected.rule}</dd>
                </div>
                <div>
                  <dt>Registros considerados</dt>
                  <dd>
                    {selected.records.length
                      ? selected.records.join(" · ")
                      : "Nenhum registro sintético localizado"}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="health-summary-source-button"
                onClick={() => onOpenSource(selected.source)}
              >
                Abrir módulo de origem <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <div className="health-summary-detail-empty">
              <Database size={24} />
              <strong>Selecione um indicador</strong>
              <p>
                A regra, os registros-fonte e o caminho para o módulo aparecerão
                aqui.
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="health-summary-footnote">
        <History size={16} />
        <p>
          Os números são derivados em memória a partir das coleções fictícias.
          Um indicador não cria cadastro paralelo e não deve ser interpretado
          como dado oficial, diagnóstico, meta assistencial ou fila clínica.
        </p>
      </div>
    </section>
  );
}
