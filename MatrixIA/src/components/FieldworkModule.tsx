import { useState } from "react";
import { Check, ChevronRight, ClipboardList, Home, MapPinned, Search, UserRound, X } from "lucide-react";
import type { HealthOperatorPersona } from "./HealthVisitsAttendanceModule";
import type { PeopleRegistryDataset, RegistryHistoryEvent } from "../data/peopleRegistry";
import { fieldworkStatusLabels, fieldworkZones, type FieldworkDataset, type FieldworkLot, type FieldworkVisitOutcome } from "../data/fieldwork";
import type { SharedQuestionnairesDataset } from "../data/sharedQuestionnaires";
import "./FieldworkModule.css";

type Props = {
  dataset: FieldworkDataset;
  questionnaires: SharedQuestionnairesDataset;
  peopleRegistry: PeopleRegistryDataset;
  personaId: HealthOperatorPersona | "secretary";
  onChange: (update: (current: FieldworkDataset) => FieldworkDataset) => void;
  onQuestionnairesChange: (update: (current: SharedQuestionnairesDataset) => SharedQuestionnairesDataset) => void;
  onPeopleRegistryChange: (update: (current: PeopleRegistryDataset) => PeopleRegistryDataset) => void;
  onBack?: () => void;
};

type Step = "lot" | "household" | "family" | "person" | "questionnaire" | "visit";
const today = () => new Date().toISOString().slice(0, 10);
const event = (action: string, detail: string): RegistryHistoryEvent => ({ date: today(), action, detail });

