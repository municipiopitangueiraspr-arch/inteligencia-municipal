import type { Workbook } from 'exceljs'
import type jsPDF from 'jspdf'
import { formatMunicipalDateTime, MUNICIPAL_TIME_ZONE } from './municipalTime'

export const MUNICIPAL_REPORT_NAME = 'PREFEITURA MUNICIPAL DE PITANGUEIRAS – PR'
export const MUNICIPAL_REPORT_UNIT = 'INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS'
export const REPORT_TABLE_START_Y = 43

const crestUrl = `${import.meta.env.BASE_URL}assets/brasao-pref.png`

export async function loadMunicipalCrestDataUrl() {
  const response = await fetch(crestUrl)
  if (!response.ok) throw new Error('Brasão municipal indisponível.')
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não foi possível ler o brasão municipal.'))
    reader.readAsDataURL(blob)
  })
}

export function drawMunicipalPdfHeader(doc: jsPDF, title: string, crestDataUrl: string, contextLine = '') {
  doc.addImage(crestDataUrl, 'PNG', 13, 7, 16, 16)
  doc.setTextColor(11, 41, 64)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(MUNICIPAL_REPORT_NAME, 34, 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(91, 112, 123)
  doc.text(MUNICIPAL_REPORT_UNIT, 34, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(16, 53, 75)
  doc.text(title, 13, 29, { maxWidth: doc.internal.pageSize.getWidth() - 26 })
  if (contextLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(91, 112, 123)
    doc.text(doc.splitTextToSize(contextLine, doc.internal.pageSize.getWidth() - 26), 13, 34)
  }
  doc.setDrawColor(213, 167, 74)
  doc.setLineWidth(0.45)
  doc.line(13, 40, doc.internal.pageSize.getWidth() - 13, 40)
}

export function addMunicipalPdfFooters(doc: jsPDF) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    const pageHeight = doc.internal.pageSize.getHeight()
    const pageWidth = doc.internal.pageSize.getWidth()
    doc.setDrawColor(218, 230, 233)
    doc.setLineWidth(0.25)
    doc.line(13, pageHeight - 12, pageWidth - 13, pageHeight - 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(105, 125, 133)
    doc.text(`Gerado em ${formatMunicipalDateTime(new Date())} · Fuso ${MUNICIPAL_TIME_ZONE}`, 13, pageHeight - 7)
    doc.text(`Página ${page} de ${pages}`, pageWidth - 13, pageHeight - 7, { align: 'right' })
  }
}

function excelSafeValue(value: unknown) {
  if (typeof value === 'string' && /^\s*[=+\-@]/.test(value)) return `'${value}`
  return value as string | number | boolean | Date | null
}

export function addMunicipalExcelWorksheet(workbook: Workbook, crestDataUrl: string, options: {
  name: string
  title: string
  metadata: Array<[string, string]>
  headers: string[]
  rows: unknown[][]
  widths?: number[]
}) {
  const headers = options.headers.length ? options.headers : ['Informação']
  const columnCount = Math.max(3, headers.length)
  const lastColumn = columnName(columnCount)
  const worksheet = workbook.addWorksheet(options.name.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 8, topLeftCell: 'A9', activeCell: 'A9' }],
  })
  worksheet.columns = headers.map((header, index) => ({ width: options.widths?.[index] || Math.min(34, Math.max(16, header.length + 3)) }))
  if (headers.length === 1) worksheet.getColumn(2).width = 24
  worksheet.mergeCells(`A1:A3`)
  worksheet.mergeCells(`B1:${lastColumn}1`)
  worksheet.mergeCells(`B2:${lastColumn}2`)
  worksheet.mergeCells(`B3:${lastColumn}3`)
  worksheet.getCell('B1').value = MUNICIPAL_REPORT_NAME
  worksheet.getCell('B2').value = MUNICIPAL_REPORT_UNIT
  worksheet.getCell('B3').value = options.title.toLocaleUpperCase('pt-BR')
  const imageId = workbook.addImage({ base64: crestDataUrl.split(',')[1] || crestDataUrl, extension: 'png' })
  worksheet.addImage(imageId, { tl: { col: 0.12, row: 0.12 }, ext: { width: 48, height: 48 } })
  worksheet.getRow(1).height = 23
  worksheet.getRow(2).height = 18
  worksheet.getRow(3).height = 23

  const metaStart = 5
  options.metadata.forEach(([label, value], index) => {
    const rowNumber = metaStart + index
    worksheet.mergeCells(rowNumber, 2, rowNumber, columnCount)
    worksheet.getCell(rowNumber, 1).value = label
    worksheet.getCell(rowNumber, 2).value = value
    worksheet.getRow(rowNumber).height = Math.min(54, Math.max(20, Math.ceil(value.length / 125) * 17))
    worksheet.getCell(rowNumber, 1).font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF876B2C' } }
    worksheet.getCell(rowNumber, 2).font = { name: 'Aptos', size: 9, color: { argb: 'FF294757' } }
    worksheet.getCell(rowNumber, 2).alignment = { vertical: 'middle', wrapText: true }
  })
  const headerRowNumber = Math.max(8, metaStart + options.metadata.length + 1)
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber, topLeftCell: `A${headerRowNumber + 1}`, activeCell: `A${headerRowNumber + 1}` }]
  const header = worksheet.getRow(headerRowNumber)
  headers.forEach((value, index) => { header.getCell(index + 1).value = value })
  header.height = 30
  header.eachCell((cell) => {
    cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C59' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFD5A74A' } } }
  })
  const dataRows = options.rows.length ? options.rows : [['Sem dados para os filtros selecionados.']]
  dataRows.forEach((values, rowIndex) => {
    const rowNumber = headerRowNumber + rowIndex + 1
    const row = worksheet.getRow(rowNumber)
    headers.forEach((_, columnIndex) => { row.getCell(columnIndex + 1).value = excelSafeValue(values[columnIndex] ?? '') })
    row.height = 22
    row.eachCell((cell, columnIndex) => {
      const headerText = headers[columnIndex - 1] || ''
      const numeric = typeof cell.value === 'number'
      cell.font = { name: 'Aptos', size: 9, color: { argb: 'FF294757' } }
      cell.alignment = { vertical: 'middle', horizontal: numeric ? 'right' : 'left', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE6EA' } } }
      if (rowNumber % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FA' } }
      if (numeric && /valor|preço|diferença|r\$|financeiro/i.test(headerText)) cell.numFmt = '"R$" #,##0.00;[Red]("R$" #,##0.00)'
      else if (numeric && /litro|quantidade|volume/i.test(headerText)) cell.numFmt = '#,##0.000'
      else if (numeric && /percentual|variação/i.test(headerText)) cell.numFmt = '0.0%'
    })
  })
  const lastDataRow = headerRowNumber + dataRows.length
  worksheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: lastDataRow, column: headers.length } }
  const footerRow = lastDataRow + 2
  worksheet.mergeCells(footerRow, 1, footerRow, columnCount)
  worksheet.getCell(footerRow, 1).value = `Documento oficial gerado em ${formatMunicipalDateTime(new Date())} · Fuso ${MUNICIPAL_TIME_ZONE} · dados limitados ao escopo autorizado.`
  worksheet.getCell(footerRow, 1).font = { name: 'Aptos', size: 8, italic: true, color: { argb: 'FF647985' } }
  worksheet.getCell(footerRow, 1).alignment = { horizontal: 'center', wrapText: true }
  worksheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerRowNumber}:${headerRowNumber}`, margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }, horizontalCentered: true }
  worksheet.headerFooter.oddFooter = '&LPREFEITURA MUNICIPAL DE PITANGUEIRAS–PR&CGestão de Frotas&RPágina &P de &N'
  return worksheet
}

function columnName(column: number) {
  let value = column
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}
