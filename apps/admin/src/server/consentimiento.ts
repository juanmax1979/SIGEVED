import { existsSync, readFileSync } from "node:fs";
import { AlignmentType, Document, Packer, Paragraph, TextRun, type FileChild } from "docx";
import {
  dispositivoUtil,
  dispositivoVacio,
  descripcionCaptura,
  formatoDni,
  labelCategory,
  textoDispositivo,
  type CaseRecord,
  type DispositivoDetectado,
  type EvidenceCategory,
} from "@espejo/shared";
import { constanciaSinFoto, fotoEncuadrada } from "./acta.js";
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

const LINEA = "______________________";
const LOCALIDAD = "Resistencia";

type EvidenciaConsentimiento = { category?: string; note?: string; source?: string };

export function horaConsentimiento(iso: string): string {
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

function textoDeDispositivos(lista: DispositivoDetectado[] | undefined): string {
  const utiles = (lista ?? []).filter(dispositivoUtil);
  const equipos = utiles.length > 0 ? utiles : [dispositivoVacio()];
  return equipos.map(textoDispositivo).join("; ");
}

function fraseDispositivo(lista: DispositivoDetectado[] | undefined, propio: boolean): string {
  const varios = (lista ?? []).filter(dispositivoUtil).length > 1;
  const nucleo = textoDeDispositivos(lista);
  if (propio) return varios ? `sus dispositivos móviles, ${nucleo}` : `su dispositivo móvil, ${nucleo}`;
  return varios ? `los dispositivos móviles, ${nucleo}` : `el dispositivo móvil, ${nucleo}`;
}

function fechaEnLetras(iso: string): string {
  const fecha = fechaConsentimiento(iso);
  const match = fecha.match(/^(\d+) de ([a-záéíóú]+) de (\d+)$/i);
  if (!match) return fecha;
  return `a los ${match[1]} días del mes de ${match[2]} del año ${match[3]}`;
}

type Trozo = { texto: string; bold?: boolean };

function t(texto: string, bold = false): Trozo {
  return bold ? { texto, bold: true } : { texto };
}

function planoDe(partes: Trozo[]): string {
  return partes.map((parte) => parte.texto).join("");
}

type ActaConsentimiento = {
  titulo: string;
  expediente: string;
  caratula: string;
  autoridad: string;
  parrafos: Trozo[][];
  sinFoto: string;
  firmas: string[];
};

function encabezado(
  cause: CaseRecord,
  generadoEn: string,
): { apertura: string; expediente: string; caratula: string; autoridad: string } {
  return {
    apertura: `En la ciudad de ${LOCALIDAD}, Provincia del Chaco, ${fechaEnLetras(generadoEn)}, siendo las ${horaConsentimiento(generadoEn)}, ante ${PUNTOS}`,
    expediente: cause.expediente || PUNTOS,
    caratula: cause.caratula || PUNTOS,
    autoridad: autoridadInterviniente(cause),
  };
}

function personaIdentificada(cause: CaseRecord, anonimo: boolean): { nombre: string; dni: string } {
  if (anonimo) return { nombre: "", dni: "" };
  const aportante = cause.aportante;
  return {
    nombre: aportante.nombre.trim() || PUNTOS,
    dni: aportante.dni ? formatoDni(aportante.dni) : PUNTOS,
  };
}

function actaTestigo(
  cause: CaseRecord,
  generadoEn: string,
  anonimo: boolean,
  dispositivos: DispositivoDetectado[] | undefined,
  evidencias: EvidenciaConsentimiento[],
): ActaConsentimiento {
  const cabeza = encabezado(cause, generadoEn);
  const persona = personaIdentificada(cause, anonimo);
  const compareciente = anonimo
    ? "una persona aportante"
    : `el/la Sr./Sra. ${persona.nombre}, DNI N.º ${persona.dni}, con domicilio en ${PUNTOS}`;
  const consentimiento = "PRESTA SU CONSENTIMIENTO LIBRE, EXPRESO, INFORMADO Y VOLUNTARIO";
  return {
    titulo: "ACTA DE CONSENTIMIENTO INFORMADO PARA EXTRACCIÓN DE EVIDENCIA DIGITAL — TESTIGO",
    expediente: cabeza.expediente,
    caratula: cabeza.caratula,
    autoridad: cabeza.autoridad,
    parrafos: [
      [t(`${cabeza.apertura}, comparece en calidad de TESTIGO ${compareciente}.`)],
      [
        t(
          "Seguidamente, se le hacen conocer las previsiones legales de los artículos 217, 218, 219, 220 y 225 del Código Procesal Penal de la Provincia del Chaco, Ley 965-N, relativas al deber de declarar, las facultades y deberes de abstención, el juramento de decir verdad y las consecuencias del falso testimonio.",
        ),
      ],
      [
        t(
          `Consultado/a sobre sus vínculos con las partes y posibles causales de abstención, manifiesta: ${PUNTOS}. Se deja constancia de las advertencias y del juramento o promesa, cuando correspondan.`,
        ),
      ],
      [
        t("Asimismo, se le informa sobre la finalidad y el alcance de la extracción de evidencia digital, manifestando que "),
        t(consentimiento, true),
        t(
          ` para aportar ${fraseDispositivo(dispositivos, true)}, autorizando la extracción y preservación de ${tiposEvidencia(evidencias)}, correspondientes al período ${PUNTOS}.`,
        ),
      ],
      [
        t(
          "La autorización se limita a los datos individualizados, sin comprender información ajena a la investigación. Se le informa que podrá revocar el consentimiento respecto de operaciones futuras sustentadas exclusivamente en esta autorización, sin perjuicio de las medidas procesales legalmente dispuestas.",
        ),
      ],
      [
        t(
          "Se deja constancia de que los elementos obtenidos serán documentados y preservados mediante los procedimientos técnicos correspondientes, incluyendo su identificación y cálculo de hash SHA-256.",
        ),
      ],
      [
        t(
          `No siendo para más, previa lectura y ratificación, se da por finalizado el acto a las ${PUNTOS}, firmando los intervinientes conforme a los artículos 133 y 134 de la Ley 965-N.`,
        ),
      ],
    ],
    sinFoto: constanciaSinFoto(cause.aportante, anonimo),
    firmas: ["Firma del testigo", "Firma del funcionario actuante", "Firma del secretario/a o testigo de actuación, según corresponda"],
  };
}

function actaImputado(
  cause: CaseRecord,
  generadoEn: string,
  anonimo: boolean,
  dispositivos: DispositivoDetectado[] | undefined,
  evidencias: EvidenciaConsentimiento[],
): ActaConsentimiento {
  const cabeza = encabezado(cause, generadoEn);
  const persona = personaIdentificada(cause, anonimo);
  const compareciente = anonimo
    ? "una persona aportante, en calidad de IMPUTADO/A"
    : `el/la Sr./Sra. ${persona.nombre}, DNI N.º ${persona.dni}, en calidad de IMPUTADO/A`;
  const consentimiento = "PRESTA SU CONSENTIMIENTO LIBRE, EXPRESO, INFORMADO Y VOLUNTARIO";
  return {
    titulo: "ACTA DE CONSENTIMIENTO INFORMADO PARA EXTRACCIÓN DE EVIDENCIA DIGITAL — IMPUTADO",
    expediente: cabeza.expediente,
    caratula: cabeza.caratula,
    autoridad: cabeza.autoridad,
    parrafos: [
      [
        t(
          `${cabeza.apertura}, comparece ${compareciente}, con asistencia de su abogado/a defensor/a Dr./Dra. ${PUNTOS}, matrícula ${PUNTOS}.`,
        ),
      ],
      [
        t(
          `Se deja constancia de que se le informa el hecho atribuido ${PUNTOS}, y se le hacen conocer las previsiones de los artículos 256, 257, 259 y 262 del Código Procesal Penal de la Provincia del Chaco, Ley 965-N, relativas a la asistencia obligatoria del defensor, el derecho a abstenerse de declarar, la prohibición de coacción y las formalidades de la declaración.`,
        ),
      ],
      [
        t(
          "Se le informa expresamente que no está obligado/a a declarar contra sí mismo/a ni a aportar voluntariamente evidencia digital que pudiera comprometer su situación procesal, y que su negativa a prestar consentimiento no implica reconocimiento de culpabilidad.",
        ),
      ],
      [
        t("Previa consulta con su defensor/a, y habiendo recibido información suficiente sobre el alcance de la diligencia, manifiesta que "),
        t(consentimiento, true),
        t(
          ` para aportar ${fraseDispositivo(dispositivos, true)}, autorizando exclusivamente la extracción de ${tiposEvidencia(evidencias)}, correspondientes al período ${PUNTOS}.`,
        ),
      ],
      [
        t(
          "La autorización no comprende otros datos personales ni constituye una renuncia general a sus garantías procesales. Podrá revocarse respecto de operaciones futuras sustentadas exclusivamente en este consentimiento, sin perjuicio de las medidas legalmente ordenadas.",
        ),
      ],
      [t("La evidencia obtenida será individualizada, preservada y documentada técnicamente, incluyendo sus valores hash SHA-256.")],
      [
        t(
          `No siendo para más, previa lectura y ratificación, se da por finalizado el acto a las ${PUNTOS}, firmando los intervinientes conforme a los artículos 133, 134 y 262 de la Ley 965-N, en cuanto correspondan.`,
        ),
      ],
    ],
    sinFoto: constanciaSinFoto(cause.aportante, anonimo),
    firmas: [
      "Firma del imputado/a",
      "Firma del abogado/a defensor/a",
      "Firma del funcionario actuante",
      "Firma del secretario/a o funcionario/a correspondiente",
    ],
  };
}

function actaMenor(
  cause: CaseRecord,
  generadoEn: string,
  anonimo: boolean,
  dispositivos: DispositivoDetectado[] | undefined,
  evidencias: EvidenciaConsentimiento[],
): ActaConsentimiento {
  const cabeza = encabezado(cause, generadoEn);
  const persona = personaIdentificada(cause, anonimo);
  const compareciente = anonimo
    ? "una persona menor de edad"
    : `el/la menor de edad ${persona.nombre}, DNI N.º ${persona.dni}, de ${PUNTOS} años`;
  return {
    titulo: "ACTA DE CONSENTIMIENTO INFORMADO PARA EXTRACCIÓN DE EVIDENCIA DIGITAL — MENOR DE EDAD",
    expediente: cabeza.expediente,
    caratula: cabeza.caratula,
    autoridad: cabeza.autoridad,
    parrafos: [
      [
        t(
          `${cabeza.apertura}, comparece ${compareciente}, con intervención de la Asesora de Niñas, Niños y Adolescentes, Dra. ${PUNTOS}, en razón de encontrarse involucrados en los hechos investigados sus ${PUNTOS}.`,
        ),
      ],
      [
        t(
          "Se deja constancia de que se han considerado las previsiones de los artículos 91, 133, 134, 219, 225 y 225 bis del Código Procesal Penal de la Provincia del Chaco, Ley 965-N, en cuanto resulten aplicables, relativas a los derechos de las víctimas, las formalidades procesales, la facultad de abstención, el juramento y las condiciones especiales de recepción de declaraciones de personas menores de edad.",
        ),
      ],
      [
        t(
          "Se hace saber al menor, mediante explicaciones adecuadas a su edad y grado de madurez, la finalidad y el alcance de la extracción de evidencia digital, procurando garantizar su comprensión, protección e intervención libre de presiones.",
        ),
      ],
      [
        t(
          `En presencia de la Asesora interviniente, quien manifiesta ${PUNTOS}, y dejándose constancia de la representación o autorización jurídicamente necesaria ${PUNTOS}, el/la menor `,
        ),
        t("EXPRESA SU CONFORMIDAD LIBRE E INFORMADA", true),
        t(
          `, para aportar ${fraseDispositivo(dispositivos, false)}, y permitir la extracción de ${tiposEvidencia(evidencias)}, correspondientes al período ${PUNTOS}.`,
        ),
      ],
      [
        t(
          "La autorización queda limitada a la evidencia relacionada con los hechos investigados, excluyendo información personal ajena a la causa, y su ejecución queda sujeta a la verificación de los requisitos legales de representación y autorización.",
        ),
      ],
      [
        t(
          "Se deja constancia de que se procurará preservar la intimidad e identidad del menor, evitando intervenciones innecesarias y garantizando la integridad de los archivos obtenidos mediante procedimientos técnicos y cálculo de hash SHA-256.",
        ),
      ],
      [
        t(
          `No siendo para más, previa lectura y explicación del contenido en lenguaje comprensible, se da por finalizado el acto a las ${PUNTOS}, firmando los intervinientes conforme a los artículos 133 y 134 de la Ley 965-N.`,
        ),
      ],
    ],
    sinFoto: constanciaSinFoto(cause.aportante, anonimo),
    firmas: [
      "Firma del menor, si corresponde",
      "Firma de la Asesora de NNyA",
      "Firma del representante especial, si corresponde",
      "Firma del funcionario actuante",
      "Firma del secretario/a o testigo de actuación, según corresponda",
    ],
  };
}

function actaSinCaracter(
  cause: CaseRecord,
  generadoEn: string,
  anonimo: boolean,
  dispositivos: DispositivoDetectado[] | undefined,
): ActaConsentimiento {
  const cabeza = encabezado(cause, generadoEn);
  const quien = anonimo ? "una persona aportante" : "el/la compareciente";
  return {
    titulo: "ACTA DE CONSENTIMIENTO INFORMADO PARA EXTRACCIÓN DE EVIDENCIA DIGITAL",
    expediente: cabeza.expediente,
    caratula: cabeza.caratula,
    autoridad: cabeza.autoridad,
    parrafos: [
      [
        t(
          `${cabeza.apertura}, comparece ${quien}. Se deja constancia del dispositivo ofrecido, ${fraseDispositivo(dispositivos, true)}. No se consignó el carácter del aportante.`,
        ),
      ],
    ],
    sinFoto: constanciaSinFoto(cause.aportante, anonimo),
    firmas: ["Firma del compareciente", "Firma del funcionario actuante"],
  };
}

function armarActa(
  cause: CaseRecord,
  generadoEn: string,
  anonimo: boolean,
  dispositivos: DispositivoDetectado[] | undefined,
  evidencias: EvidenciaConsentimiento[],
): ActaConsentimiento {
  const caracter = cause.aportante.caracter;
  if (caracter === "aportante_testigo") return actaTestigo(cause, generadoEn, anonimo, dispositivos, evidencias);
  if (caracter === "aportante_imputado") return actaImputado(cause, generadoEn, anonimo, dispositivos, evidencias);
  if (caracter === "aportante_menor") return actaMenor(cause, generadoEn, anonimo, dispositivos, evidencias);
  return actaSinCaracter(cause, generadoEn, anonimo, dispositivos);
}

function autoridadInterviniente(cause: CaseRecord): string {
  return cause.oficina.trim() || cause.dependencia.trim() || PUNTOS;
}

function tiposEvidencia(evidencias: EvidenciaConsentimiento[]): string {
  const labels = [
    ...new Set(
      evidencias
        .map((item) => {
          if (!item.category) return "";
          if (item.source === "pantalla" || item.source === "dispositivo") {
            return descripcionCaptura({ category: item.category as EvidenceCategory, note: item.note, source: item.source });
          }
          return labelCategory(item.category as EvidenceCategory);
        })
        .filter(Boolean),
    ),
  ];
  return labels.join(" / ") || PUNTOS;
}

function parrafo(children: TextRun[], before = 160): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before, after: 160, line: 276 },
    children,
  });
}

