import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  MapPin,
  Plus,
  Search,
  Users,
  UserRound,
  Home,
  Pencil,
  X,
} from "lucide-react";
import {
  mapRegionCenters,
  mapRegionPolygons,
  type HealthTerritoryDataset,
  type MapRegion,
} from "../data/healthTerritory";
import type {
  PeopleRegistryDataset,
  RegistryPerson,
  RegistryFamily,
  RegistryHousehold,
  RegistryAddress,
  RegistryIdentifier,
  FamilyMembership,
  ResidenceLink,
  RegistryHistoryEvent,
} from "../data/peopleRegistry";
import "./PeopleFamiliesDomicilesModule.css";
type Props = {
  dataset: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: PeopleRegistryDataset) => PeopleRegistryDataset,
  ) => void;
};
type Screen = "overview" | "people" | "person" | "families" | "homes" | "map";
const today = () => new Date().toISOString().slice(0, 10);
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
const normalizeIdentifier = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");
const mightBeDuplicate = (
  left: Pick<RegistryPerson, "fullName" | "birthDate" | "identifiers">,
  right: Pick<RegistryPerson, "fullName" | "birthDate" | "identifiers">,
) => {
  const sameNameAndBirth =
    Boolean(norm(left.fullName)) &&
    norm(left.fullName) === norm(right.fullName) &&
    Boolean(left.birthDate) &&
    left.birthDate === right.birthDate;
  const sharedIdentifier = left.identifiers.some((leftIdentifier) =>
    right.identifiers.some((rightIdentifier) => {
      const leftValue = normalizeIdentifier(leftIdentifier.value);
      return (
        Boolean(leftValue) &&
        norm(leftIdentifier.type) === norm(rightIdentifier.type) &&
        leftValue === normalizeIdentifier(rightIdentifier.value)
      );
    }),
  );
  return sameNameAndBirth || sharedIdentifier;
};
const event = (action: string): RegistryHistoryEvent => ({
  date: today(),
  action,
  detail: "Atualização local de demonstração fictícia.",
});
const idFor = (prefix: string, ids: string[]) =>
  `${prefix}-${String(Math.max(0, ...ids.map((x) => Number(x.split("-").at(-1)) || 0)) + 1).padStart(3, "0")}`;
