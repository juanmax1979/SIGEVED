import { existsSync, readFileSync } from "node:fs";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from "docx";
import {
  dispositivoUtil,
  dispositivoVacio,
  textoDispositivo,
  formatoDni,
  descripcionCaptura,
  type CaseRecord,
  type DispositivoDetectado,
  type EvidenceRecord,
  type PairingSession,
} from "@espejo/shared";
import { rutaFotoDni } from "./dni-foto.js";

const MARCO_ANCHO = 460;
const MARCO_ALTO = 250;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export type ActaData = {
  cause: CaseRecord;
  evidence: EvidenceRecord[];
  sessions: PairingSession[];
  dispositivos?: DispositivoDetectado[];
  generadoEn: string;
  anonimo?: boolean;
};

export function fechaActa(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((item) => item.type === "day")?.value ?? "";
  const month = Number(parts.find((item) => item.type === "month")?.value ?? "1");
  const year = parts.find((item) => item.type === "year")?.value ?? "";
  return `${day} de ${MESES[month - 1] ?? ""} de ${year}`;
}

const PUNTOS = "................................";
const LINEA = "______________________";
const LOCALIDAD = "Resistencia";
const DESINSTALAR =
  "se procederá a desinstalar las aplicaciones y componentes instalados durante la extracción, desactivar la depuración USB y las opciones de desarrollador que hubieran sido habilitadas";
const ARTICULOS = "artículos 133, 134 y 229 a 240 del Código Procesal Penal de la Provincia del Chaco, Ley 965-N";

function horaActa(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return PUNTOS;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((item) => item.type === "hour")?.value ?? "";
  const minute = parts.find((item) => item.type === "minute")?.value ?? "";
  return hour && minute ? `${hour}:${minute}` : PUNTOS;
}

function autoridadActa(cause: CaseRecord): string {
  return cause.oficina.trim() || cause.dependencia.trim() || PUNTOS;
}

function fraseArchivos(cantidad: number): string {
  if (cantidad <= 0) return "sin que en esta diligencia se obtuvieran archivos digitales";
  if (cantidad === 1) {
    return "procediéndose a la extracción de 1 archivo digital, cuyo valor hash SHA-256 fue registrado para garantizar la verificación de su integridad";
  }
  return `procediéndose a la extracción de ${cantidad} archivos digitales, cuyos valores hash SHA-256 fueron registrados para garantizar la verificación de su integridad`;
}

export function relatoActa(data: ActaData): string[] {
  const lista = dispositivosActa(data);
  const varios = (data.dispositivos ?? data.cause.dispositivos ?? []).filter(dispositivoUtil).length > 1;
  const equipos = lista.map(textoDispositivo).join("; ");
  const equipo = varios ? `de los dispositivos móviles ${equipos}` : `del dispositivo móvil ${equipos}`;
  const participio = varios ? "aportados" : "aportado";
  const aportante = data.cause.aportante;
  const persona = actaAnonimizada(data)
    ? "una persona aportante"
    : `el/la Sr./Sra. ${aportante?.nombre?.trim() || PUNTOS}, DNI N.º ${aportante?.dni ? formatoDni(aportante.dni) : PUNTOS}`;
  return [
    `En la ciudad de ${LOCALIDAD}, siendo las ${horaActa(data.generadoEn)}, ante funcionario actuante, se deja constancia de que se procedió a realizar la extracción de evidencia digital ${equipo}, ${participio} voluntariamente por ${persona}, conforme al consentimiento informado oportunamente prestado.`,
    `A tal efecto, mediante la herramienta SIGEVED, se realizaron las operaciones técnicas necesarias, incluyendo, según correspondió, la habilitación de opciones de desarrollador, depuración USB e instalación de componentes auxiliares, ${fraseArchivos(data.evidence.length)}.`,
    `Concluido el procedimiento, ${DESINSTALAR}, procurando restituir el dispositivo a su configuración original, sin afectar la información personal almacenada.`,
    `La presente diligencia se documenta conforme a las disposiciones pertinentes de los ${ARTICULOS}, en cuanto resulten aplicables.`,
    "No siendo para más, se da por finalizado el acto, previa lectura, firmando los intervinientes para constancia.",
  ];
}