function campo(etiqueta: string, valor: string): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 80, line: 276 },
    children: [dato(etiqueta, { bold: true }), dato(valor)],
  });
}

export function textoConsentimiento(
  cause: CaseRecord,
  generadoEn: string,
  anonimo = Boolean(cause.aportante.anonimo),
  dispositivos: DispositivoDetectado[] = cause.dispositivos ?? [],
  evidencias: EvidenciaConsentimiento[] = [],
): string {
  const acta = armarActa(cause, generadoEn, anonimo, dispositivos, evidencias);
  return [
    "PODER JUDICIAL DE LA PROVINCIA DEL CHACO",
    acta.titulo,
    `Expediente N.º: ${acta.expediente}`,
    `Carátula: ${acta.caratula}`,
    `Fiscalía / Dependencia: ${acta.autoridad}`,
    ...acta.parrafos.map(planoDe),
    acta.sinFoto,
    ...acta.firmas.map((firma) => `${firma}: ${LINEA}`),
  ]
    .filter((item) => item !== "")
    .join("\n");
}

export async function docxConsentimiento(
  cause: CaseRecord,
  foto: Buffer | undefined,
  generadoEn: string,
  anonimo = Boolean(cause.aportante.anonimo),
  dispositivos: DispositivoDetectado[] = cause.dispositivos ?? [],
  evidencias: EvidenciaConsentimiento[] = [],
): Promise<Buffer> {
  const acta = armarActa(cause, generadoEn, anonimo, dispositivos, evidencias);
  const children: FileChild[] = [
    linea("PODER JUDICIAL DE LA PROVINCIA DEL CHACO", { bold: true, center: true, size: 28 }),
    linea(acta.titulo, { bold: true, before: 200 }),
    campo("Expediente N.º:", ` ${acta.expediente}`),
    campo("Carátula:", ` ${acta.caratula}`),
    campo("Fiscalía / Dependencia:", ` ${acta.autoridad}`),
    ...acta.parrafos.map((partes, index) => parrafo(partes.map((parte) => dato(parte.texto, { bold: parte.bold })), index === 0 ? 200 : 160)),
  ];
  if (foto && !anonimo) children.push(...fotoEncuadrada(foto, "Fotografía del documento nacional de identidad."));
  else if (acta.sinFoto) children.push(linea(acta.sinFoto, { before: 200 }));
  children.push(...acta.firmas.map((firma) => campo(`${firma}:`, ` ${LINEA}`)));
  const document = new Document({
    title: `Consentimiento — ${acta.expediente}`,
    creator: "Poder Judicial del Chaco",
    description: "Acta de consentimiento informado para extracción de evidencia digital",
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

export async function materialConsentimiento(
  cause: CaseRecord,
  generadoEn = new Date().toISOString(),
  anonimo = Boolean(cause.aportante.anonimo),
  dispositivos: DispositivoDetectado[] = cause.dispositivos ?? [],
  evidencias: EvidenciaConsentimiento[] = [],
): Promise<Buffer> {
  const fotoPath = rutaFotoDni(cause.id);
  const foto = !anonimo && fotoPath && existsSync(fotoPath) ? readFileSync(fotoPath) : undefined;
  return docxConsentimiento(cause, foto, generadoEn, anonimo, dispositivos, evidencias);
}