export default function FieldworkModule({ dataset, questionnaires, peopleRegistry, personaId, onChange, onQuestionnairesChange, onPeopleRegistryChange, onBack }: Props) {
  const [zoneId, setZoneId] = useState(() => personaId === "acs" ? "SIM-ZONA-001" : "all");
  const [selectedLotId, setSelectedLotId] = useState(dataset.lots[0]?.id ?? "");
  const [step, setStep] = useState<Step>("lot");
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [personId, setPersonId] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [questionnaireId, setQuestionnaireId] = useState(questionnaires.questionnaires.find((q) => q.status === "Ativo")?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [water, setWater] = useState("Rede pública");
  const [visitOutcome, setVisitOutcome] = useState<FieldworkVisitOutcome>("completed");
  const [visitNote, setVisitNote] = useState("");
  const [toast, setToast] = useState("");

  const visibleZones = personaId === "acs" ? fieldworkZones.filter((zone) => zone.acsProfessionalId === "SIM-PRO-003") : fieldworkZones;
  const visibleZoneIds = new Set(visibleZones.map((zone) => zone.id));
  const visibleLots = dataset.lots.filter((lot) => visibleZoneIds.has(lot.zoneId) && (zoneId === "all" || lot.zoneId === zoneId));
  const selectedLot = dataset.lots.find((lot) => lot.id === selectedLotId) ?? visibleLots[0];
  const zone = fieldworkZones.find((item) => item.id === selectedLot?.zoneId);
  const activeQuestionnaire = questionnaires.questionnaires.find((q) => q.id === questionnaireId) ?? questionnaires.questionnaires[0];
  const household = peopleRegistry.households.find((item) => item.id === selectedLot?.householdId);
  const address = household ? peopleRegistry.addresses.find((item) => item.id === household.addressId) : undefined;
  const peopleAtHousehold = household ? peopleRegistry.residenceLinks.filter((link) => link.householdId === household.id).map((link) => peopleRegistry.people.find((person) => person.id === link.personId)).filter(Boolean) : [];
  const filteredPeople = peopleRegistry.people.filter((person) => `${person.fullName} ${person.identifiers.map((item) => item.value).join(" ")}`.toLowerCase().includes(search.toLowerCase())).slice(0, 5);
  const pendingLots = visibleLots.filter((lot) => lot.status === "pending" || lot.status === "no-contact").length;
  const drafts = questionnaires.responses.filter((response) => response.status === "Rascunho").length;

  const selectLot = (lot: FieldworkLot) => { setSelectedLotId(lot.id); setStep("lot"); setJourneyOpen(false); setPersonId(""); setFamilyId(""); };
  const startJourney = () => { if (!selectedLot) return; setJourneyOpen(true); setStep(selectedLot.householdId ? "family" : "household"); setAnswers({}); setToast(""); };
  const closeJourney = () => { setJourneyOpen(false); setStep("lot"); };
  const advanceHousehold = () => {
    if (!selectedLot) return;
    let householdId = selectedLot.householdId;
    if (!householdId) {
      const addressId = peopleRegistry.addresses.find((item) => item.street === selectedLot.street && item.number === selectedLot.number)?.id ?? `SIM-END-CAMPO-${String(peopleRegistry.addresses.length + 1).padStart(3, "0")}`;
      onPeopleRegistryChange((current) => ({
        ...current,
        addresses: current.addresses.some((item) => item.id === addressId) ? current.addresses : [...current.addresses, { id: addressId, street: selectedLot.street, number: selectedLot.number, neighborhood: selectedLot.neighborhood, locality: "Vila das Palmeiras", postalCode: "00000-099", zone: selectedLot.block === "Rural" ? "Rural" : "Urbana", areaId: fieldworkZones.find((item) => item.id === selectedLot.zoneId)?.areaId ?? "SIM-AREA-001", history: [event("Endereço criado na jornada", "Referência territorial criada a partir do lote")] }],
        households: [...current.households, { id: `SIM-DOM-CAMPO-${String(current.households.length + 1).padStart(3, "0")}`, addressId, complement: "", occupationType: "A confirmar", waterSupply: water, sewage: "A confirmar", wasteCollection: "A confirmar", energy: "A confirmar", status: "Ativo", history: [event("Domicílio criado na jornada", "Cadastro guiado iniciado no mapa")] }],
      }));
      householdId = `SIM-DOM-CAMPO-${String(peopleRegistry.households.length + 1).padStart(3, "0")}`;
      onChange((current) => ({ ...current, lots: current.lots.map((lot) => lot.id === selectedLot.id ? { ...lot, householdId, status: "in-progress" } : lot) }));
    }
    setStep("family");
  };
  const saveResponseAndVisit = () => {
    if (!selectedLot || !activeQuestionnaire) return;
    const responseId = `SIM-RESP-CAMPO-${String(questionnaires.responses.length + 1).padStart(3, "0")}`;
    const visitId = `SIM-VIS-CAMPO-${String(dataset.visits.length + 1).padStart(3, "0")}`;
    const status = visitOutcome === "completed" ? "Enviado" : "Rascunho" as const;
    onQuestionnairesChange((current) => ({ ...current, responses: [{ id: responseId, questionnaireId: activeQuestionnaire.id, lotId: selectedLot.id, householdId: selectedLot.householdId, visitId, personId: personId || undefined, status, answers, updatedAt: new Date().toISOString() }, ...current.responses] }));
    onChange((current) => ({ ...current, lots: current.lots.map((lot) => lot.id === selectedLot.id ? { ...lot, status: visitOutcome === "completed" ? "complete" : visitOutcome === "no-contact" ? "no-contact" : "pending" } : lot), visits: [{ id: visitId, lotId: selectedLot.id, householdId: selectedLot.householdId, familyId: familyId || undefined, personId: personId || undefined, professionalId: personaId === "acs" ? "SIM-PRO-003" : "SIM-PRO-005", date: today(), outcome: visitOutcome, note: visitNote || "Registro de visita demonstrativo.", questionnaireResponseId: responseId }, ...current.visits] }));
    setToast(visitOutcome === "completed" ? "Visita e questionário registrados nesta sessão." : "Registro salvo como pendência/rascunho.");
    setStep("lot"); setJourneyOpen(false);
  };

  return <section className="fieldwork-module">
    <div className="fieldwork-kicker"><span><MapPinned size={14} /> CAMPO TERRITORIAL · JORNADA GUIADA</span><b>DEMONSTRAÇÃO FICTÍCIA</b></div>
    <div className="fieldwork-heading"><div><h2>Mapa de campo e cadastro por lote</h2><p>Comece pelo território. O ACS vê automaticamente somente a microárea vinculada ao seu perfil demonstrativo.</p></div>{onBack && <button className="fieldwork-link" onClick={onBack}><X size={15} /> Fechar módulo</button>}</div>
    <div className="fieldwork-metrics"><div><strong>{visibleLots.length}</strong><span>lotes na minha visão</span></div><div><strong>{visibleLots.filter((lot) => lot.householdId).length}</strong><span>com domicílio referenciado</span></div><div><strong>{pendingLots}</strong><span>pendências de campo</span></div><div><strong>{drafts}</strong><span>rascunhos de questionário</span></div></div>
    <div className="fieldwork-toolbar"><label>Zona / microárea<select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={personaId === "acs"}><option value="all">Todas as minhas áreas</option>{visibleZones.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.code}</option>)}</select></label><div className="fieldwork-legend">{visibleZones.map((item) => <span key={item.id}><i style={{ background: item.color }} />{item.code}</span>)}</div></div>
    <div className="fieldwork-layout"><div className="fieldwork-map" aria-label="Mapa fictício de lotes"><div className="fieldwork-map-grid" />{visibleLots.map((lot) => <button className={`fieldwork-lot ${lot.id === selectedLot?.id ? "selected" : ""} status-${lot.status}`} style={{ left: `${lot.x}%`, top: `${lot.y}%` }} key={lot.id} onClick={() => selectLot(lot)} title={`${lot.label} · ${fieldworkStatusLabels[lot.status]}`}><span>{lot.label.replace("Lote ", "")}</span></button>)}<div className="fieldwork-map-label fieldwork-map-label-a">Centro / quadra A</div><div className="fieldwork-map-label fieldwork-map-label-b">Jardim do Norte</div><div className="fieldwork-map-label fieldwork-map-label-c">Zona rural</div></div>
      <aside className="fieldwork-dossier">{selectedLot ? <><div className="fieldwork-dossier-top"><span className={`fieldwork-status status-${selectedLot.status}`}>{fieldworkStatusLabels[selectedLot.status]}</span><small>{zone?.code} · {zone?.name}</small></div><h3>{selectedLot.label}</h3><p className="fieldwork-address"><Home size={15} /> {selectedLot.street}, {selectedLot.number}<br /><span>{selectedLot.neighborhood} · quadra {selectedLot.block}</span></p><div className="fieldwork-dossier-note">{selectedLot.note}</div>{household && <div className="fieldwork-linked"><strong>Domicílio referenciado</strong><span>{address?.street}, {address?.number} {household.complement}</span><small>{peopleAtHousehold.length} pessoa(s) com residência vinculada</small></div>}<button className="fieldwork-primary" onClick={startJourney}><ChevronRight size={17} /> {selectedLot.householdId ? "Continuar jornada" : "Cadastrar este domicílio"}</button><div className="fieldwork-dossier-actions"><button onClick={() => { setJourneyOpen(true); setStep("questionnaire"); }}><ClipboardList size={15} /> Aplicar questionário</button><button onClick={() => { setJourneyOpen(true); setStep("visit"); }}><Check size={15} /> Registrar visita</button></div></> : <p>Selecione um lote no mapa.</p>}</aside></div>
    <div className="fieldwork-bottom-grid"><div><div className="fieldwork-section-title"><span>PENDÊNCIAS E RASCUNHOS</span><strong>{pendingLots + drafts} itens para revisar</strong></div>{visibleLots.filter((lot) => lot.status === "pending" || lot.status === "no-contact").map((lot) => <button className="fieldwork-pending-row" key={lot.id} onClick={() => selectLot(lot)}><span className={`fieldwork-dot status-${lot.status}`} /><b>{lot.label}</b><span>{fieldworkStatusLabels[lot.status]}</span><ChevronRight size={14} /></button>)}{drafts > 0 && <div className="fieldwork-draft-hint">Há {drafts} resposta(s) em rascunho no catálogo compartilhado.</div>}</div><div><div className="fieldwork-section-title"><span>REFERÊNCIAS COMPARTILHADAS</span><strong>sem duplicar cadastros</strong></div><p className="fieldwork-helper">A jornada aponta para pessoas, famílias, endereços e domicílios já existentes. Quando não existe referência, o cadastro guiado cria o registro mínimo no Cadastro Geral da sessão.</p></div></div>
    {toast && <div className="fieldwork-toast" role="status"><Check size={15} /> {toast}</div>}
    {journeyOpen && selectedLot && <div className="fieldwork-journey"><div className="fieldwork-journey-card"><header><div><span>JORNADA DO LOTE · {selectedLot.label}</span><h3>{step === "household" ? "1. Confirmar domicílio" : step === "family" ? "2. Vincular família" : step === "person" ? "3. Buscar pessoa existente" : step === "questionnaire" ? "4. Aplicar questionário" : step === "visit" ? "5. Registrar visita" : "Jornada concluída"}</h3></div><button onClick={closeJourney}><X size={18} /></button></header><div className="fieldwork-progress">{["household", "family", "person", "questionnaire", "visit"].map((item, index) => <i key={item} className={(["household", "family", "person", "questionnaire", "visit"].indexOf(step) >= index) ? "active" : ""} />)}</div>{step === "household" && <div className="fieldwork-form-step"><p>Este lote ainda não possui domicílio referenciado. Confirme os dados mínimos para criar a unidade domiciliar sem duplicar o endereço.</p><label>Abastecimento de água<select value={water} onChange={(e) => setWater(e.target.value)}><option>Rede pública</option><option>Poço ou nascente</option><option>Outra forma</option><option>Não informado</option></select></label><div className="fieldwork-readonly"><Home size={16} /> {selectedLot.street}, {selectedLot.number} · {selectedLot.neighborhood}</div><button className="fieldwork-primary" onClick={advanceHousehold}>Salvar e continuar <ChevronRight size={16} /></button></div>}{step === "family" && <div className="fieldwork-form-step"><p>Escolha uma família já cadastrada para preservar o vínculo canônico.</p><select value={familyId} onChange={(e) => setFamilyId(e.target.value)}><option value="">Selecionar família (opcional)</option>{peopleRegistry.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select><button className="fieldwork-primary" onClick={() => setStep("person")}>Continuar para pessoa <ChevronRight size={16} /></button></div>}{step === "person" && <div className="fieldwork-form-step"><p>Busque uma pessoa existente por nome ou identificador. Nenhum novo cadastro é criado nesta etapa.</p><div className="fieldwork-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou CPF/CNS" /></div><div className="fieldwork-person-results">{filteredPeople.map((person) => <button className={person.id === personId ? "chosen" : ""} key={person.id} onClick={() => setPersonId(person.id)}><UserRound size={16} /><span><b>{person.fullName}</b><small>{person.identifiers[0]?.type}: {person.identifiers[0]?.value}</small></span>{person.id === personId && <Check size={15} />}</button>)}</div><button className="fieldwork-primary" onClick={() => setStep("questionnaire")}>Continuar <ChevronRight size={16} /></button></div>}{step === "questionnaire" && <div className="fieldwork-form-step"><p>Questionário compartilhado · as respostas ficam ligadas ao lote, domicílio e visita.</p><select value={questionnaireId} onChange={(e) => setQuestionnaireId(e.target.value)}>{questionnaires.questionnaires.filter((q) => q.status === "Ativo").map((q) => <option value={q.id} key={q.id}>{q.title} · v{q.version}</option>)}</select>{activeQuestionnaire?.questions.map((question) => <label key={question.id}>{question.label}<select value={answers[question.id] ?? ""} onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))}><option value="">Selecionar resposta</option>{question.options?.map((option) => <option key={option}>{option}</option>)}</select></label>)}<button className="fieldwork-primary" onClick={() => setStep("visit")}>Continuar para visita <ChevronRight size={16} /></button></div>}{step === "visit" && <div className="fieldwork-form-step"><p>Feche a jornada registrando o fato de campo. Isso não substitui protocolos oficiais.</p><label>Resultado da visita<select value={visitOutcome} onChange={(e) => setVisitOutcome(e.target.value as FieldworkVisitOutcome)}><option value="completed">Contato realizado</option><option value="return-needed">Retorno necessário</option><option value="no-contact">Sem contato</option></select></label><label>Observação<textarea value={visitNote} onChange={(e) => setVisitNote(e.target.value)} rows={3} placeholder="Ex.: combinar nova visita em horário alternativo" /></label><button className="fieldwork-primary" onClick={saveResponseAndVisit}><Check size={16} /> Salvar visita e questionário</button></div>}</div></div>}
  </section>;
}
