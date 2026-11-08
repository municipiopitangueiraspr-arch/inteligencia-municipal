import { useMemo, useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, Download, Eye, FileSpreadsheet, FileText, Filter, Plus, RotateCcw, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Station } from "./FleetResources";
import { formatMunicipalDateTime, MUNICIPAL_TIME_ZONE } from "../lib/municipalTime";

const municipalCrest = `${import.meta.env.BASE_URL}assets/brasao-pref.png`;

type Fueling = {
  id: string;
  vehicle_id: string;
  fuel_type_id: string;
  performed_at: string;
  submitted_at: string;
  liters: number;
  total_amount: number;
  status: string;
  driver_id?: string | null;
  driver_name?: string | null;
  operational_status?: string | null;
  review_status?: string | null;
  entry_type?: string | null;
  late_entry_reason?: string | null;
  notes?: string | null;
  protocol_number?: string | null;
  unit_price?: number;
  station_receipt_number: string | null;
  vehicles?: { placa?: string; modelo?: string } | null;
  fuel_type?: { nome?: string } | null;
};
type VehicleOption = { id: string; placa: string; marca: string | null; modelo: string | null };
type FuelOption = { id: string; nome: string; sigla: string | null };
type DocumentOption = { fueling_id: string; document_status: string; due_at?: string | null; is_current: boolean };
type SortKey = "performed_at" | "vehicle" | "driver" | "fuel_type" | "liters" | "total_amount" | "status";
type SortDirection = "asc" | "desc";
type DateMode = "specific" | "period";
type Props = {
  station: Station;
  fuelings: Fueling[];
  vehicles: VehicleOption[];
  fuelTypes: FuelOption[];
  documents: DocumentOption[];
  receiptWindowHours: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onNew: () => void;
};

