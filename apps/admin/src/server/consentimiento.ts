import { existsSync, readFileSync } from "node:fs";
import { AlignmentType, Document, Packer, Paragraph, TextRun, type FileChild } from "docx";
import { formatoDni, labelCaracter, type CaseRecord } from "@espejo/shared";
import { fotoEncuadrada } from "./acta.js";
import { rutaFotoDni } from "./dni-foto.js";

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

const PUNTOS = "................................";

export function fechaConsentimiento(iso: string): string {
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

function plano(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "");
}

export function numeroTras(texto: string, etiqueta: string): string {
  const match = plano(texto).match(new RegExp(`${etiqueta}\\s*N[º°.]?\\s*(\\d+)`, "i"));
  return match?.[1] ?? "";
}

function dato(texto: string, opciones?: { bold?: boolean }): TextRun {
  return new TextRun({ text: texto, font: "Arial", size: 24, bold: opciones?.bold });
}

function linea(texto: string, opciones?: { before?: number; bold?: boolean; center?: boolean; size?: number }): Paragraph {
  return new Paragraph({
    alignment: opciones?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: opciones?.before ?? 0, after: 160, line: 276 },
    children: [new TextRun({ text: texto, font: "Arial", size: opciones?.size ?? 24, bold: opciones?.bold })],
  });
}

export function textoConsentimiento(cause: CaseRecord, generadoEn: string): string {
  const aportante = cause.aportante;
  const nombre = aportante.nombre || PUNTOS;
  const dni = aportante.dni ? formatoDni(aportante.dni) : PUNTOS;
  const expediente = cause.expediente || PUNTOS;
  const equipo = numeroTras(`${cause.dependencia} ${cause.oficina}`, "EQUIPO FISCAL") || PUNTOS;
  const caracter = aportante.caracter ? labelCaracter(aportante.caracter, aportante.caracterDetalle) : "";
  return [
    "Formulario de consentimiento previo",
    "",
    `CONSTE: que ${nombre}, D.N.I. Nº ${dni} ha sido informado/a en qué consiste la presente diligencia y sus alcances, con el objeto de lograr realizar evidencia digital del contenido de interés del dispositivo móvil de su propiedad, para ser agregado a la investigación del Expediente Nº ${expediente}, Equipo Fiscal Nº ${equipo}.`,
    "",
    "Asimismo, se hace saber al/la compareciente que la información que se extraerá será, únicamente, la que se observe en la pantalla de su teléfono celular, lo que implica que no se afectará su privacidad e intimidad más que en los límites que autorice. En esos términos, da su consentimiento expreso para que se realice la diligencia, la cual podrá presenciar en su totalidad.",
    "",
    caracter ? `Comparece en carácter de ${caracter}.` : "",
    "",
    "LUGAR: Resistencia",
    `FECHA: ${fechaConsentimiento(generadoEn)}`,
    "FIRMA: ........................................",
    `ACLARACION: ${nombre}`,
    `DNI: ${dni}`,
  ]
    .filter((item, index, list) => item !== "" || list[index - 1] !== "")
    .join("\n");
}

export async function docxConsentimiento(cause: CaseRecord, foto: Buffer | undefined, generadoEn: string): Promise<Buffer> {
  const aportante = cause.aportante;
  const nombre = aportante.nombre || PUNTOS;
  const dni = aportante.dni ? formatoDni(aportante.dni) : PUNTOS;
  const expediente = cause.expediente || PUNTOS;
  const origen = `${cause.dependencia} ${cause.oficina}`;
  const equipo = numeroTras(origen, "EQUIPO FISCAL") || PUNTOS;
  const caracter = aportante.caracter ? labelCaracter(aportante.caracter, aportante.caracterDetalle) : "";
  const children: FileChild[] = [
    linea("Formulario de consentimiento previo", { bold: true, center: true, size: 28 }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 280, after: 200, line: 276 },
      children: [
        dato("CONSTE: que "),
        dato(nombre, { bold: true }),
        dato(", D.N.I. Nº "),
        dato(dni, { bold: true }),
        dato(
          " ha sido informado/a en qué consiste la presente diligencia y sus alcances, con el objeto de lograr realizar evidencia digital del contenido de interés del dispositivo móvil de su propiedad, para ser agregado a la investigación del Expediente Nº ",
        ),
        dato(expediente, { bold: true }),
        dato(", Equipo Fiscal Nº "),
        dato(`${equipo}.`, { bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 160, after: 200, line: 276 },
      children: [
        dato(
          "Asimismo, se hace saber al/la compareciente que la información que se extraerá será, únicamente, la que se observe en la pantalla de su teléfono celular, lo que implica que no se afectará su privacidad e intimidad más que en los límites que autorice. En esos términos, da su consentimiento expreso para que se realice la diligencia, la cual podrá presenciar en su totalidad.",
        ),
      ],
    }),
  ];
  if (caracter) children.push(linea(`Comparece en carácter de ${caracter}.`, { before: 120 }));
  if (foto) children.push(...fotoEncuadrada(foto, "Fotografía del documento nacional de identidad."));
  children.push(
    linea("LUGAR: Resistencia", { before: 360 }),
    linea(`FECHA: ${fechaConsentimiento(generadoEn)}`),
    linea("FIRMA: ........................................", { before: 480 }),
    linea(`ACLARACION: ${nombre}`, { before: 280 }),
    linea(`DNI: ${dni}`),
  );
  const document = new Document({
    title: `Consentimiento — ${cause.expediente || nombre}`,
    creator: "Poder Judicial del Chaco",
    description: "Formulario de consentimiento previo",
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

export async function materialConsentimiento(cause: CaseRecord, generadoEn = new Date().toISOString()): Promise<Buffer> {
  const fotoPath = rutaFotoDni(cause.id);
  const foto = fotoPath && existsSync(fotoPath) ? readFileSync(fotoPath) : undefined;
  return docxConsentimiento(cause, foto, generadoEn);
}
