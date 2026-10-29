import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { CaseRecord } from "@espejo/shared";
import { docxConsentimiento, numeroTras, textoConsentimiento } from "./consentimiento.js";

const cause: CaseRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  caratula: "Gomez c/ Escalante",
  expediente: "12345/2026-1",
  tipo: "violencia_genero",
  dependencia: "EQUIPO FISCAL Nº 14",
  oficina: "EQUIPO FISCAL Nº 14 · TITULAR · PRIMERA CIRCUNSCRIPCION JUDICIAL",
  proceso: "Denuncia",
  responsable: "AVALOS FERNANDEZ JUAN MARCELO",
  notas: "",
  aportante: {
    nombre: "PEREZ MARIA LAURA",
    dni: "30111222",
    caracter: "aportante_testigo",
    caracterDetalle: "",
    dniFoto: true,
    anonimo: false,
    sinFotoDni: false,
    motivoSinFoto: "",
  },
  createdAt: "2026-10-20T13:00:00.000Z",
  updatedAt: "2026-10-20T13:00:00.000Z",
};

test("completa el formulario de consentimiento con los datos del aportante", () => {
  assert.equal(numeroTras("EQUIPO FISCAL N° 15", "EQUIPO FISCAL"), "15");
  assert.equal(numeroTras("Fiscalía de Instrucción Nº 8", "FISCALIA DE INSTRUCCION"), "8");
  const texto = textoConsentimiento(cause, "2026-10-20T15:00:00.000Z");
  assert.match(texto, /ACTA DE CONSENTIMIENTO INFORMADO PARA EXTRACCIÓN DE EVIDENCIA DIGITAL — TESTIGO/);
  assert.match(texto, /Expediente N\.º: 12345\/2026-1/);
  assert.match(texto, /Carátula: Gomez c\/ Escalante/);
  assert.match(texto, /Fiscalía \/ Dependencia: EQUIPO FISCAL Nº 14/);
  assert.match(texto, /a los 20 días del mes de octubre del año 2026/);
  assert.match(texto, /siendo las 12:00/);
  assert.match(texto, /en calidad de TESTIGO el\/la Sr\.\/Sra\. PEREZ MARIA LAURA, DNI N\.º 30\.111\.222/);
  assert.match(texto, /artículos 217, 218, 219, 220 y 225/);
  assert.match(texto, /su dispositivo móvil, marca no disponible, modelo no disponible, serie no disponible, IMEI no disponible/);
  assert.match(texto, /PRESTA SU CONSENTIMIENTO LIBRE, EXPRESO, INFORMADO Y VOLUNTARIO/);
  assert.match(texto, /Firma del testigo: _+/);
  assert.match(texto, /Firma del funcionario actuante: _+/);
  assert.match(texto, /Firma del secretario\/a o testigo de actuación, según corresponda: _+/);
  assert.equal(texto.includes("AVALOS FERNANDEZ JUAN MARCELO"), false);
});

test("el consentimiento del imputado usa el modelo de imputado", () => {
  const texto = textoConsentimiento(
    { ...cause, aportante: { ...cause.aportante, caracter: "aportante_imputado" } },
    "2026-10-20T15:00:00.000Z",
  );
  assert.match(texto, /EXTRACCIÓN DE EVIDENCIA DIGITAL — IMPUTADO/);
  assert.match(texto, /en calidad de IMPUTADO\/A/);
  assert.match(texto, /artículos 256, 257, 259 y 262/);
  assert.match(texto, /no está obligado\/a a declarar contra sí mismo\/a/);
  assert.match(texto, /Firma del abogado\/a defensor\/a: _+/);
  assert.equal(texto.includes("TESTIGO"), false);
  assert.equal(texto.includes("AVALOS FERNANDEZ JUAN MARCELO"), false);
});

