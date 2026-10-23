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
  labelCaracter,
  labelCategory,
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
  return `a los ${day} días del mes de ${MESES[month - 1] ?? ""} de ${year}`;
}

function dispositivosActa(data: ActaData): DispositivoDetectado[] {
  const lista = (data.dispositivos ?? data.cause.dispositivos ?? []).filter(dispositivoUtil);
  return lista.length > 0 ? lista : [dispositivoVacio()];
}

export function cuerpoActa(data: ActaData): string {
  const aportante = data.cause.aportante;
  const caracter = aportante?.caracter ? labelCaracter(aportante.caracter, aportante.caracterDetalle) : "sin carácter consignado";
  const quien = aportante?.nombre || "la persona aportante";
  const dni = aportante?.dni ? `, DNI ${formatoDni(aportante.dni)}` : "";
  const identificado = dispositivosActa(data).map(textoDispositivo).join("; ");
  const expediente = data.cause.expediente || "s/n";
  const caratula = data.cause.caratula || "s/ carátula";
  return `En la ciudad de Resistencia, capital de la provincia del Chaco, ${fechaActa(data.generadoEn)}, en los autos caratulados: "${caratula}", Expte. Nº ${expediente}, se hace presente ${quien}${dni}, en carácter de ${caracter}, quien entrega voluntariamente el dispositivo ${identificado}. Se le hace saber que el mismo será manipulado solo a los efectos de extraer la evidencia digital que consta en el mismo, para facilitar su extracción se instalará una aplicación móvil la cual solo se utilizará a esos efectos, y que finalizado el acto se procederá a su desinstalación del mismo. Luego el dispositivo es devuelto a la persona aportante. No siendo para más, finaliza el acto, previa íntegra lectura efectuada a viva voz por el actuario, firma el compareciente al pie de conformidad, todo ante mí que doy fe.`;
}

export function textoActa(data: ActaData): string {
  const expediente = data.cause.expediente || "s/n";
  const lines = [`Expte. Nº ${expediente}`, "", cuerpoActa(data), ""];
  if (data.evidence.length > 0) {
    lines.push("Archivos extraídos", "");
    data.evidence.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.filename} · ${labelCategory(item.category)} · ${item.sha256}`);
    });
    lines.push("");
  }
  lines.push("Firma del compareciente: ________________________________", "", "Ante mí: ________________________________");
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

function parrafo(texto: string, opciones?: { justify?: boolean; before?: number; bold?: boolean; pageBreak?: boolean }): Paragraph {
  return new Paragraph({
    alignment: opciones?.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    pageBreakBefore: opciones?.pageBreak,
    spacing: { before: opciones?.before ?? 0, after: 160, line: 276 },
    children: [new TextRun({ text: texto, font: "Arial", size: 24, bold: opciones?.bold })],
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
  const expediente = data.cause.expediente || "s/n";
  const children: FileChild[] = [
    parrafo(`Expte. Nº ${expediente}`),
    parrafo(cuerpoActa(data), { justify: true, before: 200 }),
  ];
  if (foto) children.push(...fotoEncuadrada(foto));
  children.push(
    parrafo("Firma del compareciente: ________________________________", { before: 480 }),
    parrafo("Ante mí: ________________________________", { before: 600 }),
  );
  if (data.evidence.length > 0) {
    children.push(parrafo("Archivos extraídos", { bold: true, pageBreak: true }));
    data.evidence.forEach((item, index) => {
      children.push(parrafo(`${index + 1}. ${item.filename}`));
      children.push(parrafo(`${labelCategory(item.category)} · ${item.sha256}`));
    });
  }
  const document = new Document({
    title: `Acta de extracción — ${expediente}`,
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
  const foto = fotoPath && existsSync(fotoPath) ? readFileSync(fotoPath) : undefined;
  return { texto: textoActa(data), docx: await docxActa(data, foto) };
}
