import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import type { Writable } from "node:stream";
import { formatBytes, formatoDni, labelCaracter, labelCaseType, labelCategory, nombreCarpetaExpediente, type CaseRecord, type EvidenceRecord, type PairingSession } from "@espejo/shared";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as new (options?: Record<string, unknown>) => Pdf;

const ink = "#12263a";
const muted = "#66788a";
const blue = "#1a4f8a";
const soft = "#e7eef6";
const line = "#d9e3ee";
const ok = "#1f7a45";
const danger = "#9b3b32";
const left = 48;
const right = 547;
const width = right - left;

type Pdf = {
  page: { width: number; height: number };
  y: number;
  font(name: string): Pdf;
  fontSize(size: number): Pdf;
  fillColor(color: string): Pdf;
  strokeColor(color: string): Pdf;
  lineWidth(size: number): Pdf;
  text(value: string, x?: number, y?: number, options?: Record<string, unknown>): Pdf;
  rect(x: number, y: number, w: number, h: number): Pdf;
  roundedRect(x: number, y: number, w: number, h: number, r: number): Pdf;
  fill(): Pdf;
  stroke(): Pdf;
  moveTo(x: number, y: number): Pdf;
  lineTo(x: number, y: number): Pdf;
  save(): Pdf;
  restore(): Pdf;
  addPage(): Pdf;
  bufferedPageRange(): { start: number; count: number };
  switchToPage(index: number): Pdf;
  heightOfString(value: string, options?: Record<string, unknown>): number;
  end(): void;
  pipe(stream: Writable): Pdf;
  on(event: "end" | "error", listener: (error?: Error) => void): Pdf;
};

export type InformePdf = {
  cause: CaseRecord;
  evidence: EvidenceRecord[];
  sessions: PairingSession[];
  sha256: string;
  generadoEn: string;
};

function fecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "—";
  return date.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function origen(item: EvidenceRecord): string {
  if (item.source === "pantalla") return "Captura de pantalla por USB";
  if (item.source === "dispositivo") return "Archivo del teléfono copiado por USB";
  return "Archivo enviado por la app";
}

export function escribirInformePdf(filePath: string, data: InformePdf): Promise<void> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 0, left, right: 48 },
    bufferPages: true,
    compress: false,
    info: {
      Title: "EVIDIA — Informe de la diligencia",
      Author: "Poder Judicial del Chaco",
      Subject: data.cause.caratula,
    },
  });
  const output = createWriteStream(filePath);
  doc.pipe(output);

  const paquete = `${nombreCarpetaExpediente(data.cause.expediente)}.zip`;
  let y = encabezado(doc, false);
  y = titulo(doc, y, paquete);
  y = ficha(doc, y, data);
  y = personaAportante(doc, y, data.cause);
  y = dispositivos(doc, y, data.sessions);
  y = archivos(doc, y, data.evidence);
  huella(doc, y, data.sha256, paquete);
  pie(doc);
  doc.end();

  return new Promise((resolve, reject) => {
    output.on("finish", () => resolve());
    output.on("error", reject);
    doc.on("error", reject);
  });
}

function encabezado(doc: Pdf, continua: boolean): number {
  const alto = continua ? 36 : 108;
  doc.save();
  doc.rect(0, 0, doc.page.width, alto).fillColor(blue).fill();
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(continua ? 11 : 22);
  doc.text("EVIDIA", left, continua ? 12 : 28, { characterSpacing: continua ? 1 : 2.4, lineBreak: false });
  if (!continua) {
    doc.font("Helvetica").fontSize(10);
    doc.text("Sistema de Extracción y Verificación de Evidencia Digital", left, 58, { lineBreak: false });
    doc.fontSize(12).text("Poder Judicial del Chaco", left, 76, { lineBreak: false });
  }
  doc.restore();
  return alto + 22;
}

function nuevaPagina(doc: Pdf): number {
  doc.addPage();
  return encabezado(doc, true);
}

function asegurar(doc: Pdf, y: number, alto: number): number {
  if (y + alto <= doc.page.height - 58) return y;
  return nuevaPagina(doc);
}

function titulo(doc: Pdf, y: number, paquete: string): number {
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(16).text("Informe de la diligencia", left, y, { width });
  y = doc.y + 4;
  doc.fillColor(muted).font("Helvetica").fontSize(9).text(
    `Este documento queda fuera de ${paquete} para que la huella del paquete no cambie al leerlo.`,
    left,
    y,
    { width },
  );
  return doc.y + 16;
}

function ficha(doc: Pdf, y: number, data: InformePdf): number {
  const cause = data.cause;
  const filas: [string, string][] = [
    ["Carátula", cause.caratula || "—"],
    ["Expediente", cause.expediente || "—"],
    ["Proceso", cause.proceso || labelCaseType(cause.tipo)],
    ["Dependencia del expediente", cause.dependencia || "—"],
    ["Oficina de carga", cause.oficina || "—"],
    ["Responsable de la recepción", cause.responsable || "—"],
    ["Generado", fecha(data.generadoEn)],
    ["Archivos en el paquete", String(data.evidence.length)],
  ];
  return bloque(doc, y, "Causa", filas);
}