export default function PeopleFamiliesDomicilesModule({
  dataset: d,
  healthTerritory,
  onChange,
}: Props) {
  const [screen, setScreen] = useState<Screen>("overview"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [filterStatus, setFilterStatus] = useState("all"),
    [filterFamily, setFilterFamily] = useState("all"),
    [filterArea, setFilterArea] = useState("all"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<Partial<RegistryPerson>>({}),
    [confirmed, setConfirmed] = useState(false),
    [mapArea, setMapArea] = useState("all"),
    [mapLayer, setMapLayer] = useState<"areas" | "homes">("areas"),
    [zoom, setZoom] = useState(1),
    [homeId, setHomeId] = useState(""),
    [addressSelection, setAddressSelection] = useState("new"),
    [familyFormOpen, setFamilyFormOpen] = useState(false),
    [familyEditingId, setFamilyEditingId] = useState(""),
    [familyNameDraft, setFamilyNameDraft] = useState(""),
    [familyReferenceDraft, setFamilyReferenceDraft] = useState(""),
    [familyStatusDraft, setFamilyStatusDraft] = useState<"Ativa" | "Inativa">(
      "Ativa",
    ),
    [memberRelationships, setMemberRelationships] = useState<
      Record<string, string>
    >({});
  const person = d.people.find((x) => x.id === selected),
    home = d.households.find((x) => x.id === homeId),
    homeAddress = d.addresses.find((x) => x.id === home?.addressId),
    formAddress = d.addresses.find((x) => x.id === addressSelection),
    reuseAddressInForm =
      addressSelection !== "new" && addressSelection !== home?.addressId;
  const addressForHousehold = (household?: RegistryHousehold) =>
    d.addresses.find((address) => address.id === household?.addressId);
  const activeFamily = (pid: string) =>
    d.familyMemberships.find((x) => x.personId === pid && !x.endDate);
  const activeResidence = (pid: string) =>
    d.residenceLinks.find((x) => x.personId === pid && !x.endDate);
  const familiesAtAddress = (addressId: string) => {
    const householdIds = new Set(
      d.households
        .filter((household) => household.addressId === addressId)
        .map((household) => household.id),
    );
    return d.families.filter((family) =>
      d.familyMemberships.some(
        (membership) =>
          family.status === "Ativa" &&
          membership.familyId === family.id &&
          !membership.endDate &&
          d.residenceLinks.some(
            (residence) =>
              residence.personId === membership.personId &&
              householdIds.has(residence.householdId) &&
              !residence.endDate,
          ),
      ),
    );
  };
  const candidates = useMemo(() => {
    const probe = {
      fullName: draft.fullName || "",
      birthDate: draft.birthDate || "",
      identifiers: (draft.identifiers || []) as RegistryIdentifier[],
    };
    if (
      !norm(probe.fullName) &&
      !probe.identifiers.some((identifier) => identifier.value.trim())
    )
      return [];
    return d.people.filter(
      (p) => p.id !== selected && mightBeDuplicate(probe, p),
    );
  }, [d.people, draft.fullName, draft.birthDate, draft.identifiers, selected]);
  useEffect(() => {
    setConfirmed(false);
  }, [candidates]);
  const goPerson = (id?: string) => {
    setSelected(id || "");
    setDraft(
      id
        ? { ...d.people.find((p) => p.id === id) }
        : {
            fullName: "",
            preferredName: "",
            birthDate: "",
            contacts: [],
            identifiers: [],
            notes: "",
            status: "Ativa",
          },
    );
    setConfirmed(false);
    setError("");
    setScreen("person");
  };
  const back = () => {
    setScreen(
      screen === "person"
        ? "people"
        : screen === "homes" && homeId
          ? "homes"
          : "overview",
    );
    setHomeId("");
    setError("");
  };
  const savePerson = (e: FormEvent) => {
    e.preventDefault();
    const fullName = (draft.fullName || "").trim(),
      birthDate = (draft.birthDate || "").trim();
    if (!fullName || !birthDate) {
      setError(
        "Nome completo e data de nascimento são obrigatórios; espaços em branco não são aceitos.",
      );
      return;
    }
    if (!selected && candidates.length && !confirmed) {
      setError(
        "Revise possíveis correspondências e confirme explicitamente a criação de cadastro separado.",
      );
      return;
    }
    const id =
      selected ||
      idFor(
        "SIM-PES",
        d.people.map((x) => x.id),
      );
    const record: RegistryPerson = {
      id,
      fullName,
      preferredName: (draft.preferredName || "").trim() || undefined,
      birthDate,
      contacts: (draft.contacts || [])
        .filter((c) => c.value.trim())
        .map((c) => ({ ...c, value: c.value.trim() })),
      identifiers: (draft.identifiers || [])
        .filter((i) => i.value.trim())
        .map((i) => ({ ...i, value: i.value.trim() })),
      notes: (draft.notes || "").trim(),
      status: draft.status || "Ativa",
      history: selected
        ? [...(person?.history || []), event("Cadastro atualizado")]
        : [event("Cadastro criado")],
    };
    onChange((cur) => ({
      ...cur,
      people: selected
        ? cur.people.map((p) => (p.id === id ? record : p))
        : [record, ...cur.people],
    }));
    setNotice(
      "Cadastro atualizado nesta demonstração; alterações não persistem e somem ao recarregar.",
    );
    setSelected(id);
    setScreen("people");
  };
  const visiblePeople = d.people.filter((p) => {
    const blob = norm(
      `${p.fullName} ${p.id} ${p.identifiers.map((x) => x.value).join(" ")}`,
    );
    const fam = activeFamily(p.id)?.familyId;
    const household = d.households.find(
      (h) => h.id === activeResidence(p.id)?.householdId,
    );
    const area = addressForHousehold(household)?.areaId;
    return (
      (!search || blob.includes(norm(search))) &&
      (filterStatus === "all" || p.status === filterStatus) &&
      (filterFamily === "all" || fam === filterFamily) &&
      (filterArea === "all" || area === filterArea)
    );
  });
  const updateHome = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      v = (k: string) => String(fd.get(k) || "").trim();
    const selectedAddressId = v("addressId") || "new";
    const selectedAddress = d.addresses.find(
      (address) => address.id === selectedAddressId,
    );
    const reuseExistingAddress = Boolean(
      selectedAddress && selectedAddressId !== home?.addressId,
    );
    if (selectedAddressId !== "new" && !selectedAddress) {
      setError("Selecione um endereço existente ou escolha cadastrar novo.");
      return;
    }
    if (
      !reuseExistingAddress &&
      ["street", "number", "neighborhood", "locality", "areaId"].some(
        (k) => !v(k),
      )
    ) {
      setError("Preencha endereço, número, bairro, localidade e área.");
      return;
    }
    const id =
      home?.id ||
      idFor(
        "SIM-DOM",
        d.households.map((x) => x.id),
      );
    const addressToEdit =
      !reuseExistingAddress && selectedAddressId === home?.addressId
        ? selectedAddress
        : undefined;
    const address: RegistryAddress = reuseExistingAddress
      ? selectedAddress!
      : {
          id:
            addressToEdit?.id ||
            idFor(
              "SIM-END",
              d.addresses.map((x) => x.id),
            ),
          street: v("street"),
          number: v("number"),
          neighborhood: v("neighborhood"),
          locality: v("locality"),
          postalCode: v("postalCode"),
          zone: v("zone") as "Urbana" | "Rural",
          areaId: v("areaId"),
          history: [
            ...(addressToEdit?.history || []),
            event(
              addressToEdit ? "Endereço atualizado" : "Endereço cadastrado",
            ),
          ],
        };
    const h: RegistryHousehold = {
      id,
      addressId: address.id,
      complement: v("complement"),
      occupationType: v("occupationType"),
      waterSupply: v("waterSupply"),
      sewage: v("sewage"),
      wasteCollection: v("wasteCollection"),
      energy: v("energy"),
      status: home?.status || "Ativo",
      history: [
        ...(home?.history || []),
        event(home ? "Domicílio atualizado" : "Domicílio cadastrado"),
      ],
    };
    onChange((c) => ({
      ...c,
      addresses: reuseExistingAddress
        ? c.addresses
        : addressToEdit
          ? c.addresses.map((x) => (x.id === address.id ? address : x))
          : [address, ...c.addresses],
      households: home
        ? c.households.map((x) => (x.id === id ? h : x))
        : [h, ...c.households],
    }));
    setAddressSelection(address.id);
    setHomeId(id);
    setError("");
    setNotice("Domicílio salvo nesta demonstração fictícia.");
  };
  const addMember = (
    familyId: string,
    personId: string,
    relationship: string,
  ) => {
    if (
      d.familyMemberships.some(
        (m) => m.familyId === familyId && m.personId === personId && !m.endDate,
      )
    ) {
      setNotice("Vínculo ativo já existe; nenhuma duplicação foi criada.");
      return;
    }
    const m: FamilyMembership = {
      id: idFor(
        "SIM-VF",
        d.familyMemberships.map((x) => x.id),
      ),
      familyId,
      personId,
      relationship,
      startDate: today(),
      history: [event("Vínculo familiar iniciado")],
    };
    onChange((c) => ({
      ...c,
      familyMemberships: [...c.familyMemberships, m],
      families: c.families.map((f) =>
        f.id === familyId
          ? {
              ...f,
              history: [...f.history, event("Composição familiar atualizada")],
            }
          : f,
      ),
    }));
    setNotice("Vínculo familiar incluído nesta demonstração.");
  };
  const endMembership = (m: FamilyMembership) => {
    onChange((c) => ({
      ...c,
      familyMemberships: c.familyMemberships.map((x) =>
        x.id === m.id
          ? {
              ...x,
              endDate: today(),
              history: [...x.history, event("Vínculo familiar encerrado")],
            }
          : x,
      ),
      families: c.families.map((f) =>
        f.id === m.familyId
          ? {
              ...f,
              history: [...f.history, event("Composição familiar atualizada")],
            }
          : f,
      ),
    }));
    setNotice("Vínculo familiar encerrado e preservado no histórico.");
  };
  const endResidence = (r: ResidenceLink) => {
    onChange((c) => ({
      ...c,
      residenceLinks: c.residenceLinks.map((x) =>
        x.id === r.id
          ? {
              ...x,
              endDate: today(),
              history: [...x.history, event("Vínculo residencial encerrado")],
            }
          : x,
      ),
    }));
    setNotice("Vínculo residencial encerrado e mantido no histórico.");
  };
  const moveResidence = (personId: string, householdId: string) => {
    const prev = activeResidence(personId);
    if (prev?.householdId === householdId) {
      setNotice("A pessoa já possui residência ativa neste domicílio.");
      return;
    }
    const link: ResidenceLink = {
      id: idFor(
        "SIM-RES",
        d.residenceLinks.map((x) => x.id),
      ),
      personId,
      householdId,
      startDate: today(),
      history: [event("Residência vinculada")],
    };
    onChange((c) => ({
      ...c,
      residenceLinks: [
        ...c.residenceLinks.map((x) =>
          x.personId === personId && !x.endDate
            ? {
                ...x,
                endDate: today(),
                history: [
                  ...x.history,
                  event(
                    "Residência encerrada automaticamente ao criar novo vínculo",
                  ),
                ],
              }
            : x,
        ),
        link,
      ],
    }));
    setNotice(
      "Residência atualizada atomicamente; vínculo anterior preservado no histórico.",
    );
  };
  const openHome = (id: string) => {
    setHomeId(id);
    setAddressSelection(
      d.households.find((household) => household.id === id)?.addressId || "new",
    );
    setScreen("homes");
  };
  const openFamilyForm = (family?: RegistryFamily) => {
    setFamilyEditingId(family?.id || "");
    setFamilyNameDraft(family?.name || "");
    setFamilyReferenceDraft(family?.referencePersonId || d.people[0]?.id || "");
    setFamilyStatusDraft(family?.status || "Ativa");
    setFamilyFormOpen(true);
    setError("");
  };
  const saveFamily = (e: FormEvent) => {
    e.preventDefault();
    const name = familyNameDraft.trim();
    if (!name || !familyReferenceDraft) {
      setError(
        "Informe o nome da família e selecione uma pessoa de referência.",
      );
      return;
    }
    if (!d.people.some((p) => p.id === familyReferenceDraft)) {
      setError("A pessoa de referência selecionada não foi encontrada.");
      return;
    }
    const current = d.families.find((f) => f.id === familyEditingId);
    const family: RegistryFamily = {
      id:
        current?.id ||
        idFor(
          "SIM-FAM",
          d.families.map((f) => f.id),
        ),
      name,
      referencePersonId: familyReferenceDraft,
      status: familyStatusDraft,
      history: current
        ? [...current.history, event("Dados da família atualizados")]
        : [event("Família cadastrada")],
    };
    onChange((c) => {
      const familyMemberships = c.familyMemberships.map((membership) => {
        if (membership.familyId !== family.id || membership.endDate)
          return membership;
        if (membership.personId === family.referencePersonId) {
          return membership.relationship === "Pessoa de referência"
            ? membership
            : {
                ...membership,
                relationship: "Pessoa de referência",
                history: [
                  ...membership.history,
                  event("Papel de pessoa de referência atualizado"),
                ],
              };
        }
        if (
          membership.personId === current?.referencePersonId &&
          ["Pessoa de referência", "Responsável"].includes(
            membership.relationship,
          )
        ) {
          return {
            ...membership,
            relationship: "Membro",
            history: [
              ...membership.history,
              event("Papel de referência encerrado; vínculo familiar mantido"),
            ],
          };
        }
        return membership;
      });
      const referenceAlreadyLinked = familyMemberships.some(
        (membership) =>
          membership.familyId === family.id &&
          membership.personId === family.referencePersonId &&
          !membership.endDate,
      );
      const referenceMembership: FamilyMembership | undefined =
        referenceAlreadyLinked
          ? undefined
          : {
              id: idFor(
                "SIM-VF",
                familyMemberships.map((membership) => membership.id),
              ),
              familyId: family.id,
              personId: family.referencePersonId,
              relationship: "Pessoa de referência",
              startDate: today(),
              history: [event("Vínculo familiar iniciado")],
            };
      return {
        ...c,
        families: current
          ? c.families.map((f) => (f.id === family.id ? family : f))
          : [family, ...c.families],
        familyMemberships: referenceMembership
          ? [referenceMembership, ...familyMemberships]
          : familyMemberships,
      };
    });
    setFamilyFormOpen(false);
    setFamilyEditingId("");
    setError("");
    setNotice(
      current
        ? "Família atualizada; evento mantido no histórico."
        : "Família criada nesta demonstração fictícia.",
    );
  };
  return (
    <section
      className="people-registry"
      aria-label="Pessoas, famílias e domicílios"
    >
      <header className="pr-head">
        <div>
          <span className="pr-kicker">
            GESTÃO TERRITORIAL · AMOSTRA FICTÍCIA
          </span>
          <h2>Pessoas, Famílias e Domicílios</h2>
          <p>
            Cadastros ilustrativos para demonstrar vínculos no território. Não
            são dados reais nem censo municipal.
          </p>
        </div>
        <span className="pr-demo">DEMONSTRAÇÃO / FICTÍCIO</span>
      </header>
      <div className="pr-warning" role="note">
        Dados inteiramente fictícios, sem persistência: alterações somem ao
        recarregar. Mapa esquemático, não cartografia oficial.
      </div>
      <nav className="pr-tabs" aria-label="Telas do módulo">
        {(
          [
            ["overview", "Visão Geral"],
            ["people", "Pessoas"],
            ["person", "Cadastro e Detalhe da Pessoa"],
            ["families", "Famílias"],
            ["homes", "Domicílios e Endereços"],
            ["map", "Mapa Territorial"],
          ] as [Screen, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={screen === key ? "active" : ""}
            onClick={() => {
              if (key === "person" && !selected) goPerson();
              else setScreen(key);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="pr-notice" role="status">
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {error && (
        <p className="pr-error" role="alert">
          {error}
        </p>
      )}
      {screen === "overview" && (
        <>
          <div className="pr-metrics">
            {[
              ["Pessoas", d.people.length, UserRound],
              ["Famílias", d.families.length, Users],
              ["Endereços", d.addresses.length, MapPin],
              ["Domicílios", d.households.length, Home],
              [
                "Vínculos ativos",
                d.familyMemberships.filter((x) => !x.endDate).length +
                  d.residenceLinks.filter((x) => !x.endDate).length,
                MapPin,
              ],
            ].map(([label, value, Icon]: any) => (
              <article key={label}>
                <Icon size={19} />
                <span>{label} · amostra de demonstração</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <div className="pr-card">
            <h3>Qualidade da amostra</h3>
            <p>
              <b>
                {
                  d.people.filter(
                    (p) => !p.contacts.length || !p.identifiers.length,
                  ).length
                }
              </b>{" "}
              cadastros incompletos (sem contato ou identificador sintético
              informado);{" "}
              <b>
                {
                  d.people.filter((person) =>
                    d.people.some(
                      (candidate) =>
                        candidate.id !== person.id &&
                        mightBeDuplicate(person, candidate),
                    ),
                  ).length
                }
              </b>{" "}
              registros em possíveis duplicidades (mesmo identificador/tipo ou
              nome normalizado e nascimento coincidentes). São alertas para
              revisão, não erros confirmados nem registros oficiais.
            </p>
            <form
              className="pr-search"
              onSubmit={(e) => {
                e.preventDefault();
                setScreen("people");
              }}
            >
              <Search />
              <input
                aria-label="Buscar pessoas"
                placeholder="Buscar por nome, ID ou identificador DEMO"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button>Buscar</button>
            </form>
            <div className="pr-shortcuts">
              <button onClick={() => goPerson()}>
                <Plus size={16} /> Nova pessoa
              </button>
              <button onClick={() => setScreen("people")}>Pessoas</button>
              <button onClick={() => setScreen("families")}>Famílias</button>
              <button onClick={() => setScreen("homes")}>Domicílios</button>
              <button onClick={() => setScreen("map")}>Mapa territorial</button>
            </div>
          </div>
        </>
      )}
      {screen === "people" && (
        <>
          <div className="pr-toolbar">
            <button className="pr-back" onClick={back}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3>Pessoas · registros demonstrativos</h3>
            <button className="pr-primary" onClick={() => goPerson()}>
              <Plus size={16} /> Nova pessoa
            </button>
          </div>
          <div className="pr-filters">
            <label>
              <Search />
              <input
                placeholder="Nome, ID ou CPF-DEMO/CNS-DEMO"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Filtrar situação"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Todas situações</option>
              <option>Ativa</option>
              <option>Inativa</option>
            </select>
            <select
              aria-label="Filtrar família"
              value={filterFamily}
              onChange={(e) => setFilterFamily(e.target.value)}
            >
              <option value="all">Todas as famílias</option>
              {d.families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar área"
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
            >
              <option value="all">Todas as áreas</option>
              {healthTerritory.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="pr-list">
            {visiblePeople.map((p) => (
              <article key={p.id} className="pr-person-row">
                <div>
                  <b>{p.fullName}</b>
                  <small>
                    {p.id} · {p.status} ·{" "}
                    {d.families.find(
                      (f) => f.id === activeFamily(p.id)?.familyId,
                    )?.name || "Sem família ativa"}{" "}
                    ·{" "}
                    {addressForHousehold(
                      d.households.find(
                        (h) => h.id === activeResidence(p.id)?.householdId,
                      ),
                    )?.neighborhood || "Sem domicílio ativo"}
                  </small>
                </div>
                <button onClick={() => goPerson(p.id)}>
                  <Pencil size={15} /> Abrir detalhe / editar
                </button>
              </article>
            ))}
            {!visiblePeople.length && (
              <p className="pr-empty">
                Nenhuma pessoa encontrada. Ajuste a busca ou cadastre uma nova
                amostra fictícia.
              </p>
            )}
          </div>
        </>
      )}
      {screen === "person" && (
        <>
          <div className="pr-toolbar">
            <button className="pr-back" onClick={back}>
              <ArrowLeft size={16} /> Voltar para pessoas
            </button>
            <h3>{selected ? "Cadastro e detalhe da pessoa" : "Nova pessoa"}</h3>
          </div>
          <form className="pr-card pr-form" onSubmit={savePerson}>
            <label>
              Nome completo *
              <input
                value={draft.fullName || ""}
                onChange={(e) => {
                  setConfirmed(false);
                  setDraft({ ...draft, fullName: e.target.value });
                }}
              />
            </label>
            <label>
              Nome preferido
              <input
                value={draft.preferredName || ""}
                onChange={(e) =>
                  setDraft({ ...draft, preferredName: e.target.value })
                }
              />
            </label>
            <label>
              Data de nascimento *
              <input
                type="date"
                value={draft.birthDate || ""}
                onChange={(e) => {
                  setConfirmed(false);
                  setDraft({ ...draft, birthDate: e.target.value });
                }}
              />
            </label>
            <label>
              Telefone demonstrativo
              <input
                value={
                  draft.contacts?.find((x) => x.type === "telefone")?.value ||
                  ""
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    contacts: [
                      ...(draft.contacts || []).filter(
                        (x) => x.type !== "telefone",
                      ),
                      { type: "telefone", value: e.target.value },
                    ],
                  })
                }
              />
            </label>
            <label>
              E-mail demonstrativo
              <input
                type="email"
                value={
                  draft.contacts?.find((x) => x.type === "e-mail")?.value || ""
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    contacts: [
                      ...(draft.contacts || []).filter(
                        (x) => x.type !== "e-mail",
                      ),
                      { type: "e-mail", value: e.target.value },
                    ],
                  })
                }
              />
            </label>
            <label>
              Identificador sintético
              <select
                value={draft.identifiers?.[0]?.type || "CPF"}
                onChange={(e) => {
                  setConfirmed(false);
                  setDraft({
                    ...draft,
                    identifiers: [
                      {
                        type: e.target.value as "CPF" | "CNS",
                        value: draft.identifiers?.[0]?.value || "",
                      },
                    ],
                  });
                }}
              >
                <option>CPF</option>
                <option>CNS</option>
              </select>
              <input
                placeholder="CPF-DEMO-... ou CNS-DEMO-..."
                value={draft.identifiers?.[0]?.value || ""}
                onChange={(e) => {
                  setConfirmed(false);
                  setDraft({
                    ...draft,
                    identifiers: [
                      {
                        type: draft.identifiers?.[0]?.type || "CPF",
                        value: e.target.value,
                      },
                    ],
                  });
                }}
              />
            </label>
            <label className="wide">
              Observações
              <textarea
                value={draft.notes || ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            {candidates.length > 0 && (
              <div className="pr-duplicate wide">
                <b>Possíveis correspondências</b>
                <p>
                  {selected
                    ? "Esta edição não altera nem funde outros cadastros."
                    : "Confira os candidatos antes de salvar; nenhum cadastro será fundido automaticamente."}
                </p>
                {candidates.map((c) => (
                  <div key={c.id}>
                    {c.id} · {c.fullName} · {c.birthDate}
                  </div>
                ))}
                {!selected && (
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{" "}
                    Conferi os candidatos e quero criar cadastro separado.
                  </label>
                )}
              </div>
            )}
            {selected && person && (
              <div className="pr-history wide">
                <h4>Vínculos e histórico</h4>
                <p>
                  Identificadores:{" "}
                  {person.identifiers
                    .map((i) => `${i.type}: ${i.value}`)
                    .join(" · ") || "não informados"}
                  ; contatos:{" "}
                  {person.contacts.map((c) => c.value).join(" · ") ||
                    "não informados"}
                </p>
                <h4>Famílias atuais e encerradas</h4>
                {d.familyMemberships
                  .filter((m) => m.personId === person.id)
                  .map((m) => (
                    <p key={m.id}>
                      {d.families.find((f) => f.id === m.familyId)?.name} ·{" "}
                      {m.relationship} · {m.startDate} a {m.endDate || "atual"}
                    </p>
                  ))}
                <h4>Residências atuais e encerradas</h4>
                {d.residenceLinks
                  .filter((m) => m.personId === person.id)
                  .map((m) => (
                    <p key={m.id}>
                      {d.households.find((h) => h.id === m.householdId)?.id} ·{" "}
                      {m.startDate} a {m.endDate || "atual"}
                    </p>
                  ))}
                <h4>Histórico</h4>
                {person.history.map((h, i) => (
                  <p key={i}>
                    {h.date} · {h.action} — {h.detail}
                  </p>
                ))}
              </div>
            )}
            <div className="pr-form-actions wide">
              <button type="button" className="pr-back" onClick={back}>
                Voltar
              </button>
              <button className="pr-primary">
                Salvar {selected ? "alterações" : "pessoa"}
              </button>
            </div>
          </form>
        </>
      )}
      {screen === "families" && (
        <>
          <div className="pr-toolbar">
            <button className="pr-back" onClick={back}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3>Famílias demonstrativas</h3>
            <button
              className="pr-primary"
              type="button"
              onClick={() => openFamilyForm()}
            >
              <Plus size={16} /> Nova família
            </button>
          </div>
          {familyFormOpen && (
            <form className="pr-card pr-form" onSubmit={saveFamily}>
              <h3 className="wide">
                {familyEditingId ? "Editar família" : "Cadastrar família"}
              </h3>
              <label>
                Nome da família *
                <input
                  required
                  value={familyNameDraft}
                  onChange={(e) => setFamilyNameDraft(e.target.value)}
                />
              </label>
              <label>
                Pessoa de referência *
                <select
                  required
                  value={familyReferenceDraft}
                  onChange={(e) => setFamilyReferenceDraft(e.target.value)}
                >
                  <option value="">Selecione uma pessoa</option>
                  {d.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Situação
                <select
                  value={familyStatusDraft}
                  onChange={(e) =>
                    setFamilyStatusDraft(e.target.value as "Ativa" | "Inativa")
                  }
                >
                  <option value="Ativa">Ativa</option>
                  <option value="Inativa">Inativa</option>
                </select>
              </label>
              <div className="pr-form-actions wide">
                <button
                  type="button"
                  className="pr-back"
                  onClick={() => {
                    setFamilyFormOpen(false);
                    setFamilyEditingId("");
                    setError("");
                  }}
                >
                  Cancelar
                </button>
                <button className="pr-primary">
                  {familyEditingId ? "Salvar alterações" : "Cadastrar família"}
                </button>
              </div>
            </form>
          )}
          <div className="pr-family-grid">
            {d.families.length ? (
              d.families.map((f) => (
                <article className="pr-card" key={f.id}>
                  <h3>{f.name}</h3>
                  <button
                    type="button"
                    className="pr-back"
                    onClick={() => openFamilyForm(f)}
                  >
                    <Pencil size={15} /> Editar família
                  </button>
                  <p>
                    {f.id} · {f.status} · referência:{" "}
                    {d.people.find((p) => p.id === f.referencePersonId)
                      ?.fullName || "não definida"}
                  </p>
                  {d.familyMemberships
                    .filter((m) => m.familyId === f.id)
                    .map((m) => (
                      <div className="pr-member" key={m.id}>
                        <span>
                          {d.people.find((p) => p.id === m.personId)
                            ?.fullName || "Pessoa"}{" "}
                          · {m.relationship} · {m.startDate}–
                          {m.endDate || "atual"}
                        </span>
                        {!m.endDate && (
                          <button
                            type="button"
                            onClick={() => endMembership(m)}
                          >
                            Encerrar vínculo
                          </button>
                        )}
                      </div>
                    ))}
                  <label>
                    Relação familiar
                    <select
                      value={memberRelationships[f.id] || "Membro"}
                      onChange={(e) =>
                        setMemberRelationships((current) => ({
                          ...current,
                          [f.id]: e.target.value,
                        }))
                      }
                    >
                      <option>Membro</option>
                      <option>Pessoa de referência</option>
                      <option>Cônjuge/companheiro(a)</option>
                      <option>Filho(a)</option>
                      <option>Pai/mãe</option>
                      <option>Outro familiar</option>
                    </select>
                  </label>
                  <label>
                    Adicionar pessoa
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value)
                          addMember(
                            f.id,
                            e.target.value,
                            memberRelationships[f.id] || "Membro",
                          );
                        e.target.value = "";
                      }}
                    >
                      <option value="">Selecionar pessoa…</option>
                      {d.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))
            ) : (
              <p className="pr-empty wide">
                Ainda não há famílias cadastradas. Use “Nova família” para
                adicionar uma família fictícia à demonstração.
              </p>
            )}
          </div>
        </>
      )}
      {screen === "homes" && (
        <>
          <div className="pr-toolbar">
            <button className="pr-back" onClick={back}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3>
              {home
                ? `Detalhe do domicílio · ${home.id}`
                : "Domicílios e endereços"}
            </h3>
            {!home && (
              <button
                type="button"
                className="pr-primary"
                onClick={() => {
                  setHomeId("new");
                  setAddressSelection("new");
                }}
              >
                <Plus size={16} /> Novo domicílio
              </button>
            )}
          </div>
          {homeId === "new" || home ? (
            <form
              key={`${homeId}-${addressSelection}`}
              className="pr-card pr-form"
              onSubmit={updateHome}
            >
              <h4 className="wide">Endereço compartilhável</h4>
              <label className="wide">
                Endereço relacionado
                <select
                  name="addressId"
                  value={addressSelection}
                  onChange={(e) => setAddressSelection(e.target.value)}
                >
                  <option value="new">Cadastrar novo endereço</option>
                  {d.addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.id} · {address.street}, {address.number} ·{" "}
                      {address.neighborhood}
                    </option>
                  ))}
                </select>
              </label>
              <p className="wide">
                Um endereço pode ser relacionado a mais de um domicílio. Ao
                selecionar um endereço existente, seus campos abaixo não serão
                alterados; a unidade domiciliar continua sendo um cadastro
                separado.
              </p>
              {(
                [
                  ["street", "Logradouro"],
                  ["number", "Número"],
                  ["neighborhood", "Bairro"],
                  ["locality", "Localidade"],
                  ["postalCode", "CEP fictício"],
                ] as [keyof RegistryAddress, string][]
              ).map(([k, l]) => (
                <label key={k}>
                  {l}
                  <input
                    name={k}
                    disabled={reuseAddressInForm}
                    defaultValue={String(formAddress?.[k] || "")}
                  />
                </label>
              ))}
              <label>
                Complemento/unidade
                <input
                  name="complement"
                  defaultValue={home?.complement || ""}
                />
              </label>
              <label>
                Zona
                <select
                  name="zone"
                  disabled={reuseAddressInForm}
                  defaultValue={formAddress?.zone || "Urbana"}
                >
                  <option>Urbana</option>
                  <option>Rural</option>
                </select>
              </label>
              <label>
                Área de saúde
                <select
                  name="areaId"
                  defaultValue={
                    formAddress?.areaId || healthTerritory.areas[0]?.id
                  }
                  disabled={reuseAddressInForm}
                >
                  {healthTerritory.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <h4 className="wide">Características do domicílio</h4>
              {(
                [
                  ["occupationType", "Tipo de ocupação"],
                  ["waterSupply", "Abastecimento de água"],
                  ["sewage", "Esgoto"],
                  ["wasteCollection", "Coleta de resíduos"],
                  ["energy", "Energia"],
                ] as [keyof RegistryHousehold, string][]
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input name={key} defaultValue={String(home?.[key] || "")} />
                </label>
              ))}
              <button className="pr-primary wide">Salvar domicílio</button>
              {home && (
                <div className="wide">
                  <h4>Moradores (gestão interna)</h4>
                  {d.residenceLinks
                    .filter((x) => x.householdId === home.id)
                    .map((r) => (
                      <div className="pr-member" key={r.id}>
                        <span>
                          {d.people.find((p) => p.id === r.personId)?.fullName}{" "}
                          · {r.startDate}–{r.endDate || "atual"}
                        </span>
                        {!r.endDate && (
                          <button type="button" onClick={() => endResidence(r)}>
                            Encerrar residência
                          </button>
                        )}
                      </div>
                    ))}
                  <select
                    aria-label="Adicionar morador"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value)
                        moveResidence(e.target.value, home.id);
                      e.target.value = "";
                    }}
                  >
                    <option value="">
                      Vincular pessoa (encerra residência anterior)
                    </option>
                    {d.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </form>
          ) : (
            <div className="pr-list">
              {d.households.length ? (
                d.households.map((h) => {
                  const address = addressForHousehold(h);
                  return (
                    <article className="pr-person-row" key={h.id}>
                      <div>
                        <b>
                          {h.id} · {address?.street}, {address?.number}
                          {h.complement ? ` · ${h.complement}` : ""} ·{" "}
                          {address?.neighborhood}
                        </b>
                        <small>
                          {address?.locality} · {address?.zone} ·{" "}
                          {
                            healthTerritory.areas.find(
                              (a) => a.id === address?.areaId,
                            )?.name
                          }{" "}
                          · {h.status}
                        </small>
                        <small>
                          {address ? familiesAtAddress(address.id).length : 0}{" "}
                          famílias ativas compartilham este endereço
                        </small>
                      </div>
                      <button type="button" onClick={() => openHome(h.id)}>
                        <Pencil size={15} /> Detalhe / editar
                      </button>
                    </article>
                  );
                })
              ) : (
                <p className="pr-empty">
                  Ainda não há domicílios cadastrados. Use “Novo domicílio” para
                  adicionar um endereço e uma unidade residencial fictícios.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {screen === "map" && (
        <>
          <div className="pr-toolbar">
            <button className="pr-back" onClick={back}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h3>Mapa territorial demonstrativo</h3>
          </div>
          <div className="pr-map-controls">
            <label>
              Camada
              <select
                value={mapLayer}
                onChange={(e) =>
                  setMapLayer(e.target.value as "areas" | "homes")
                }
              >
                <option value="areas">Áreas</option>
                <option value="homes">Domicílios</option>
              </select>
            </label>
            <label>
              Filtrar área
              <select
                value={mapArea}
                onChange={(e) => {
                  setMapArea(e.target.value);
                  setHomeId("");
                }}
              >
                <option value="all">Todas as áreas</option>
                {healthTerritory.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setZoom((x) => Math.max(0.8, x - 0.15))}>
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((x) => Math.min(1.6, x + 0.15))}>
              +
            </button>
          </div>
          <div className="pr-map-layout">
            <div className="pr-map">
              <svg
                viewBox={`${(1000 - 1000 / zoom) / 2} ${(640 - 640 / zoom) / 2} ${1000 / zoom} ${640 / zoom}`}
                role="group"
                aria-label="Mapa esquemático fictício"
              >
                <rect width="1000" height="640" fill="#edf3ef" />
                {healthTerritory.areas
                  .filter((a) => mapArea === "all" || a.id === mapArea)
                  .map((a) => (
                    <g
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setMapArea(a.id);
                        setHomeId("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setMapArea(a.id);
                          setHomeId("");
                        }
                      }}
                    >
                      <polygon
                        points={mapRegionPolygons[a.region as MapRegion]}
                        fill={a.color}
                        fillOpacity=".32"
                        stroke={a.color}
                        strokeWidth={mapArea === a.id ? 5 : 3}
                        strokeDasharray="8 5"
                      />
                      <text
                        x={mapRegionCenters[a.region as MapRegion].x}
                        y={mapRegionCenters[a.region as MapRegion].y}
                        textAnchor="middle"
                      >
                        {a.code} · {a.name}
                      </text>
                    </g>
                  ))}
                {mapLayer === "homes" &&
                  d.households
                    .filter((h) => {
                      const address = addressForHousehold(h);
                      return mapArea === "all" || address?.areaId === mapArea;
                    })
                    .map((h) => {
                      const address = addressForHousehold(h);
                      const a = healthTerritory.areas.find(
                          (x) => x.id === address?.areaId,
                        ),
                        c = mapRegionCenters[a?.region || "centro"],
                        peers = d.households.filter(
                          (x) =>
                            addressForHousehold(x)?.areaId === address?.areaId,
                        ),
                        n = peers.findIndex((x) => x.id === h.id);
                      return (
                        <g
                          key={h.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Domicílio ${h.id}, ${address?.neighborhood || "localidade não informada"}`}
                          transform={`translate(${c.x + (n - peers.length / 2) * 30} ${c.y + 30})`}
                          onClick={() => setHomeId(h.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ")
                              setHomeId(h.id);
                          }}
                        >
                          <circle
                            r="12"
                            fill="#205783"
                            stroke="white"
                            strokeWidth="3"
                          />
                          <text y="28" textAnchor="middle">
                            {h.id}
                          </text>
                        </g>
                      );
                    })}
              </svg>
            </div>
            <aside className="pr-card">
              <h3>
                {home
                  ? home.id
                  : healthTerritory.areas.find((a) => a.id === mapArea)?.name ||
                    "Todas as áreas"}
              </h3>
              {home ? (
                <>
                  <p>
                    {homeAddress?.street}, {homeAddress?.number}
                    {home.complement ? ` · ${home.complement}` : ""} ·{" "}
                    {homeAddress?.neighborhood}, {homeAddress?.locality}
                  </p>
                  <p>
                    Moradores ativos:{" "}
                    {
                      d.residenceLinks.filter(
                        (r) => r.householdId === home.id && !r.endDate,
                      ).length
                    }{" "}
                    · famílias ativas neste endereço:{" "}
                    {homeAddress ? familiesAtAddress(homeAddress.id).length : 0}
                  </p>
                  <button
                    type="button"
                    className="pr-primary"
                    onClick={() => openHome(home.id)}
                  >
                    Abrir detalhe do domicílio
                  </button>
                </>
              ) : (
                <p>
                  Selecione área ou marcador. Somente código,
                  endereço/localidade e contagens agregadas serão exibidos;
                  nomes, contatos e identificadores de moradores ficam ocultos
                  neste mapa.
                </p>
              )}
              <button
                type="button"
                className="pr-back"
                onClick={() => {
                  setHomeId("");
                  setMapArea("all");
                }}
              >
                Limpar seleção
              </button>
            </aside>
          </div>
          <p className="pr-footnote">
            Geometria fictícia reutilizada do mapa de saúde; não cartografia
            oficial. Domicílios agregados e contagens desta amostra não são
            dados censitários.
          </p>
        </>
      )}
    </section>
  );
}
