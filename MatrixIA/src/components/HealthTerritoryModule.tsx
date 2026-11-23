import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  Archive,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Edit3,
  Filter,
  MapPinned,
  MapPin,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import {
  mapRegionCenters,
  mapRegionLabels,
  mapRegionPolygons,
  type HealthProfessional,
  type HealthCatalog,
  type HealthTeam,
  type HealthTerritoryDataset,
  type HealthUnit,
  type MapRegion,
  type ServiceArea,
} from "../data/healthTerritory";
import "./HealthTerritoryModule.css";

type EntityKind = "unit" | "team" | "professional" | "area" | "catalog";
type ModuleTab = "map" | EntityKind;
type MapLayer = "areas" | "units" | "teams";
type FeatureSelection = { kind: "area" | "unit" | "team"; id: string };
type ModalState = { kind: EntityKind; id?: string };
type Props = {
  dataset: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthTerritoryDataset) => HealthTerritoryDataset,
  ) => void;
};

const regionOptions: MapRegion[] = ["centro", "norte", "leste", "rural"];
const regionOffset: Record<MapRegion, { x: number; y: number }> = {
  centro: { x: 0, y: 0 },
  norte: { x: 0, y: -145 },
  leste: { x: 295, y: 35 },
  rural: { x: -20, y: 185 },
};

const createId = (kind: EntityKind, data: HealthTerritoryDataset) => {
  const prefix = {
    unit: "SIM-UBS",
    team: "SIM-EQ",
    professional: "SIM-PRO",
    area: "SIM-AREA",
    catalog: "SIM-CAT",
  }[kind];
  const collection = {
    unit: data.units,
    team: data.teams,
    professional: data.professionals,
    area: data.areas,
    catalog: data.catalogs,
  }[kind];
  return `${prefix}-${String(collection.length + 1).padStart(3, "0")}`;
};

const entityPlural: Record<EntityKind, string> = {
  unit: "Unidades",
  team: "Equipes",
  professional: "Profissionais",
  area: "Áreas de atuação",
  catalog: "Catálogos",
};

const entitySingular: Record<EntityKind, string> = {
  unit: "Unidade de saúde",
  team: "Equipe de saúde",
  professional: "Profissional",
  area: "Área de atuação",
  catalog: "Item de catálogo",
};