function dispositivosActa(data: ActaData): DispositivoDetectado[] {
  const lista = (data.dispositivos ?? data.cause.dispositivos ?? []).filter(dispositivoUtil);
  return lista.length > 0 ? lista : [dispositivoVacio()];
}

function actaAnonimizada(data: ActaData): boolean {
  return data.anonimo ?? Boolean(data.cause.aportante?.anonimo);
}

export function constanciaSinFoto(aportante: { sinFotoDni?: boolean; dniFoto?: boolean; motivoSinFoto?: string } | undefined, anonimo: boolean): string {
  if (anonimo || !aportante?.sinFotoDni || aportante.dniFoto) return "";
  const motivo = (aportante.motivoSinFoto ?? "").trim();
  if (!motivo) return "";
  const cierre = /[.!?]$/.test(motivo) ? "" : ".";
  return `No se adjunta fotografía del documento nacional de identidad. Motivo consignado por el operador: ${motivo}${cierre}`;
}

export function textoActa(data: ActaData): string {
  const cause = data.cause;
  const lines = [
    "PODER JUDICIAL DE LA PROVINCIA DEL CHACO",
    "ACTA DE EXTRACCIÓN DE EVIDENCIA DIGITAL",
    `Expediente N.º: ${cause.expediente || PUNTOS}`,
    `Carátula: ${cause.caratula || PUNTOS}`,
    `Fiscalía / Dependencia: ${autoridadActa(cause)}`,
    `Lugar y fecha: ${LOCALIDAD}, ${fechaActa(data.generadoEn)}`,
    "",
    ...relatoActa(data),
    "",
  ];
  const sinFoto = constanciaSinFoto(cause.aportante, actaAnonimizada(data));
  if (sinFoto) lines.push(sinFoto, "");
  lines.push(
    `Hora de finalización: ${PUNTOS}`,
    `Firma del funcionario actuante: ${LINEA}`,
    `Firma del responsable técnico: ${LINEA}`,
    `Firma del testigo/aportante: ${LINEA}`,
  );
  if (data.evidence.length > 0) {
    lines.push("", "Archivos extraídos", "");
    data.evidence.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.filename} · ${descripcionCaptura(item)} · ${item.sha256}`);
    });
  }
  return lines.join("\n");
}

export function marcoFoto(ancho: number, alto: number): { width: number; height: number } {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) {
    return { width: 250, height: 160 };
  }
  const escala = Math.min(MARCO_ANCHO / ancho, MARCO_ALTO / alto, 1);
  return {
    width: Math.max(1, Math.round(ancho * escala)),
    height: Math.max(1, Math.round(alto * escala)),
  };
}

function medidasImagen(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;
    const marker = buffer[offset + 1] ?? 0;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2) return undefined;
    offset += 2 + size;
  }
  return undefined;
}

function tipoFoto(buffer: Buffer): "jpg" | "png" | undefined {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  return undefined;
}

function parrafo(texto: string, opciones?: { justify?: boolean; before?: number; bold?: boolean; pageBreak?: boolean; center?: boolean }): Paragraph {
  const alignment = opciones?.center ? AlignmentType.CENTER : opciones?.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
  return new Paragraph({
    alignment,
    pageBreakBefore: opciones?.pageBreak,
    spacing: { before: opciones?.before ?? 0, after: 160, line: 276 },
    children: [new TextRun({ text: texto, font: "Arial", size: 24, bold: opciones?.bold })],
  });
}

function campo(etiqueta: string, valor: string): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 80, line: 276 },
    children: [
      new TextRun({ text: etiqueta, font: "Arial", size: 24, bold: true }),
      new TextRun({ text: valor, font: "Arial", size: 24 }),
    ],
  });
}

function parrafoMixto(partes: { texto: string; bold?: boolean }[], before = 160): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before, after: 160, line: 276 },
    children: partes.map((parte) => new TextRun({ text: parte.texto, font: "Arial", size: 24, bold: parte.bold })),
  });
}

export function fotoEncuadrada(
  foto: Buffer,
  epigrafe = "Fotografía del documento nacional de identidad de la persona aportante.",
): FileChild[] {
  const tipo = tipoFoto(foto);
  if (!tipo) return [parrafo("La fotografía del DNI no pudo incrustarse en esta acta.")];
  const medidas = medidasImagen(foto);
  const marco = marcoFoto(medidas?.width ?? 0, medidas?.height ?? 0);
  const margen = 80;
  const ancho = marco.width * 15 + margen * 2;
  const borde = { style: BorderStyle.SINGLE, size: 4, color: "C5CED8" };
  return [
    parrafo(epigrafe, { before: 200 }),
    new Table({
      width: { size: ancho, type: WidthType.DXA },
      columnWidths: [ancho],
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: ancho, type: WidthType.DXA },
              margins: { top: margen, bottom: margen, left: margen, right: margen },
              borders: { top: borde, bottom: borde, left: borde, right: borde },
              children: [
                new Paragraph({
                  spacing: { before: 0, after: 0 },
                  children: [
                    new ImageRun({
                      type: tipo,
                      data: foto,
                      transformation: marco,
                      altText: {
                        name: "DNI",
                        title: "DNI del aportante",
                        description: "Fotografía del documento nacional de identidad",
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];
}

export async function docxActa(data: ActaData, foto?: Buffer): Promise<Buffer> {
  const cause = data.cause;
  const expediente = cause.expediente || PUNTOS;
  const relato = relatoActa(data);
  const children: FileChild[] = [
    parrafo("PODER JUDICIAL DE LA PROVINCIA DEL CHACO", { bold: true, center: true }),
    parrafo("ACTA DE EXTRACCIÓN DE EVIDENCIA DIGITAL", { bold: true, before: 200 }),
    campo("Expediente N.º:", ` ${expediente}`),
    campo("Carátula:", ` ${cause.caratula || PUNTOS}`),
    campo("Fiscalía / Dependencia:", ` ${autoridadActa(cause)}`),
    campo("Lugar y fecha:", ` ${LOCALIDAD}, ${fechaActa(data.generadoEn)}`),
    parrafo(relato[0] ?? "", { justify: true, before: 200 }),
    parrafo(relato[1] ?? "", { justify: true }),
    parrafoMixto([
      { texto: "Concluido el procedimiento, " },
      { texto: DESINSTALAR, bold: true },
      { texto: ", procurando restituir el dispositivo a su configuración original, sin afectar la información personal almacenada." },
    ]),
    parrafoMixto([
      { texto: "La presente diligencia se documenta conforme a las disposiciones pertinentes de los " },
      { texto: ARTICULOS, bold: true },
      { texto: ", en cuanto resulten aplicables." },
    ]),
    parrafo(relato[4] ?? "", { justify: true }),
  ];
  const sinFoto = constanciaSinFoto(cause.aportante, actaAnonimizada(data));
  if (foto && !actaAnonimizada(data)) children.push(...fotoEncuadrada(foto));
  else if (sinFoto) children.push(parrafo(sinFoto, { justify: true, before: 200 }));
  children.push(
    campo("Hora de finalización:", ` ${PUNTOS}`),
    campo("Firma del funcionario actuante:", ` ${LINEA}`),
    campo("Firma del responsable técnico:", ` ${LINEA}`),
    campo("Firma del testigo/aportante:", ` ${LINEA}`),
  );
  if (data.evidence.length > 0) {
    children.push(parrafo("Archivos extraídos", { bold: true, pageBreak: true }));
    data.evidence.forEach((item, index) => {
      children.push(parrafo(`${index + 1}. ${item.filename}`));
      children.push(parrafo(`${descripcionCaptura(item)} · ${item.sha256}`));
    });
  }
  const document = new Document({
    title: `Acta de extracción de evidencia digital — ${expediente}`,
    creator: "Poder Judicial del Chaco",
    description: data.cause.caratula,
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 850, bottom: 1134, left: 1701 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}

export async function materialActa(data: ActaData): Promise<{ texto: string; docx: Buffer }> {
  const fotoPath = rutaFotoDni(data.cause.id);
  const foto = !actaAnonimizada(data) && fotoPath && existsSync(fotoPath) ? readFileSync(fotoPath) : undefined;
  return { texto: textoActa(data), docx: await docxActa(data, foto) };
}