function personaAportante(doc: Pdf, y: number, cause: CaseRecord): number {
  const aportante = cause.aportante;
  const filas: [string, string][] = [
    ["Nombres y apellidos", aportante?.nombre || "—"],
    ["DNI", aportante?.dni ? formatoDni(aportante.dni) : "—"],
    ["Carácter", aportante?.caracter ? labelCaracter(aportante.caracter, aportante.caracterDetalle) : "—"],
  ];
  return bloque(doc, y, "Persona aportante", filas);
}

function dispositivos(doc: Pdf, y: number, sessions: PairingSession[]): number {
  const vistos = sessions.filter((item) => item.deviceName || item.imei);
  if (vistos.length === 0) return y;
  const filas: [string, string][] = [];
  vistos.forEach((item, index) => {
    const nombre = item.deviceName || "Teléfono";
    const aportante = item.contributorName ? ` · ${item.contributorName}` : "";
    filas.push([`Dispositivo ${index + 1}`, `${nombre}${aportante}`]);
    filas.push(["IMEI", item.imei || "No disponible"]);
  });
  return bloque(doc, y, "Registración del dispositivo", filas);
}

function bloque(doc: Pdf, y: number, tituloBloque: string, filas: [string, string][]): number {
  const altoTexto = filas.reduce((sum, [, value]) => sum + Math.max(22, doc.font("Helvetica").fontSize(10).heightOfString(value, { width: 320 }) + 8), 28);
  y = asegurar(doc, y, altoTexto + 8);
  doc.save();
  doc.roundedRect(left, y, width, altoTexto, 8).fillColor(soft).fill();
  doc.restore();
  doc.fillColor(blue).font("Helvetica-Bold").fontSize(9).text(tituloBloque.toUpperCase(), left + 14, y + 12, { characterSpacing: 0.6, lineBreak: false });
  let row = y + 30;
  for (const [etiqueta, valor] of filas) {
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(etiqueta, left + 14, row, { width: 150, lineBreak: false });
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(valor, left + 170, row, { width: 320 });
    row = Math.max(row + 18, doc.y + 4);
  }
  return y + altoTexto + 14;
}

function archivos(doc: Pdf, y: number, evidence: EvidenceRecord[]): number {
  y = asegurar(doc, y, 28);
  doc.fillColor(blue).font("Helvetica-Bold").fontSize(9).text("ARCHIVOS", left, y, { characterSpacing: 0.6, lineBreak: false });
  y += 16;
  if (evidence.length === 0) {
    doc.fillColor(muted).font("Helvetica").fontSize(10).text("No hay archivos recibidos.", left, y);
    return doc.y + 16;
  }
  evidence.forEach((item, index) => {
    const hashAlto = doc.font("Courier").fontSize(8).heightOfString(item.sha256, { width: width - 24 });
    y = asegurar(doc, y, 58 + hashAlto);
    doc.save();
    doc.roundedRect(left, y, width, 52 + hashAlto, 8).strokeColor(line).lineWidth(1).stroke();
    doc.restore();
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(11).text(`${index + 1}. ${item.filename}`, left + 12, y + 8, { width: width - 24 });
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(
      `${labelCategory(item.category)} · ${origen(item)} · ${formatBytes(item.size)} · ${fecha(item.capturedAt)}`,
      left + 12,
      doc.y + 2,
      { width: width - 24 },
    );
    doc.fillColor(item.sha256Verified ? ok : danger).font("Helvetica").fontSize(8).text(
      item.sha256Verified ? "Huella verificada en la estación" : "La huella no coincide con la informada por el teléfono",
      left + 12,
      doc.y + 1,
    );
    doc.fillColor(ink).font("Courier").fontSize(8).text(item.sha256, left + 12, doc.y + 2, { width: width - 24 });
    y = y + 52 + hashAlto + 8;
  });
  return y + 6;
}

function huella(doc: Pdf, y: number, sha256: string, paquete: string): void {
  const alto = 78;
  y = asegurar(doc, y, alto);
  doc.save();
  doc.roundedRect(left, y, width, alto, 8).fillColor(soft).fill();
  doc.rect(left, y, 5, alto).fillColor(blue).fill();
  doc.restore();
  doc.fillColor(blue).font("Helvetica-Bold").fontSize(9).text(`HUELLA SHA-256 DE ${paquete.toUpperCase()}`, left + 18, y + 12, { characterSpacing: 0.4, lineBreak: false });
  doc.fillColor(ink).font("Courier").fontSize(9).text(sha256, left + 18, y + 30, { width: width - 36 });
  doc.fillColor(muted).font("Helvetica").fontSize(8).text(
    "Esta huella corresponde al paquete completo. Dentro del zip, manifiesto.json, acta-judicial.docx y consentimiento.docx traen la constancia de cada archivo.",
    left + 18,
    y + 48,
    { width: width - 36 },
  );
}

function pie(doc: Pdf): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);
    const y = doc.page.height - 32;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).strokeColor(line).lineWidth(0.6).stroke();
    doc.restore();
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(
      `EVIDIA · Poder Judicial del Chaco · Página ${index + 1} de ${range.count}`,
      left,
      y + 8,
      { width, align: "center", lineBreak: false },
    );
  }
}