function HealthTerritoryModule({ dataset, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<ModuleTab>("map");
  const [mapLayer, setMapLayer] = useState<MapLayer>("areas");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<FeatureSelection>({
    kind: "area",
    id: "SIM-AREA-001",
  });
  const [modal, setModal] = useState<ModalState | null>(null);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [zoom, setZoom] = useState(1);

  const activeUnits = dataset.units.filter((item) => item.active).length;
  const activeTeams = dataset.teams.filter((item) => item.active).length;
  const activeProfessionals = dataset.professionals.filter(
    (item) => item.active,
  ).length;
  const activeAreas = dataset.areas.filter((item) => item.active).length;

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const visibleAreas = useMemo(
    () =>
      dataset.areas.filter(
        (area) =>
          (includeInactive || area.active) &&
          (areaFilter === "all" || area.id === areaFilter) &&
          (!normalizedSearch ||
            `${area.name} ${area.code}`
              .toLocaleLowerCase("pt-BR")
              .includes(normalizedSearch)),
      ),
    [areaFilter, dataset.areas, includeInactive, normalizedSearch],
  );
  const visibleUnits = useMemo(
    () =>
      dataset.units.filter((unit) => {
        const relatedAreaIds = dataset.teams
          .filter((team) => team.unitId === unit.id)
          .map((team) => team.areaId);
        return (
          (includeInactive || unit.active) &&
          (areaFilter === "all" || relatedAreaIds.includes(areaFilter)) &&
          (!normalizedSearch ||
            `${unit.name} ${unit.kind} ${unit.address} ${unit.neighborhood}`
              .toLocaleLowerCase("pt-BR")
              .includes(normalizedSearch))
        );
      }),
    [
      areaFilter,
      dataset.teams,
      dataset.units,
      includeInactive,
      normalizedSearch,
    ],
  );
  const visibleTeams = useMemo(
    () =>
      dataset.teams.filter(
        (team) =>
          (includeInactive || team.active) &&
          (areaFilter === "all" || team.areaId === areaFilter) &&
          (!normalizedSearch ||
            `${team.name} ${team.code} ${team.model}`
              .toLocaleLowerCase("pt-BR")
              .includes(normalizedSearch)),
      ),
    [areaFilter, dataset.teams, includeInactive, normalizedSearch],
  );
  const selectedArea = dataset.areas.find(
    (area) => selectedFeature.kind === "area" && area.id === selectedFeature.id,
  );
  const selectedUnit = dataset.units.find(
    (unit) => selectedFeature.kind === "unit" && unit.id === selectedFeature.id,
  );
  const selectedTeam = dataset.teams.find(
    (team) => selectedFeature.kind === "team" && team.id === selectedFeature.id,
  );
  const editingRecord = modal ? findRecord(dataset, modal) : null;
  const editingValue = (key: string, fallback = "") => {
    if (!editingRecord || !(key in editingRecord)) return fallback;
    return String(editingRecord[key]);
  };

  function findRecord(
    current: HealthTerritoryDataset,
    currentModal: ModalState,
  ): Record<string, string | number | boolean> | null {
    const collection = {
      unit: current.units,
      team: current.teams,
      professional: current.professionals,
      area: current.areas,
      catalog: current.catalogs,
    }[currentModal.kind];
    const record = collection.find((item) => item.id === currentModal.id);
    return (
      (record as unknown as Record<string, string | number | boolean>) ?? null
    );
  }

  const getUnit = (id: string) => dataset.units.find((item) => item.id === id);
  const getTeam = (id: string) => dataset.teams.find((item) => item.id === id);
  const getArea = (id: string) => dataset.areas.find((item) => item.id === id);

  const toggleActive = (kind: EntityKind, id: string) => {
    onChange((current) => {
      if (kind === "unit") {
        return {
          ...current,
          units: current.units.map((item) =>
            item.id === id ? { ...item, active: !item.active } : item,
          ),
        };
      }
      if (kind === "team") {
        return {
          ...current,
          teams: current.teams.map((item) =>
            item.id === id ? { ...item, active: !item.active } : item,
          ),
        };
      }
      if (kind === "professional") {
        return {
          ...current,
          professionals: current.professionals.map((item) =>
            item.id === id ? { ...item, active: !item.active } : item,
          ),
        };
      }
      if (kind === "catalog") {
        return {
          ...current,
          catalogs: current.catalogs.map((item) => item.id === id ? { ...item, active: !item.active, history: [...item.history, { date: new Date().toISOString().slice(0, 10), action: item.active ? "Catálogo inativado" : "Catálogo reativado", detail: `Item ${item.code} alterado sem exclusão do histórico.` }] } : item),
        };
      }
      return {
        ...current,
        areas: current.areas.map((item) =>
          item.id === id ? { ...item, active: !item.active } : item,
        ),
      };
    });
    setNotice(`${entitySingular[kind]} atualizado nesta demonstração.`);
  };

  const submitEntity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modal) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const value = (key: string) => String(formData.get(key) ?? "").trim();
    const requiredFields = {
      unit: ["name", "kind", "address", "neighborhood", "region"],
      team: ["name", "code", "model", "unitId", "areaId"],
      professional: ["name", "category", "registration", "teamId"],
      area: ["name", "code", "teamId", "estimatedResidents", "region", "color"],
      catalog: ["domain", "code", "label", "validFrom"],
    }[modal.kind];
    if (requiredFields.some((field) => !value(field))) {
      setFormError(
        "Preencha todos os campos obrigatórios. Espaços em branco não são aceitos.",
      );
      return;
    }
    if (value("validTo") && value("validTo") < value("validFrom")) {
      setFormError("O fim da vigência não pode ser anterior ao início da vigência.");
      return;
    }
    if (modal.kind === "catalog" && dataset.catalogs.some((item) => item.id !== modal.id && item.domain === value("domain") && item.code.toUpperCase() === value("code").toUpperCase() && item.active)) {
      setFormError("Já existe um item ativo com este código dentro do domínio selecionado.");
      return;
    }

    setFormError("");
    const savedId = modal.id ?? createId(modal.kind, dataset);
    onChange((current) => {
      const isEditing = Boolean(modal.id);
      const id = savedId;
      const active = formData.get("active") === "on";
      if (modal.kind === "unit") {
        const previous = current.units.find((item) => item.id === id);
        const record: HealthUnit = {
          id,
          name: value("name"),
          kind: value("kind"),
          address: value("address"),
          neighborhood: value("neighborhood"),
          phone: value("phone"),
          region: value("region") as MapRegion,
          active: isEditing ? active : true,
          validFrom: value("validFrom") || previous?.validFrom || new Date().toISOString().slice(0, 10),
          validTo: value("validTo") || undefined,
          history: [{ date: value("validFrom") || new Date().toISOString().slice(0, 10), action: isEditing ? "Vigência da unidade atualizada" : "Unidade cadastrada", detail: `Situação: ${active ? "ativa" : "inativa"}.` }, ...(previous?.history ?? [])],
        };
        return {
          ...current,
          units: isEditing
            ? current.units.map((item) => (item.id === id ? record : item))
            : [record, ...current.units],
        };
      }
      if (modal.kind === "team") {
        const previous = current.teams.find((item) => item.id === id);
        const record: HealthTeam = {
          id,
          name: value("name"),
          code: value("code").toUpperCase(),
          model: value("model"),
          unitId: value("unitId"),
          areaId: value("areaId"),
          active: isEditing ? active : true,
          validFrom: value("validFrom") || previous?.validFrom || new Date().toISOString().slice(0, 10),
          validTo: value("validTo") || undefined,
          compositionHistory: previous?.compositionHistory ?? [],
          history: [{ date: value("validFrom") || new Date().toISOString().slice(0, 10), action: isEditing ? "Vigência da equipe atualizada" : "Equipe cadastrada", detail: `${value("code")} · ${value("model")}.` }, ...(previous?.history ?? [])],
        };
        return {
          ...current,
          teams: isEditing
            ? current.teams.map((item) => (item.id === id ? record : item))
            : [record, ...current.teams],
        };
      }
      if (modal.kind === "professional") {
        const previous = current.professionals.find((item) => item.id === id);
        const team = current.teams.find((item) => item.id === value("teamId"));
        const record: HealthProfessional = {
          id,
          name: value("name"),
          category: value("category"),
          registration: value("registration"),
          unitId: team?.unitId ?? value("unitId"),
          teamId: value("teamId"),
          phone: value("phone"),
          active: isEditing ? active : true,
          validFrom: value("validFrom") || previous?.validFrom || new Date().toISOString().slice(0, 10),
          validTo: value("validTo") || undefined,
          history: [{ date: value("validFrom") || new Date().toISOString().slice(0, 10), action: isEditing ? "Vínculo profissional atualizado" : "Profissional vinculado", detail: `Equipe: ${team?.code ?? "não informada"}.` }, ...(previous?.history ?? [])],
        };
        const nextTeams = current.teams.map((item) => {
          const oldTeamId = previous?.teamId;
          if (item.id !== oldTeamId && item.id !== value("teamId")) return item;
          const event = { id: `${id}-${Date.now()}`, professionalId: id, role: value("category"), validFrom: value("validFrom") || new Date().toISOString().slice(0, 10), action: item.id === value("teamId") ? "Inclusão" as const : "Saída" as const, notes: "Movimentação de vínculo no cadastro territorial." };
          return { ...item, compositionHistory: [...(item.compositionHistory ?? []), event], history: [{ date: event.validFrom, action: "Composição da equipe atualizada", detail: `${value("name")} · ${event.action}.` }, ...(item.history ?? [])] };
        });
        return {
          ...current,
          teams: nextTeams,
          professionals: isEditing
            ? current.professionals.map((item) =>
                item.id === id ? record : item,
              )
            : [record, ...current.professionals],
        };
      }
      if (modal.kind === "catalog") {
        const previous = current.catalogs.find((item) => item.id === id);
        const record: HealthCatalog = { id, domain: value("domain") as HealthCatalog["domain"], code: value("code").toUpperCase(), label: value("label"), description: value("description") || undefined, version: previous ? previous.version + 1 : 1, validFrom: value("validFrom"), validTo: value("validTo") || undefined, active: isEditing ? active : true, history: [{ date: value("validFrom"), action: previous ? "Catálogo versionado" : "Catálogo publicado", detail: previous ? `Versão ${previous.version + 1} substitui a versão anterior sem apagar o histórico.` : "Item cadastrado no catálogo municipal." }, ...(previous?.history ?? [])] };
        return { ...current, catalogs: isEditing ? current.catalogs.map((item) => item.id === id ? record : item) : [record, ...current.catalogs] };
      }
      const previous = current.areas.find((item) => item.id === id);
      const record: ServiceArea = {
        id,
        name: value("name"),
        code: value("code").toUpperCase(),
        teamId: value("teamId"),
        estimatedResidents: Number(value("estimatedResidents")),
        region: value("region") as MapRegion,
        color: value("color"),
        active: isEditing ? active : true,
        validFrom: value("validFrom") || previous?.validFrom || new Date().toISOString().slice(0, 10),
        validTo: value("validTo") || undefined,
        history: [{ date: value("validFrom") || new Date().toISOString().slice(0, 10), action: isEditing ? "Vigência da área atualizada" : "Área cadastrada", detail: `${value("code")} · equipe responsável atualizada.` }, ...(previous?.history ?? [])],
      };
      return {
        ...current,
        areas: isEditing
          ? current.areas.map((item) => (item.id === id ? record : item))
          : [record, ...current.areas],
      };
    });

    if (modal.kind === "unit") {
      setSelectedFeature({ kind: "unit", id: savedId });
      setMapLayer("units");
    } else if (modal.kind === "team") {
      setSelectedFeature({ kind: "team", id: savedId });
      setMapLayer("teams");
    } else if (modal.kind === "area") {
      setSelectedFeature({ kind: "area", id: savedId });
      setMapLayer("areas");
    }
    setNotice(
      `${entitySingular[modal.kind]} ${modal.id ? "atualizado" : "cadastrado"} nesta demonstração.`,
    );
    setModal(null);
  };

  const closeModal = () => {
    setModal(null);
    setNotice("");
    setFormError("");
  };

  return (
    <section
      className="health-territory-module"
      aria-label="Território, Unidades e Equipes"
    >
      <div className="health-module-kicker">
        <span>
          <MapPinned size={14} /> SAÚDE E VIGILÂNCIA SANITÁRIA
        </span>
        <span className="health-demo-label">
          <i /> CENÁRIO FICTÍCIO · SEM PERSISTÊNCIA
        </span>
      </div>
      <div className="health-module-heading">
        <div>
          <h2>Território, Unidades e Equipes</h2>
          <p>
            Organize a rede de atenção, relacione equipes e profissionais e
            acompanhe as áreas de atuação no mapa demonstrativo.
          </p>
        </div>
        <button
          className="health-module-help"
          type="button"
          title="Os dados e limites territoriais desta tela são fictícios e servem apenas para validar o protótipo."
        >
          <CircleHelp size={16} /> Sobre este módulo
        </button>
      </div>

      <div
        className="health-territory-metrics"
        aria-label="Resumo dos cadastros ativos"
      >
        <Metric
          icon={<Building2 size={17} />}
          label="Unidades ativas"
          value={activeUnits}
          detail={`${dataset.units.length} cadastradas`}
        />
        <Metric
          icon={<UsersRound size={17} />}
          label="Equipes ativas"
          value={activeTeams}
          detail={`${dataset.teams.length} cadastradas`}
        />
        <Metric
          icon={<Activity size={17} />}
          label="Profissionais ativos"
          value={activeProfessionals}
          detail={`${dataset.professionals.length} cadastrados`}
        />
        <Metric
          icon={<MapPinned size={17} />}
          label="Áreas de atuação"
          value={activeAreas}
          detail="com cobertura esquemática"
        />
      </div>

      <div
        className="health-territory-tabs"
        role="tablist"
        aria-label="Seções do módulo territorial"
      >
        <TabButton
          active={activeTab === "map"}
          onClick={() => setActiveTab("map")}
          icon={<MapPinned size={15} />}
        >
          Mapa territorial
        </TabButton>
        <TabButton
          active={activeTab === "unit"}
          onClick={() => setActiveTab("unit")}
          icon={<Building2 size={15} />}
        >
          Unidades <b>{dataset.units.length}</b>
        </TabButton>
        <TabButton
          active={activeTab === "team"}
          onClick={() => setActiveTab("team")}
          icon={<UsersRound size={15} />}
        >
          Equipes <b>{dataset.teams.length}</b>
        </TabButton>
        <TabButton
          active={activeTab === "professional"}
          onClick={() => setActiveTab("professional")}
          icon={<Activity size={15} />}
        >
          Profissionais <b>{dataset.professionals.length}</b>
        </TabButton>
        <TabButton
          active={activeTab === "area"}
          onClick={() => setActiveTab("area")}
          icon={<MapPin size={15} />}
        >
          Áreas de atuação <b>{dataset.areas.length}</b>
        </TabButton>
        <TabButton
          active={activeTab === "catalog"}
          onClick={() => setActiveTab("catalog")}
          icon={<BookOpen size={15} />}
        >
          Catálogos <b>{dataset.catalogs.length}</b>
        </TabButton>
      </div>

      {notice && (
        <div className="health-territory-notice" role="status">
          <Check size={15} />
          {notice}
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {activeTab === "map" ? (
        <>
          <div className="health-map-toolbar">
            <div
              className="health-map-layer-switch"
              role="group"
              aria-label="Camada do mapa"
            >
              <button
                type="button"
                className={mapLayer === "areas" ? "active" : ""}
                onClick={() => setMapLayer("areas")}
              >
                <MapPinned size={14} /> Áreas
              </button>
              <button
                type="button"
                className={mapLayer === "units" ? "active" : ""}
                onClick={() => setMapLayer("units")}
              >
                <Building2 size={14} /> Unidades
              </button>
              <button
                type="button"
                className={mapLayer === "teams" ? "active" : ""}
                onClick={() => setMapLayer("teams")}
              >
                <UsersRound size={14} /> Equipes
              </button>
            </div>
            <label className="health-map-filter">
              <Filter size={14} />
              <span className="sr-only">Filtrar por área</span>
              <select
                value={areaFilter}
                onChange={(event) => setAreaFilter(event.target.value)}
              >
                <option value="all">Todas as áreas</option>
                {dataset.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
            <label className="health-map-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar unidade, equipe ou área"
              />
            </label>
            <label className="health-map-inactive">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />{" "}
              Incluir inativos
            </label>
          </div>
          <div className="health-map-layout">
            <div className="health-map-card">
              <div className="health-map-card-head">
                <div>
                  <span>MAPA PRINCIPAL · DADOS SIMULADOS</span>
                  <strong>
                    Como a rede de saúde se distribui no território
                  </strong>
                </div>
                <div className="health-map-zoom">
                  <button
                    type="button"
                    aria-label="Diminuir zoom"
                    onClick={() =>
                      setZoom((value) => Math.max(0.8, value - 0.15))
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    aria-label="Aumentar zoom"
                    onClick={() =>
                      setZoom((value) => Math.min(1.6, value + 0.15))
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="health-map-canvas">
                <svg
                  className="health-map-svg"
                  viewBox="0 0 1000 640"
                  role="group"
                  aria-roledescription="mapa interativo"
                  aria-label="Mapa esquemático com áreas de atuação, unidades e equipes de saúde"
                >
                  <defs>
                    <pattern
                      id="health-map-grid"
                      width="28"
                      height="28"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 28 0 L 0 0 0 28"
                        fill="none"
                        stroke="#d9e5df"
                        strokeWidth="1"
                      />
                    </pattern>
                    <filter
                      id="health-map-shadow"
                      x="-40%"
                      y="-40%"
                      width="180%"
                      height="180%"
                    >
                      <feDropShadow
                        dx="0"
                        dy="2"
                        stdDeviation="3"
                        floodColor="#1d3b4d"
                        floodOpacity="0.18"
                      />
                    </filter>
                  </defs>
                  <rect width="1000" height="640" fill="#edf3ef" />
                  <rect
                    width="1000"
                    height="640"
                    fill="url(#health-map-grid)"
                  />
                  <g className="health-map-road">
                    <path d="M -30 390 C 160 315 265 385 410 285 S 700 235 1030 115" />
                    <path d="M 95 -20 C 160 100 190 190 220 340 S 280 510 370 665" />
                    <path d="M 600 -20 C 565 110 605 205 665 320 S 755 485 820 670" />
                    <path d="M -30 545 C 180 470 345 482 505 540 S 795 555 1030 475" />
                    <path
                      className="health-map-road-center"
                      d="M -30 390 C 160 315 265 385 410 285 S 700 235 1030 115"
                    />
                    <path
                      className="health-map-road-center"
                      d="M 95 -20 C 160 100 190 190 220 340 S 280 510 370 665"
                    />
                  </g>
                  <g className="health-map-road-labels">
                    <text x="55" y="370">
                      AV. PARANÁ
                    </text>
                    <text x="614" y="510">
                      ESTRADA MUNICIPAL
                    </text>
                    <text x="220" y="95">
                      R. SETE DE SETEMBRO
                    </text>
                  </g>
                  <g
                    transform={`translate(${500 * (1 - zoom)} ${320 * (1 - zoom)}) scale(${zoom})`}
                  >
                    {mapLayer === "areas" &&
                      visibleAreas.map((area) => (
                        <g
                          key={area.id}
                          className={`health-area-shape${selectedFeature.id === area.id && selectedFeature.kind === "area" ? " selected" : ""}${!area.active ? " inactive" : ""}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`${area.name}, ${area.estimatedResidents.toLocaleString("pt-BR")} moradores estimados, equipe ${getTeam(area.teamId)?.code ?? "não vinculada"}`}
                          onClick={() =>
                            setSelectedFeature({ kind: "area", id: area.id })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ")
                              setSelectedFeature({ kind: "area", id: area.id });
                          }}
                        >
                          <polygon
                            points={mapRegionPolygons[area.region]}
                            fill={area.color}
                            stroke={area.color}
                          />
                          <text
                            className="health-area-code"
                            x={mapRegionCenters[area.region].x}
                            y={mapRegionCenters[area.region].y - 8}
                          >
                            {area.code}
                          </text>
                          <text
                            className="health-area-name"
                            x={mapRegionCenters[area.region].x}
                            y={mapRegionCenters[area.region].y + 13}
                          >
                            {area.name}
                          </text>
                          <title>{`${area.name} · ${area.estimatedResidents.toLocaleString("pt-BR")} moradores estimados`}</title>
                        </g>
                      ))}
                    {mapLayer === "units" &&
                      visibleUnits.map((unit) => {
                        const center = mapRegionCenters[unit.region];
                        return (
                          <g
                            key={unit.id}
                            className={`health-map-marker unit${selectedFeature.id === unit.id && selectedFeature.kind === "unit" ? " selected" : ""}${!unit.active ? " inactive" : ""}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${unit.name}, ${unit.kind}`}
                            transform={`translate(${center.x} ${center.y})`}
                            onClick={() =>
                              setSelectedFeature({ kind: "unit", id: unit.id })
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ")
                                setSelectedFeature({
                                  kind: "unit",
                                  id: unit.id,
                                });
                            }}
                          >
                            <circle className="marker-halo" r="29" />
                            <circle className="marker-core" r="19" />
                            <foreignObject
                              x="-10"
                              y="-10"
                              width="20"
                              height="20"
                            >
                              <div className="health-map-marker-icon">
                                <Building2 size={15} />
                              </div>
                            </foreignObject>
                            <text y="42">{unit.name}</text>
                            <title>
                              {unit.name} · {unit.neighborhood}
                            </title>
                          </g>
                        );
                      })}
                    {mapLayer === "teams" &&
                      visibleTeams.map((team, index) => {
                        const unit = getUnit(team.unitId);
                        const center =
                          mapRegionCenters[unit?.region ?? "centro"];
                        const offset = regionOffset[unit?.region ?? "centro"];
                        const peers = visibleTeams.filter(
                          (item) => item.unitId === team.unitId,
                        );
                        const peerIndex = peers.findIndex(
                          (item) => item.id === team.id,
                        );
                        const position = {
                          x:
                            center.x +
                            (peerIndex - (peers.length - 1) / 2) * 46 +
                            (peers.length > 1 ? 0 : offset.x * 0.04),
                          y:
                            center.y +
                            (peers.length > 1 ? -40 : offset.y * 0.04),
                        };
                        return (
                          <g
                            key={team.id}
                            className={`health-map-marker team${selectedFeature.id === team.id && selectedFeature.kind === "team" ? " selected" : ""}${!team.active ? " inactive" : ""}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${team.code}, ${team.name}`}
                            transform={`translate(${position.x} ${position.y})`}
                            onClick={() =>
                              setSelectedFeature({ kind: "team", id: team.id })
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ")
                                setSelectedFeature({
                                  kind: "team",
                                  id: team.id,
                                });
                            }}
                          >
                            <circle className="marker-halo" r="25" />
                            <circle className="marker-core" r="16" />
                            <foreignObject x="-9" y="-9" width="18" height="18">
                              <div className="health-map-marker-icon">
                                <UsersRound size={13} />
                              </div>
                            </foreignObject>
                            <text y="38">{team.code || `EQ-${index + 1}`}</text>
                            <title>
                              {team.name} ·{" "}
                              {unit?.name ?? "Unidade não informada"}
                            </title>
                          </g>
                        );
                      })}
                  </g>
                </svg>
                <div className="health-map-north" aria-label="Norte">
                  N<span>↑</span>
                </div>
                <span className="health-map-scale">
                  Esquema territorial · sem escala
                </span>
              </div>
              <div className="health-map-legend">
                {mapLayer === "areas" ? (
                  visibleAreas.map((area) => (
                    <button
                      type="button"
                      key={area.id}
                      className={
                        selectedFeature.id === area.id &&
                        selectedFeature.kind === "area"
                          ? "selected"
                          : ""
                      }
                      onClick={() =>
                        setSelectedFeature({ kind: "area", id: area.id })
                      }
                    >
                      <i style={{ background: area.color }} />
                      {area.name}
                    </button>
                  ))
                ) : mapLayer === "units" ? (
                  <span>
                    <i className="legend-unit" /> Unidade de saúde
                  </span>
                ) : (
                  <span>
                    <i className="legend-team" /> Equipe de saúde
                  </span>
                )}
              </div>
              <p className="health-map-disclaimer">
                <ShieldCheck size={14} /> Limites, localizações e moradores são
                fictícios. O mapa representa um recorte esquemático para
                demonstrar vínculos, não é cartografia oficial do município.
              </p>
            </div>
            <aside className="health-map-detail" aria-live="polite">
              <div className="health-map-detail-head">
                <span className="health-map-detail-icon">
                  {selectedArea ? (
                    <MapPinned size={17} />
                  ) : selectedUnit ? (
                    <Building2 size={17} />
                  ) : (
                    <UsersRound size={17} />
                  )}
                </span>
                <div>
                  <span>DETALHE DO RECORTE</span>
                  <h3>
                    {selectedArea?.name ??
                      selectedUnit?.name ??
                      selectedTeam?.name ??
                      "Selecione no mapa"}
                  </h3>
                </div>
              </div>
              {selectedArea ? (
                <>
                  <p className="health-map-detail-code">
                    {selectedArea.code} · {mapRegionLabels[selectedArea.region]}
                  </p>
                  <DetailRow
                    label="Equipe responsável"
                    value={
                      getTeam(selectedArea.teamId)?.name ?? "Não vinculada"
                    }
                  />
                  <DetailRow
                    label="Unidade de referência"
                    value={
                      getUnit(getTeam(selectedArea.teamId)?.unitId ?? "")
                        ?.name ?? "Não informada"
                    }
                  />
                  <DetailRow
                    label="População estimada"
                    value={`${selectedArea.estimatedResidents.toLocaleString("pt-BR")} moradores · demo`}
                  />
                  <DetailRow
                    label="Profissionais na equipe"
                    value={String(
                      dataset.professionals.filter(
                        (item) =>
                          item.teamId === selectedArea.teamId && item.active,
                      ).length,
                    )}
                  />
                  <StatusChip active={selectedArea.active} />
                  <button
                    className="health-detail-action"
                    type="button"
                    onClick={() => {
                      setActiveTab("area");
                      setModal({ kind: "area", id: selectedArea.id });
                    }}
                  >
                    <Edit3 size={14} /> Editar área
                  </button>
                </>
              ) : selectedUnit ? (
                <>
                  <p className="health-map-detail-code">{selectedUnit.kind}</p>
                  <DetailRow
                    label="Endereço"
                    value={`${selectedUnit.address} · ${selectedUnit.neighborhood}`}
                  />
                  <DetailRow
                    label="Telefone demonstrativo"
                    value={selectedUnit.phone || "Não informado"}
                  />
                  <DetailRow
                    label="Equipes vinculadas"
                    value={String(
                      dataset.teams.filter(
                        (item) =>
                          item.unitId === selectedUnit.id && item.active,
                      ).length,
                    )}
                  />
                  <StatusChip active={selectedUnit.active} />
                  <button
                    className="health-detail-action"
                    type="button"
                    onClick={() => {
                      setActiveTab("unit");
                      setModal({ kind: "unit", id: selectedUnit.id });
                    }}
                  >
                    <Edit3 size={14} /> Editar unidade
                  </button>
                </>
              ) : selectedTeam ? (
                <>
                  <p className="health-map-detail-code">
                    {selectedTeam.code} · {selectedTeam.model}
                  </p>
                  <DetailRow
                    label="Unidade vinculada"
                    value={
                      getUnit(selectedTeam.unitId)?.name ?? "Não informada"
                    }
                  />
                  <DetailRow
                    label="Área de atuação"
                    value={
                      getArea(selectedTeam.areaId)?.name ?? "Não vinculada"
                    }
                  />
                  <DetailRow
                    label="Profissionais ativos"
                    value={String(
                      dataset.professionals.filter(
                        (item) =>
                          item.teamId === selectedTeam.id && item.active,
                      ).length,
                    )}
                  />
                  <StatusChip active={selectedTeam.active} />
                  <button
                    className="health-detail-action"
                    type="button"
                    onClick={() => {
                      setActiveTab("team");
                      setModal({ kind: "team", id: selectedTeam.id });
                    }}
                  >
                    <Edit3 size={14} /> Editar equipe
                  </button>
                </>
              ) : (
                <p className="health-map-empty-detail">
                  Selecione uma área, unidade ou equipe no mapa para consultar
                  seus vínculos.
                </p>
              )}
            </aside>
          </div>
          <div className="health-territory-note">
            <strong>Como interpretar este mapa</strong>
            <span>
              As áreas demonstram uma possível divisão de trabalho territorial.
              Unidades são pontos de referência e as equipes aparecem vinculadas
              à sua unidade e área. O protótipo não importa limites geográficos
              nem dados reais de usuários.
            </span>
          </div>
        </>
      ) : (
        <EntityList
          kind={activeTab}
          dataset={dataset}
          search={search}
          setSearch={setSearch}
          includeInactive={includeInactive}
          setIncludeInactive={setIncludeInactive}
          onAdd={() => setModal({ kind: activeTab })}
          onEdit={(id) => setModal({ kind: activeTab, id })}
          onToggle={toggleActive}
          getUnit={getUnit}
          getTeam={getTeam}
          getArea={getArea}
          onOpenMap={(feature) => {
            setSelectedFeature(feature);
            const isInactive =
              feature.kind === "area"
                ? !getArea(feature.id)?.active
                : feature.kind === "unit"
                  ? !getUnit(feature.id)?.active
                  : !getTeam(feature.id)?.active;
            setIncludeInactive((current) => current || isInactive);
            setSearch("");
            setAreaFilter("all");
            setActiveTab("map");
            setMapLayer(
              feature.kind === "area"
                ? "areas"
                : feature.kind === "unit"
                  ? "units"
                  : "teams",
            );
          }}
        />
      )}

      {modal && (
        <div
          className="health-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="health-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="health-modal-title"
          >
            <header>
              <div>
                <span>CADASTRO DEMONSTRATIVO</span>
                <h3 id="health-modal-title">
                  {modal.id ? "Editar" : "Novo cadastro"} ·{" "}
                  {entitySingular[modal.kind]}
                </h3>
              </div>
              <button type="button" aria-label="Fechar" onClick={closeModal}>
                <X size={18} />
              </button>
            </header>
            {formError && (
              <p className="health-form-error" role="alert">
                {formError}
              </p>
            )}
            <form onSubmit={submitEntity}>
              {modal.kind === "unit" && (
                <>
                  <label>
                    Nome da unidade *
                    <input
                      name="name"
                      defaultValue={editingValue("name")}
                      placeholder="Ex.: UBS Vila Nova"
                      maxLength={90}
                      required
                    />
                  </label>
                  <label>
                    Tipo de unidade *
                    <select
                      name="kind"
                      defaultValue={editingValue(
                        "kind",
                        "Unidade Básica de Saúde",
                      )}
                      required
                    >
                      <option>Unidade Básica de Saúde</option>
                      <option>Unidade de Saúde da Família</option>
                      <option>Centro de Saúde</option>
                      <option>Ponto de Apoio à Saúde Rural</option>
                      <option>Unidade de Vigilância em Saúde</option>
                      <option>Outro serviço municipal</option>
                    </select>
                  </label>
                  <div className="health-form-grid">
                    <label>
                      Logradouro e número *
                      <input
                        name="address"
                        defaultValue={editingValue("address")}
                        placeholder="Rua, número ou estrada"
                        required
                      />
                    </label>
                    <label>
                      Bairro/localidade *
                      <input
                        name="neighborhood"
                        defaultValue={editingValue("neighborhood")}
                        placeholder="Bairro ou localidade"
                        required
                      />
                    </label>
                  </div>
                  <div className="health-form-grid">
                    <label>
                      Telefone demonstrativo
                      <input
                        name="phone"
                        defaultValue={editingValue("phone")}
                        placeholder="(43) 3554-0000"
                      />
                    </label>
                    <label>
                      Posição esquemática no mapa *
                      <select
                        name="region"
                        defaultValue={editingValue("region", "centro")}
                        required
                      >
                        {regionOptions.map((region) => (
                          <option key={region} value={region}>
                            {mapRegionLabels[region]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
              {modal.kind === "team" && (
                <>
                  <label>
                    Nome da equipe *
                    <input
                      name="name"
                      defaultValue={editingValue("name")}
                      placeholder="Ex.: Equipe Saúde da Família Centro"
                      maxLength={90}
                      required
                    />
                  </label>
                  <div className="health-form-grid">
                    <label>
                      Identificação/código *
                      <input
                        name="code"
                        defaultValue={editingValue("code")}
                        placeholder="ESF-04"
                        required
                      />
                    </label>
                    <label>
                      Modelo de equipe *
                      <select
                        name="model"
                        defaultValue={editingValue("model", "Saúde da Família")}
                        required
                      >
                        <option>Saúde da Família</option>
                        <option>Atenção Primária Rural</option>
                        <option>Saúde Bucal</option>
                        <option>Equipe Multiprofissional</option>
                        <option>Vigilância em Saúde</option>
                        <option>Outro modelo municipal</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Unidade de referência *
                    <select
                      name="unitId"
                      defaultValue={editingValue("unitId")}
                      required
                    >
                      <option value="">Selecione uma unidade</option>
                      {dataset.units
                        .filter(
                          (item) =>
                            item.active || item.id === editingValue("unitId"),
                        )
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                            {item.active ? "" : " · inativa"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Área de atuação *
                    <select
                      name="areaId"
                      defaultValue={editingValue("areaId")}
                      required
                    >
                      <option value="">Selecione uma área</option>
                      {dataset.areas
                        .filter(
                          (item) =>
                            item.active || item.id === editingValue("areaId"),
                        )
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              {modal.kind === "professional" && (
                <>
                  <label>
                    Nome completo *
                    <input
                      name="name"
                      defaultValue={editingValue("name")}
                      placeholder="Nome do profissional"
                      maxLength={100}
                      required
                    />
                  </label>
                  <div className="health-form-grid">
                    <label>
                      Categoria profissional *
                      <select
                        name="category"
                        defaultValue={editingValue(
                          "category",
                          "Agente Comunitário de Saúde",
                        )}
                        required
                      >
                        <option>Agente Comunitário de Saúde</option>
                        <option>Agente de Combate às Endemias</option>
                        <option>Médico de Família</option>
                        <option>Enfermeiro(a)</option>
                        <option>Técnico(a) de Enfermagem</option>
                        <option>Cirurgião(ã)-dentista</option>
                        <option>Auxiliar/Técnico(a) de Saúde Bucal</option>
                        <option>Fisioterapeuta</option>
                        <option>Farmacêutico(a)</option>
                        <option>Outro profissional</option>
                      </select>
                    </label>
                    <label>
                      Registro/matrícula demonstrativo *
                      <input
                        name="registration"
                        defaultValue={editingValue("registration")}
                        placeholder="Conselho ou matrícula fictícia"
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Equipe vinculada *
                    <select
                      name="teamId"
                      defaultValue={editingValue("teamId")}
                      required
                    >
                      <option value="">Selecione uma equipe</option>
                      {dataset.teams
                        .filter(
                          (item) =>
                            item.active || item.id === editingValue("teamId"),
                        )
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Telefone demonstrativo
                    <input
                      name="phone"
                      defaultValue={editingValue("phone")}
                      placeholder="(43) 9 9000-0000"
                    />
                  </label>
                </>
              )}
              {modal.kind === "area" && (
                <>
                  <label>
                    Nome da área de atuação *
                    <input
                      name="name"
                      defaultValue={editingValue("name")}
                      placeholder="Ex.: Microárea Vila Nova"
                      maxLength={90}
                      required
                    />
                  </label>
                  <div className="health-form-grid">
                    <label>
                      Código identificador *
                      <input
                        name="code"
                        defaultValue={editingValue("code")}
                        placeholder="MA-05"
                        required
                      />
                    </label>
                    <label>
                      Moradores estimados *
                      <input
                        type="number"
                        name="estimatedResidents"
                        defaultValue={editingValue("estimatedResidents")}
                        min="1"
                        max="100000"
                        required
                      />
                      <small>Valor sintético para a demonstração.</small>
                    </label>
                  </div>
                  <label>
                    Equipe responsável *
                    <select
                      name="teamId"
                      defaultValue={editingValue("teamId")}
                      required
                    >
                      <option value="">Selecione uma equipe</option>
                      {dataset.teams
                        .filter(
                          (item) =>
                            item.active || item.id === editingValue("teamId"),
                        )
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="health-form-grid">
                    <label>
                      Recorte no mapa *
                      <select
                        name="region"
                        defaultValue={editingValue("region", "centro")}
                        required
                      >
                        {regionOptions.map((region) => (
                          <option key={region} value={region}>
                            {mapRegionLabels[region]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Cor da área *
                      <select
                        name="color"
                        defaultValue={editingValue("color", "#25826f")}
                        required
                      >
                        <option value="#25826f">Verde institucional</option>
                        <option value="#d49332">Âmbar</option>
                        <option value="#5578ba">Azul</option>
                        <option value="#9a6ab1">Lilás</option>
                        <option value="#c35d68">Coral</option>
                      </select>
                    </label>
                  </div>
                  <p className="health-form-note">
                    Neste protótipo, o recorte seleciona uma geometria
                    esquemática predefinida. A edição/importação de limites
                    geográficos reais fica para uma etapa posterior.
                  </p>
                </>
              )}
              {modal.kind === "catalog" && (
                <>
                  <label>Domínio do catálogo *<select name="domain" defaultValue={editingValue("domain", "Tipo de unidade")} required><option>Tipo de unidade</option><option>Modelo de equipe</option><option>Categoria profissional</option><option>Tipo de área</option></select></label>
                  <div className="health-form-grid"><label>Código *<input name="code" defaultValue={editingValue("code")} placeholder="Ex.: UBS" required /></label><label>Nome/descrição curta *<input name="label" defaultValue={editingValue("label")} required /></label></div>
                  <label>Descrição operacional<textarea name="description" defaultValue={editingValue("description")} rows={3} maxLength={400} placeholder="Explique quando o item deve ser usado, sem apagar versões anteriores." /></label>
                  <div className="health-form-grid"><label>Início da vigência *<input name="validFrom" type="date" defaultValue={editingValue("validFrom", new Date().toISOString().slice(0, 10))} required /></label><label>Fim da vigência<input name="validTo" type="date" defaultValue={editingValue("validTo")} /></label></div>
                  <p className="health-form-note"><Archive size={13} /> Editar um item cria uma nova versão e mantém o histórico anterior. Exclusão não é permitida.</p>
                </>
              )}
              {modal.kind !== "catalog" && (
                <div className="health-form-grid"><label>Início da vigência<input name="validFrom" type="date" defaultValue={editingValue("validFrom", new Date().toISOString().slice(0, 10))} /></label><label>Fim da vigência<input name="validTo" type="date" defaultValue={editingValue("validTo")} /></label></div>
              )}
              {modal.id && (
                <label className="health-active-check">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editingValue("active") !== "false"}
                  />{" "}
                  Cadastro ativo
                </label>
              )}
              <div className="health-modal-actions">
                <button
                  type="button"
                  className="health-cancel-button"
                  onClick={closeModal}
                >
                  Cancelar
                </button>
                <button type="submit" className="health-save-button">
                  <Check size={15} />
                  {modal.id ? "Salvar alterações" : "Cadastrar"}
                </button>
              </div>
            </form>
            <p className="health-modal-footnote">
              <ShieldCheck size={13} /> Dados fictícios · alterações somente
              nesta sessão
            </p>
          </section>
        </div>
      )}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="health-territory-metric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
    </article>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? "active" : ""}
      onClick={onClick}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="health-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span className={`health-status-chip ${active ? "active" : "inactive"}`}>
      <i />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function EntityList({
  kind,
  dataset,
  search,
  setSearch,
  includeInactive,
  setIncludeInactive,
  onAdd,
  onEdit,
  onToggle,
  getUnit,
  getTeam,
  getArea,
  onOpenMap,
}: {
  kind: EntityKind;
  dataset: HealthTerritoryDataset;
  search: string;
  setSearch: (value: string) => void;
  includeInactive: boolean;
  setIncludeInactive: (value: boolean) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onToggle: (kind: EntityKind, id: string) => void;
  getUnit: (id: string) => HealthUnit | undefined;
  getTeam: (id: string) => HealthTeam | undefined;
  getArea: (id: string) => ServiceArea | undefined;
  onOpenMap: (feature: FeatureSelection) => void;
}) {
  const title = entityPlural[kind];
  const data =
    kind === "unit"
      ? dataset.units
      : kind === "team"
        ? dataset.teams
        : kind === "professional"
          ? dataset.professionals
          : kind === "area"
            ? dataset.areas
            : dataset.catalogs;
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = data.filter((item) => {
    if (!includeInactive && !item.active) return false;
    const text = Object.values(item).join(" ").toLocaleLowerCase("pt-BR");
    return !query || text.includes(query);
  });

  return (
    <div className="health-entity-page">
      <div className="health-entity-toolbar">
        <div>
          <span>CADASTROS DA REDE MUNICIPAL</span>
          <h3>{title}</h3>
          <p>
            Consulte, relacione e mantenha os cadastros demonstrativos desta
            sessão.
          </p>
        </div>
        <button className="health-entity-add" type="button" onClick={onAdd}>
          <Plus size={15} /> Novo cadastro
        </button>
      </div>
      <div className="health-entity-filters">
        <label>
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Buscar ${title.toLocaleLowerCase("pt-BR")}`}
          />
        </label>
        <label className="health-entity-inactive">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />{" "}
          Incluir inativos
        </label>
        <span>
          {filtered.length} de {data.length} registro(s)
        </span>
      </div>
      {filtered.length ? (
        <div className="health-entity-table-wrap">
          <table className="health-entity-table">
            <thead>
              <tr>
                {kind === "unit" ? (
                  <>
                    <th>Unidade</th>
                    <th>Localização</th>
                    <th>Equipes</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </>
                ) : kind === "team" ? (
                  <>
                    <th>Equipe</th>
                    <th>Unidade</th>
                    <th>Área</th>
                    <th>Profissionais</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </>
                ) : kind === "professional" ? (
                  <>
                    <th>Profissional</th>
                    <th>Categoria/registro</th>
                    <th>Equipe</th>
                    <th>Unidade</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </>
                ) : kind === "catalog" ? (
                  <><th>Catálogo</th><th>Domínio</th><th>Vigência/versão</th><th>Histórico</th><th>Situação</th><th>Ações</th></>
                ) : (
                  <>
                    <th>Área de atuação</th>
                    <th>Equipe responsável</th>
                    <th>Localização</th>
                    <th>Moradores estimados</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  {kind === "unit" && (
                    <>
                      <td>
                        <strong>{(item as HealthUnit).name}</strong>
                        <small>
                          {(item as HealthUnit).kind} · {item.id}
                        </small>
                        <small>Vigência: {(item as HealthUnit).validFrom ?? "não informada"}{item.validTo ? ` até ${item.validTo}` : " em aberto"}</small>
                      </td>
                      <td>
                        {(item as HealthUnit).address}
                        <small>
                          {(item as HealthUnit).neighborhood} ·{" "}
                          {mapRegionLabels[(item as HealthUnit).region]}
                        </small>
                      </td>
                      <td>
                        {
                          dataset.teams.filter(
                            (team) => team.unitId === item.id && team.active,
                          ).length
                        }
                      </td>
                      <td>
                        <StatusChip active={item.active} />
                      </td>
                      <td>
                        <RowActions
                          onMap={() => onOpenMap({ kind: "unit", id: item.id })}
                          onEdit={() => onEdit(item.id)}
                          onToggle={() => onToggle(kind, item.id)}
                          active={item.active}
                        />
                      </td>
                    </>
                  )}
                  {kind === "team" && (
                    <>
                      <td>
                        <strong>{(item as HealthTeam).name}</strong>
                        <small>
                          {(item as HealthTeam).code} ·{" "}
                          {(item as HealthTeam).model}
                        </small>
                        <small>Vigência: {(item as HealthTeam).validFrom ?? "não informada"} · composição histórica: {(item as HealthTeam).compositionHistory?.length ?? 0} evento(s)</small>
                        {(item as HealthTeam).compositionHistory?.length ? <details className="health-inline-history"><summary>Ver composição</summary>{(item as HealthTeam).compositionHistory?.map((event) => <span key={event.id}>{event.validFrom} · {event.action} · {event.role}</span>)}</details> : null}
                      </td>
                      <td>
                        {getUnit((item as HealthTeam).unitId)?.name ??
                          "Unidade não vinculada"}
                      </td>
                      <td>
                        {getArea((item as HealthTeam).areaId)?.name ??
                          "Área não vinculada"}
                      </td>
                      <td>
                        {
                          dataset.professionals.filter(
                            (professional) =>
                              professional.teamId === item.id &&
                              professional.active,
                          ).length
                        }
                      </td>
                      <td>
                        <StatusChip active={item.active} />
                      </td>
                      <td>
                        <RowActions
                          onMap={() => onOpenMap({ kind: "team", id: item.id })}
                          onEdit={() => onEdit(item.id)}
                          onToggle={() => onToggle(kind, item.id)}
                          active={item.active}
                        />
                      </td>
                    </>
                  )}
                  {kind === "professional" && (
                    <>
                      <td>
                        <strong>{(item as HealthProfessional).name}</strong>
                        <small>
                          {item.id} ·{" "}
                          {(item as HealthProfessional).phone || "sem telefone"}
                        </small>
                      </td>
                      <td>
                        {(item as HealthProfessional).category}
                        <small>
                          {(item as HealthProfessional).registration}
                        </small>
                        <small>Vigência: {(item as HealthProfessional).validFrom ?? "não informada"} · histórico: {(item as HealthProfessional).history?.length ?? 0} evento(s)</small>
                      </td>
                      <td>
                        {getTeam((item as HealthProfessional).teamId)?.code ??
                          "Sem equipe"}
                      </td>
                      <td>
                        {getUnit((item as HealthProfessional).unitId)?.name ??
                          "Unidade não vinculada"}
                      </td>
                      <td>
                        <StatusChip active={item.active} />
                      </td>
                      <td>
                        <RowActions
                          onMap={() =>
                            onOpenMap({
                              kind: "team",
                              id: (item as HealthProfessional).teamId,
                            })
                          }
                          onEdit={() => onEdit(item.id)}
                          onToggle={() => onToggle(kind, item.id)}
                          active={item.active}
                        />
                      </td>
                    </>
                  )}
                  {kind === "catalog" && (
                    <>
                      <td><strong>{(item as HealthCatalog).label}</strong><small>{(item as HealthCatalog).code} · {(item as HealthCatalog).id}</small></td>
                      <td>{(item as HealthCatalog).domain}<small>{(item as HealthCatalog).description ?? "Sem descrição"}</small></td>
                      <td>{(item as HealthCatalog).validFrom} {item.validTo ? `até ${item.validTo}` : "em aberto"}<small>versão {(item as HealthCatalog).version}</small></td>
                      <td><strong>{(item as HealthCatalog).history.length}</strong><small>eventos auditáveis</small></td>
                      <td><StatusChip active={item.active} /></td>
                      <td><RowActions onMap={() => undefined} onEdit={() => onEdit(item.id)} onToggle={() => onToggle(kind, item.id)} active={item.active} /></td>
                    </>
                  )}
                  {kind === "area" && (
                    <>
                      <td>
                        <strong>{(item as ServiceArea).name}</strong>
                        <small>
                          {(item as ServiceArea).code} · {item.id}
                        </small>
                        <small>Vigência: {(item as ServiceArea).validFrom ?? "não informada"} · histórico: {(item as ServiceArea).history?.length ?? 0} evento(s)</small>
                      </td>
                      <td>
                        {getTeam((item as ServiceArea).teamId)?.name ??
                          "Sem equipe vinculada"}
                      </td>
                      <td>
                        {mapRegionLabels[(item as ServiceArea).region]} ·
                        recorte esquemático
                      </td>
                      <td>
                        {(
                          item as ServiceArea
                        ).estimatedResidents.toLocaleString("pt-BR")}{" "}
                        <small>estimativa demonstrativa</small>
                      </td>
                      <td>
                        <StatusChip active={item.active} />
                      </td>
                      <td>
                        <RowActions
                          onMap={() => onOpenMap({ kind: "area", id: item.id })}
                          onEdit={() => onEdit(item.id)}
                          onToggle={() => onToggle(kind, item.id)}
                          active={item.active}
                        />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="health-entity-empty">
          <ClipboardList size={23} />
          <strong>Nenhum registro encontrado</strong>
          <span>Ajuste a busca ou cadastre um novo item demonstrativo.</span>
        </div>
      )}
      <p className="health-entity-footnote">
        <ShieldCheck size={14} /> Cadastros, identificadores e vínculos são
        fictícios; desativar mantém o registro no histórico desta sessão.
      </p>
    </div>
  );
}

function RowActions({
  onMap,
  onEdit,
  onToggle,
  active,
}: {
  onMap: () => void;
  onEdit: () => void;
  onToggle: () => void;
  active: boolean;
}) {
  return (
    <div className="health-row-actions">
      <button
        type="button"
        onClick={onMap}
        title="Ver no mapa"
        aria-label="Ver no mapa"
      >
        <MapPinned size={14} />
      </button>
      <button type="button" onClick={onEdit} title="Editar" aria-label="Editar">
        <Edit3 size={14} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        title={active ? "Desativar" : "Ativar"}
        aria-label={active ? "Desativar" : "Ativar"}
      >
        {active ? <X size={14} /> : <Check size={14} />}
      </button>
    </div>
  );
}

export default HealthTerritoryModule;