test("el consentimiento del menor usa el modelo de menor", () => {
  const texto = textoConsentimiento(
    { ...cause, aportante: { ...cause.aportante, caracter: "aportante_menor" } },
    "2026-10-20T15:00:00.000Z",
  );
  assert.match(texto, /EXTRACCIÓN DE EVIDENCIA DIGITAL — MENOR DE EDAD/);
  assert.match(texto, /el\/la menor de edad PEREZ MARIA LAURA, DNI N\.º 30\.111\.222/);
  assert.match(texto, /artículos 91, 133, 134, 219, 225 y 225 bis/);
  assert.match(texto, /EXPRESA SU CONFORMIDAD LIBRE E INFORMADA/);
  assert.match(texto, /Firma de la Asesora de NNyA: _+/);
  assert.match(texto, /Firma del representante especial, si corresponde: _+/);
  assert.equal(texto.includes("IMPUTADO"), false);
  assert.equal(texto.includes("AVALOS FERNANDEZ JUAN MARCELO"), false);
});

test("el consentimiento deja constancia del motivo cuando no hay foto del DNI", () => {
  const texto = textoConsentimiento(
    {
      ...cause,
      aportante: { ...cause.aportante, dniFoto: false, sinFotoDni: true, motivoSinFoto: "El DNI se perdió." },
    },
    "2026-10-20T15:00:00.000Z",
  );
  assert.match(texto, /No se adjunta fotografía del documento nacional de identidad/);
  assert.match(texto, /Motivo consignado por el operador: El DNI se perdió/);
});

test("el consentimiento anonimizado no muestra nombre, DNI ni carácter", () => {
  const texto = textoConsentimiento(
    { ...cause, aportante: { ...cause.aportante, sinFotoDni: true, motivoSinFoto: "El DNI se perdió." } },
    "2026-10-20T15:00:00.000Z",
    true,
    [{ marca: "Google", modelo: "Pixel 8", serie: "1A2B3C4D5E6F", imei: "356938035643809" }],
  );
  assert.match(texto, /— TESTIGO/);
  assert.match(texto, /comparece en calidad de TESTIGO una persona aportante/);
  assert.equal(texto.includes("PEREZ MARIA LAURA"), false);
  assert.equal(texto.includes("30.111.222"), false);
  assert.equal(texto.includes("Aportante-testigo"), false);
  assert.match(texto, /su dispositivo móvil, marca Google, modelo Pixel 8, serie 1A2B3C4D5E6F, IMEI 356938035643809/);
  assert.match(texto, /Firma del testigo: _+/);
  assert.match(texto, /Firma del funcionario actuante: _+/);
  assert.equal(texto.includes("AVALOS FERNANDEZ JUAN MARCELO"), false);
  assert.equal(texto.includes("El DNI se perdió"), false);
});

test("el consentimiento es un Word y la firma queda debajo de la foto", async () => {
  const png = Buffer.alloc(32);
  png.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  png.writeUInt32BE(13, 4);
  png.write("IHDR", 12, "latin1");
  png.writeUInt32BE(1600, 16);
  png.writeUInt32BE(1000, 20);
  const docx = await docxConsentimiento(cause, png, "2026-10-20T15:00:00.000Z");
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  const dir = mkdtempSync(path.join(tmpdir(), "evidia-consentimiento-"));
  const file = path.join(dir, "consentimiento.docx");
  writeFileSync(file, docx);
  const xml = execFileSync("tar", ["-xOf", file, "word/document.xml"], { encoding: "utf8" });
  const foto = xml.indexOf("<w:drawing");
  const firma = xml.indexOf("Firma del testigo");
  assert.ok(foto > 0);
  assert.ok(firma > foto);
  assert.match(xml, /PEREZ MARIA LAURA/);
  assert.match(xml, /EXPRESO, INFORMADO Y VOLUNTARIO/);
  assert.match(xml, /artículos 217, 218, 219, 220 y 225/);
  assert.match(xml, /Firma del funcionario actuante/);
  assert.equal(xml.includes("AVALOS FERNANDEZ JUAN MARCELO"), false);
});