const statusLabels: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO_PELO_POSTO: "Enviado para conferência",
  PENDENTE_DE_COMPROVANTE: "Pendente de comprovante",
  PENDENTE_DE_CONFERENCIA: "Pendente de conferência",
  EM_ANALISE: "Em análise",
  COM_INCONSISTENCIA: "Com inconsistência",
  SOLICITADA_CORRECAO: "Correção solicitada",
  CORRIGIDO: "Corrigido",
  CONFERIDO: "Conferido",
  CANCELADO: "Cancelado",
  INCLUIDO_NO_FECHAMENTO: "Incluído no fechamento",
};
const statusTone = (status: string) => {
  if (["CONFERIDO", "INCLUIDO_NO_FECHAMENTO"].includes(status)) return "success";
  if (["PENDENTE_DE_COMPROVANTE", "PENDENTE_DE_CONFERENCIA", "COM_INCONSISTENCIA"].includes(status)) return "danger";
  if (["SOLICITADA_CORRECAO", "ENVIADO_PELO_POSTO", "EM_ANALISE", "CORRIGIDO", "RASCUNHO"].includes(status)) return "warning";
  if (status === "CANCELADO") return "neutral";
  return "info";
};
const operationalLabels: Record<string, string> = { REGISTRADO: "Registrado", AGUARDANDO_COMPLEMENTACAO: "Aguardando complemento", SINALIZADO: "Sinalizado", CANCELADO: "Cancelado", RASCUNHO: "Rascunho" };
const reviewLabels: Record<string, string> = { PENDENTE_DE_CONFERENCIA: "Pendente de conferência", COM_PENDENCIA: "Com pendência", CONTESTADO: "Contestação", REGULARIZADO: "Regularizado", CONFERIDO: "Conferido", ENCERRADO_NO_FECHAMENTO: "Encerrado no fechamento", EM_ANALISE: "Em análise" };
const dateTime = (value: string | Date) => formatMunicipalDateTime(value);
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const liters = (value: number) => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L`;
function documentStatusText(document: DocumentOption | undefined, deadline: number) {
  const status = document?.document_status?.toUpperCase();
  if (status === "ACEITO" || status === "CONFERIDO") return "Conferido";
  if (status === "REJEITADO") return "Rejeitado; substituição necessária";
  if (["ENVIADO", "EM_ANALISE", "AGUARDANDO_VERIFICACAO"].includes(status || "")) return "Enviado; aguardando verificação";
  if (["PENDENTE", "PENDENTE_DE_ENVIO"].includes(status || "")) return "Aguardando envio";
  if (document) return "Comprovante registrado; verificação pendente";
  return Date.now() > deadline ? "Prazo de envio vencido" : "Aguardando envio";
}
const localDay = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const municipalName = "Prefeitura Municipal de Pitangueiras–PR";
const filterStatuses = Object.entries(statusLabels);

function stationName(station: Station) {
  return station.nome_fantasia_snapshot || station.razao_social_snapshot || "Posto credenciado";
}
function stationAddress(station: Station) {
  return [station.endereco, station.cidade, station.uf].filter(Boolean).join(" · ") || "Não informado";
}
function slug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "posto";
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SupplierFuelingRecords({ station, fuelings, vehicles, fuelTypes, documents, receiptWindowHours, loading, loadingMore, hasMore, onLoadMore, onNew }: Props) {
  const [dateMode, setDateMode] = useState<DateMode>("specific");
  const [specificDate, setSpecificDate] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [fuelTypeId, setFuelTypeId] = useState("");
  const [status, setStatus] = useState("");
  const [operationalStatus, setOperationalStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);
  const [detail, setDetail] = useState<Fueling | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "performed_at", direction: "desc" });
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");

  const filteredFuelings = useMemo(() => {
    const result = fuelings.filter((item) => {
      const day = localDay(item.performed_at);
      if (dateMode === "specific" && specificDate && day !== specificDate) return false;
      if (dateMode === "period" && ((dateStart && day < dateStart) || (dateEnd && day > dateEnd))) return false;
      if (vehicleId && item.vehicle_id !== vehicleId) return false;
      if (driverId && item.driver_id !== driverId) return false;
      if (fuelTypeId && item.fuel_type_id !== fuelTypeId) return false;
      if (status && item.status !== status) return false;
      if (operationalStatus && item.operational_status !== operationalStatus) return false;
      if (reviewStatus && item.review_status !== reviewStatus) return false;
      const document = documents.find((entry) => entry.fueling_id === item.id && entry.is_current);
      const isPending = !["CONFERIDO", "INCLUIDO_NO_FECHAMENTO", "CANCELADO"].includes(item.status);
      const deadline = document?.due_at ? Date.parse(document.due_at) : Date.parse(item.performed_at) + receiptWindowHours * 60 * 60 * 1000;
      const isLate = item.entry_type === "POSTERIOR" || (!document || !["ACEITO", "CONFERIDO"].includes(document.document_status)) && deadline < Date.now();
      if (pendingOnly && !isPending) return false;
      if (lateOnly && !isLate) return false;
      const query = search.trim().toLocaleLowerCase("pt-BR");
      if (query && !`${item.protocol_number || ""} ${item.station_receipt_number || ""}`.toLocaleLowerCase("pt-BR").includes(query)) return false;
      return true;
    });
    result.sort((left, right) => {
      let comparison = 0;
      if (sort.key === "performed_at") comparison = new Date(left.performed_at).getTime() - new Date(right.performed_at).getTime();
      else if (sort.key === "vehicle") comparison = collator.compare(left.vehicles?.placa || "", right.vehicles?.placa || "");
      else if (sort.key === "driver") comparison = collator.compare(left.driver_name || "", right.driver_name || "");
      else if (sort.key === "fuel_type") comparison = collator.compare(left.fuel_type?.nome || "", right.fuel_type?.nome || "");
      else if (sort.key === "liters") comparison = Number(left.liters || 0) - Number(right.liters || 0);
      else if (sort.key === "total_amount") comparison = Number(left.total_amount || 0) - Number(right.total_amount || 0);
      else comparison = collator.compare(statusLabels[left.status] || left.status, statusLabels[right.status] || right.status);
      return sort.direction === "asc" ? comparison : -comparison;
    });
    return result;
  }, [fuelings, documents, receiptWindowHours, dateMode, specificDate, dateStart, dateEnd, vehicleId, driverId, fuelTypeId, status, operationalStatus, reviewStatus, pendingOnly, lateOnly, search, sort]);

  const activeFilterCount = Number(dateMode === "specific" ? Boolean(specificDate) : Boolean(dateStart || dateEnd)) + Number(Boolean(vehicleId)) + Number(Boolean(driverId)) + Number(Boolean(fuelTypeId)) + Number(Boolean(status)) + Number(Boolean(operationalStatus)) + Number(Boolean(reviewStatus)) + Number(pendingOnly) + Number(lateOnly) + Number(Boolean(search));
  const filterSummary = useMemo(() => {
    const values: string[] = [];
    if (dateMode === "specific" && specificDate) values.push(`Data: ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${specificDate}T12:00:00Z`))}`);
    if (dateMode === "period" && (dateStart || dateEnd)) values.push(`Período: ${dateStart ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${dateStart}T12:00:00Z`)) : "início"} a ${dateEnd ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${dateEnd}T12:00:00Z`)) : "hoje"}`);
    if (vehicleId) values.push(`Veículo: ${vehicles.find((item) => item.id === vehicleId)?.placa || "selecionado"}`);
    if (driverId) values.push(`Motorista: ${fuelings.find((item) => item.driver_id === driverId)?.driver_name || "selecionado"}`);
    if (fuelTypeId) values.push(`Combustível: ${fuelTypes.find((item) => item.id === fuelTypeId)?.nome || "selecionado"}`);
    if (status) values.push(`Situação: ${statusLabels[status] || status}`);
    if (operationalStatus) values.push(`Operação: ${operationalLabels[operationalStatus] || operationalStatus}`);
    if (reviewStatus) values.push(`Conferência: ${reviewLabels[reviewStatus] || reviewStatus}`);
    if (pendingOnly) values.push("Somente pendências");
    if (lateOnly) values.push("Somente atrasados/posteriores");
    if (search.trim()) values.push(`Protocolo/recibo: ${search.trim()}`);
    return values.length ? values.join(" | ") : "Sem filtros aplicados";
  }, [dateMode, specificDate, dateStart, dateEnd, vehicleId, driverId, fuelTypeId, status, operationalStatus, reviewStatus, pendingOnly, lateOnly, search, vehicles, fuelTypes, fuelings]);

  function resetFilters() {
    setDateMode("specific");
    setSpecificDate("");
    setDateStart("");
    setDateEnd("");
    setVehicleId("");
    setDriverId("");
    setFuelTypeId("");
    setStatus("");
    setOperationalStatus("");
    setReviewStatus("");
    setPendingOnly(false);
    setLateOnly(false);
    setSearch("");
  }
  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }
  function sortIcon(key: SortKey) {
    if (sort.key !== key) return <ArrowDownUp size={13} aria-hidden="true" />;
    return sort.direction === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />;
  }

  async function exportExcel() {
    setExporting("excel");
    setExportError("");
    try {
      const crestResponse = await fetch(municipalCrest);
      if (!crestResponse.ok) throw new Error("Brasão municipal indisponível");
      const crestBlob = await crestResponse.blob();
      const crestData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Não foi possível ler o brasão municipal"));
        reader.readAsDataURL(crestBlob);
      });
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = municipalName;
      workbook.subject = "Abastecimentos registrados pelo posto credenciado";
      workbook.title = `Abastecimentos — ${stationName(station)}`;
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("Abastecimentos", { views: [{ state: "frozen", ySplit: 12, topLeftCell: "A13", activeCell: "A13" }] });
      sheet.columns = [
        { width: 22 }, { width: 15 }, { width: 24 }, { width: 22 }, { width: 18 }, { width: 20 }, { width: 30 },
      ];
      sheet.mergeCells("A1:A3");
      sheet.mergeCells("B1:G1");
      sheet.getCell("B1").value = municipalName.toLocaleUpperCase("pt-BR");
      sheet.mergeCells("B2:G2");
      sheet.getCell("B2").value = "INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS";
      sheet.mergeCells("B3:G3");
      sheet.getCell("B3").value = "RELATÓRIO DE ABASTECIMENTOS DO POSTO";
      const crestImageId = workbook.addImage({ base64: crestData, extension: "png" });
      sheet.addImage(crestImageId, { tl: { col: 0.12, row: 0.12 }, ext: { width: 64, height: 64 } });
      sheet.mergeCells("A4:G4");
      sheet.getCell("A4").value = "IDENTIFICAÇÃO DO ESTABELECIMENTO CREDENCIADO";
      sheet.getCell("A5").value = "Nome fantasia";
      sheet.mergeCells("B5:C5");
      sheet.getCell("B5").value = stationName(station);
      sheet.getCell("D5").value = "CNPJ";
      sheet.mergeCells("E5:G5");
      sheet.getCell("E5").value = station.cnpj_snapshot || "Não informado";
      sheet.getCell("A6").value = "Razão social";
      sheet.mergeCells("B6:C6");
      sheet.getCell("B6").value = station.razao_social_snapshot || "Não informado";
      sheet.getCell("D6").value = "Representante";
      sheet.mergeCells("E6:G6");
      sheet.getCell("E6").value = station.representante_nome || "Não informado";
      sheet.getCell("A7").value = "Endereço";
      sheet.mergeCells("B7:C7");
      sheet.getCell("B7").value = stationAddress(station);
      sheet.getCell("D7").value = "Contato";
      sheet.mergeCells("E7:G7");
      sheet.getCell("E7").value = [station.representante_email, station.representante_telefone].filter(Boolean).join(" · ") || "Não informado";
      sheet.mergeCells("A9:G9");
      sheet.getCell("A9").value = "FILTROS APLICADOS";
      sheet.mergeCells("A10:G10");
      sheet.getCell("A10").value = filterSummary;
      sheet.addRow([]);
      const tableHeader = sheet.addRow(["Data e hora do abastecimento (America/Sao_Paulo)", "Placa", "Veículo", "Combustível", "Quantidade (L)", "Valor total (R$)", "Situação"]);
      tableHeader.height = 28;
      const tableHeaderRow = tableHeader.number;
      for (const item of filteredFuelings) {
        const row = sheet.addRow([
          dateTime(item.performed_at),
          item.vehicles?.placa || "Não informado",
          item.vehicles?.modelo || "Não informado",
          item.fuel_type?.nome || fuelTypes.find((fuel) => fuel.id === item.fuel_type_id)?.nome || "Não informado",
          Number(item.liters || 0),
          Number(item.total_amount || 0),
          statusLabels[item.status] || item.status,
        ]);
        row.getCell(5).numFmt = "#,##0.000";
        row.getCell(6).numFmt = '"R$" #,##0.00';
        row.eachCell((cell, column) => {
          cell.border = { bottom: { style: "hair", color: { argb: "FFDCE6EA" } } };
          if (row.number % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8FA" } };
          cell.alignment = { vertical: "middle", horizontal: [5, 6].includes(column) ? "right" : "left", wrapText: true };
        });
      }
      sheet.autoFilter = { from: { row: tableHeaderRow, column: 1 }, to: { row: tableHeaderRow, column: 7 } };
      sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${tableHeaderRow}:${tableHeaderRow}`, margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }, horizontalCentered: true };
      sheet.headerFooter.oddFooter = `&L${municipalName}&CFuso ${MUNICIPAL_TIME_ZONE}&RPágina &P de &N`;
      const footerRow = sheet.rowCount + 2;
      sheet.mergeCells(`A${footerRow}:G${footerRow}`);
      sheet.getCell(`A${footerRow}`).value = `Documento gerado em ${dateTime(new Date())} · Fuso ${MUNICIPAL_TIME_ZONE} · Portal do Posto · ${municipalName}.`;
      sheet.getCell(`A${footerRow}`).font = { name: "Aptos", size: 9, italic: true, color: { argb: "FF647985" } };
      sheet.getCell(`A${footerRow}`).alignment = { horizontal: "center" };
      sheet.getRow(1).height = 24;
      sheet.getRow(2).height = 18;
      sheet.getRow(3).height = 26;
      sheet.getRow(4).height = 21;
      sheet.getRow(9).height = 20;
      for (const rowNumber of [5, 6, 7, 10]) {
        sheet.getRow(rowNumber).height = 23;
        sheet.getRow(rowNumber).eachCell((cell) => {
          cell.font = { name: "Aptos", size: 10, color: { argb: "FF294757" } };
          cell.alignment = { vertical: "middle", wrapText: true };
          cell.border = { bottom: { style: "hair", color: { argb: "FFDCE6EA" } } };
        });
      }
      for (const address of ["B1", "B2", "B3", "A4", "A9"]) {
        const cell = sheet.getCell(address);
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Aptos", size: address === "B1" ? 15 : address === "B3" ? 13 : 10, bold: true, color: { argb: address === "B1" || address === "B3" ? "FFFFFFFF" : "FF21475B" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: address === "B1" || address === "B3" ? "FF0B3C59" : "FFEAF2F4" } };
      }
      sheet.getCell("B2").font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFAE8428" } };
      sheet.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8FA" } };
      sheet.getCell("A10").font = { name: "Aptos", size: 10, color: { argb: "FF294757" } };
      tableHeader.eachCell((cell) => {
        cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5873" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = { bottom: { style: "medium", color: { argb: "FFD5A74A" } } };
      });
      const buffer = await workbook.xlsx.writeBuffer();
      saveBlob(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `abastecimentos-${slug(stationName(station))}.xlsx`);
    } catch {
      setExportError("Não foi possível gerar o arquivo Excel. Tente novamente.");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    setExporting("pdf");
    setExportError("");
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const emblem = new Image();
      emblem.src = municipalCrest;
      await emblem.decode();
      const drawHeader = () => {
        doc.addImage(emblem, "PNG", 13, 8, 19, 19);
        doc.setTextColor(11, 41, 64);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("PREFEITURA MUNICIPAL DE PITANGUEIRAS–PR", 38, 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(83, 105, 116);
        doc.text("INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS", 38, 20);
        doc.setDrawColor(213, 167, 74);
        doc.setLineWidth(0.7);
        doc.line(13, 31, 284, 31);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(16, 53, 75);
        doc.text("RELATÓRIO DE ABASTECIMENTOS DO POSTO", 13, 39);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(91, 112, 123);
        doc.text(`Resultados: ${filteredFuelings.length} · Fuso ${MUNICIPAL_TIME_ZONE} · ${filterSummary}`, 13, 45, { maxWidth: 270 });
        doc.setFillColor(246, 249, 250);
        doc.setDrawColor(218, 230, 233);
        doc.roundedRect(13, 49, 271, 29, 2, 2, "FD");
        const field = (label: string, value: string, x: number, y: number, width: number) => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(139, 115, 49);
          doc.text(label.toLocaleUpperCase("pt-BR"), x, y);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(41, 71, 87);
          doc.text(doc.splitTextToSize(value || "Não informado", width).slice(0, 1), x, y + 4);
        };
        field("POSTO CREDENCIADO", stationName(station), 17, 56, 94);
        field("CNPJ", station.cnpj_snapshot || "Não informado", 118, 56, 54);
        field("REPRESENTANTE", station.representante_nome || "Não informado", 181, 56, 96);
        field("ENDEREÇO", station.endereco || "Não informado", 17, 69, 140);
        field("MUNICÍPIO / UF", [station.cidade, station.uf].filter(Boolean).join(" / ") || "Não informado", 163, 69, 54);
        field("CONTATO", [station.representante_email, station.representante_telefone].filter(Boolean).join(" · ") || "Não informado", 224, 69, 55);
      };
      autoTable(doc, {
        startY: 82,
        margin: { top: 82, bottom: 16, left: 13, right: 13 },
        head: [["Data e hora do abastecimento (America/Sao_Paulo)", "Placa", "Veículo", "Combustível", "Quantidade", "Valor total", "Situação"]],
        body: filteredFuelings.map((item) => [
          dateTime(item.performed_at),
          item.vehicles?.placa || "Não informado",
          item.vehicles?.modelo || "Não informado",
          item.fuel_type?.nome || fuelTypes.find((fuel) => fuel.id === item.fuel_type_id)?.nome || "Não informado",
          liters(item.liters),
          money(item.total_amount),
          statusLabels[item.status] || item.status,
        ]),
        styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.6, textColor: [41, 71, 87], lineColor: [224, 234, 237], lineWidth: 0.15, overflow: "linebreak" },
        headStyles: { fillColor: [11, 60, 89], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, lineColor: [213, 167, 74], lineWidth: 0.5 },
        alternateRowStyles: { fillColor: [245, 248, 250] },
        columnStyles: { 0: { cellWidth: 39 }, 1: { cellWidth: 23 }, 2: { cellWidth: 38 }, 3: { cellWidth: 38 }, 4: { cellWidth: 29, halign: "right" }, 5: { cellWidth: 31, halign: "right" }, 6: { cellWidth: "auto" } },
        didDrawPage: () => drawHeader(),
      });
      if (!filteredFuelings.length) {
        drawHeader();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(105, 125, 133);
        doc.text("Nenhum abastecimento corresponde aos filtros selecionados.", 13, 91);
      }
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(218, 230, 233);
        doc.setLineWidth(0.25);
        doc.line(13, 195, 284, 195);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(105, 125, 133);
        doc.text(`${municipalName} · Gerado em ${dateTime(new Date())} · Fuso ${MUNICIPAL_TIME_ZONE}`, 13, 200);
        doc.text(`Página ${page} de ${pages}`, 284, 200, { align: "right" });
      }
      doc.save(`abastecimentos-${slug(stationName(station))}.pdf`);
    } catch {
      setExportError("Não foi possível gerar o arquivo PDF. Tente novamente.");
    } finally {
      setExporting(null);
    }
  }

  const column = (key: SortKey, label: string) => (
    <th key={key} aria-sort={sort.key === key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
      <button type="button" className="supplier-sort-button" onClick={() => toggleSort(key)} title={`Ordenar por ${label}`}>
        <span>{label}</span>{sortIcon(key)}
      </button>
    </th>
  );

  return (
    <section className="supplier-records-section">
      <div className="supplier-page-heading supplier-records-heading">
        <div>
          <span>CONSULTA RESTRITA AO ESTABELECIMENTO</span>
          <h2>Meus abastecimentos</h2>
          <p>Somente registros deste posto · {fuelings.length.toLocaleString("pt-BR")} carregados.</p>
        </div>
        <div className="supplier-records-actions">
          <button className="supplier-secondary" type="button" onClick={() => void exportExcel()} disabled={loading || exporting !== null || filteredFuelings.length === 0}>
            <FileSpreadsheet size={15} />{exporting === "excel" ? "Gerando…" : "Excel"}
          </button>
          <button className="supplier-secondary" type="button" onClick={() => void exportPdf()} disabled={loading || exporting !== null || filteredFuelings.length === 0}>
            <FileText size={15} />{exporting === "pdf" ? "Gerando…" : "PDF"}
          </button>
          <button className="supplier-primary" type="button" onClick={onNew}><Plus size={15} /> Novo abastecimento</button>
        </div>
      </div>
      <div className="supplier-record-filters">
        <div className="supplier-record-filter-heading">
          <div><Filter size={15} /><strong>Filtros</strong><span>{filteredFuelings.length.toLocaleString("pt-BR")} resultado(s)</span></div>
          <button className="supplier-reset-filters" type="button" onClick={resetFilters} disabled={activeFilterCount === 0}><RotateCcw size={13} /> Limpar filtros</button>
        </div>
        <div className="supplier-record-filter-grid">
          <label className="supplier-date-filter">Data do abastecimento
            <select value={dateMode} onChange={(event) => setDateMode(event.target.value as DateMode)} aria-label="Tipo de filtro de data">
              <option value="specific">Data específica</option><option value="period">Período</option>
            </select>
            {dateMode === "specific" ? <input type="date" value={specificDate} onChange={(event) => setSpecificDate(event.target.value)} /> : <span className="supplier-date-range"><input aria-label="Data inicial" type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} /><span>até</span><input aria-label="Data final" type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} /></span>}
          </label>
          <label>Veículo
            <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Todos os veículos</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} — {[vehicle.marca, vehicle.modelo].filter(Boolean).join(" ")}</option>)}</select>
          </label>
          <label>Motorista
            <select value={driverId} onChange={(event) => setDriverId(event.target.value)}><option value="">Todos os motoristas</option>{Array.from(new Map(fuelings.filter((item) => item.driver_id && item.driver_name).map((item) => [item.driver_id, item.driver_name])).entries()).map(([id, name]) => <option key={id} value={id || ""}>{name}</option>)}</select>
          </label>
          <label>Tipo de combustível
            <select value={fuelTypeId} onChange={(event) => setFuelTypeId(event.target.value)}><option value="">Todos os combustíveis</option>{fuelTypes.map((fuel) => <option key={fuel.id} value={fuel.id}>{fuel.nome}{fuel.sigla ? ` (${fuel.sigla})` : ""}</option>)}</select>
          </label>
          <label>Situação geral
            <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todas as situações</option>{filterStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label>Situação operacional
            <select value={operationalStatus} onChange={(event) => setOperationalStatus(event.target.value)}><option value="">Todas as situações</option>{Object.entries(operationalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label>Conferência da Prefeitura
            <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}><option value="">Todas as situações</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label>Protocolo ou recibo<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite o número" /></label>
          <label className="supplier-record-check"><input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} /> Somente pendências</label>
          <label className="supplier-record-check"><input type="checkbox" checked={lateOnly} onChange={(event) => setLateOnly(event.target.checked)} /> Posteriores ou com prazo vencido</label>
        </div>
      </div>
      {exportError && <div className="supplier-message error" role="alert">{exportError}</div>}
      <div className="supplier-record-table-panel">
        {loading ? <div className="supplier-loading">Carregando abastecimentos deste posto…</div> : filteredFuelings.length ? (
          <div className="supplier-table-wrap">
            <table className="supplier-table supplier-record-table">
              <thead><tr>{column("performed_at", "Data do abastecimento")}{column("vehicle", "Veículo")}{column("driver", "Motorista")}{column("fuel_type", "Combustível")}{column("liters", "Quantidade")}{column("total_amount", "Valor total")}{column("status", "Situação")}<th>Detalhes</th></tr></thead>
              <tbody>{filteredFuelings.map((item) => (
                <tr key={item.id}>
                  <td><strong>{dateTime(item.performed_at)}</strong><small>Enviado em {dateTime(item.submitted_at)}</small></td>
                  <td><strong>{item.vehicles?.placa || "Não informado"}</strong><small>{item.vehicles?.modelo || "Veículo"}</small></td>
                  <td>{item.driver_name || "Não informado"}</td>
                  <td>{item.fuel_type?.nome || fuelTypes.find((fuel) => fuel.id === item.fuel_type_id)?.nome || "—"}</td>
                  <td>{liters(item.liters)}</td>
                  <td><strong>{money(item.total_amount)}</strong></td>
                  <td><span className={`supplier-status supplier-status-${statusTone(item.status)}`}><span className="supplier-status-dot" />{statusLabels[item.status] || item.status}</span><small>{reviewLabels[item.review_status || ""] || item.review_status || ""}</small></td>
                  <td><button type="button" className="supplier-secondary supplier-record-detail-button" onClick={() => setDetail(item)}><Eye size={13} /> Detalhes</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="supplier-empty"><Filter size={25} /><strong>{fuelings.length ? "Nenhum resultado para esses filtros" : "Nenhum abastecimento encontrado"}</strong><p>{fuelings.length ? "Limpe ou ajuste os filtros. Também é possível carregar mais registros do posto." : "Os abastecimentos enviados por este estabelecimento aparecerão aqui."}</p></div>
        )}
        {hasMore && !loading && <div className="supplier-load-more"><span>Exibindo {fuelings.length.toLocaleString("pt-BR")} registro(s) carregado(s) deste posto.</span><button className="supplier-secondary" type="button" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? "Carregando…" : "Carregar mais 100"}<Download size={14} /></button></div>}
      </div>
      {detail && <div className="supplier-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDetail(null); }}>
        <section className="supplier-review-dialog supplier-record-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="supplier-record-detail-title">
          <div className="supplier-review-heading"><span>REGISTRO DO SEU ESTABELECIMENTO</span><h3 id="supplier-record-detail-title">Detalhes do abastecimento</h3><p>Dados operacionais submetidos pelo posto e situação atual de conferência.</p></div>
          <dl className="supplier-review-summary">
            <div><dt>Protocolo</dt><dd>{detail.protocol_number || "Não informado"}</dd></div>
            <div><dt>Recibo do posto</dt><dd>{detail.station_receipt_number || "Não informado"}</dd></div>
            <div><dt>Data/hora efetiva</dt><dd>{dateTime(detail.performed_at)}</dd></div>
            <div><dt>Registrado em</dt><dd>{dateTime(detail.submitted_at)}</dd></div>
            <div><dt>Veículo</dt><dd>{detail.vehicles?.placa || "Não informado"} · {detail.vehicles?.modelo || ""}</dd></div>
            <div><dt>Motorista</dt><dd>{detail.driver_name || "Não informado"}</dd></div>
            <div><dt>Combustível</dt><dd>{detail.fuel_type?.nome || fuelTypes.find((fuel) => fuel.id === detail.fuel_type_id)?.nome || "Não informado"}</dd></div>
            <div><dt>Volume / preço unitário</dt><dd>{liters(detail.liters)} · {money(detail.unit_price || 0)}/L</dd></div>
            <div><dt>Valor total</dt><dd>{money(detail.total_amount)}</dd></div>
            <div><dt>Situação operacional</dt><dd>{operationalLabels[detail.operational_status || ""] || detail.operational_status || "Não informada"}</dd></div>
            <div><dt>Conferência da Prefeitura</dt><dd>{reviewLabels[detail.review_status || ""] || detail.review_status || "Não informada"}</dd></div>
            <div><dt>Prazo do comprovante</dt><dd>{(() => { const doc = documents.find((item) => item.fueling_id === detail.id && item.is_current); const deadline = doc?.due_at ? Date.parse(doc.due_at) : Date.parse(detail.performed_at) + receiptWindowHours * 60 * 60 * 1000; return documentStatusText(doc, deadline); })()}</dd></div>
            {detail.entry_type === "POSTERIOR" && <div className="supplier-wide"><dt>Justificativa do lançamento posterior</dt><dd>{detail.late_entry_reason || "Detalhe não disponibilizado nesta consulta."}</dd></div>}
            {detail.notes && <div className="supplier-wide"><dt>Observações enviadas pelo posto</dt><dd>{detail.notes}</dd></div>}
          </dl>
          <div className="supplier-review-actions"><button type="button" className="supplier-welcome-secondary" onClick={() => setDetail(null)}><X size={14} /> Fechar</button></div>
        </section>
      </div>}
    </section>
  );
}
