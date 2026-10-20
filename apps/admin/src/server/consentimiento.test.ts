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
    caracter: "testimonial",
    caracterDetalle: "",
    dniFoto: true,
  },
  createdAt: "2026-10-20T13:00:00.000Z",
  updatedAt: "2026-10-20T13:00:00.000Z",
};

test("completa el formulario de consentimiento con los datos del aportante", () => {
  assert.equal(numeroTras("EQUIPO FISCAL N° 15", "EQUIPO FISCAL"), "15");
  assert.equal(numeroTras("Fiscalía de Instrucción Nº 8", "FISCALIA DE INSTRUCCION"), "8");
  const texto = textoConsentimiento(cause, "2026-10-20T15:00:00.000Z");
  assert.match(texto, /Formulario de consentimiento previo/);
  assert.match(texto, /CONSTE: que PEREZ MARIA LAURA, D\.N\.I\. Nº 30\.111\.222/);
  assert.match(texto, /Expediente Nº 12345\/2026-1, Equipo Fiscal Nº 14/);
  assert.equal(texto.includes("Fiscalía de Instrucción"), false);
  assert.match(texto, /Comparece en carácter de Testimonial/);
  assert.match(texto, /LUGAR: Resistencia/);
  assert.match(texto, /FECHA: 20 de octubre de 2026/);
  assert.match(texto, /FIRMA: \.{10,}/);
  assert.match(texto, /ACLARACION: PEREZ MARIA LAURA/);
  assert.match(texto, /no se afectará su privacidad e intimidad/);
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
  const firma = xml.indexOf("FIRMA:");
  assert.ok(foto > 0);
  assert.ok(firma > foto);
  assert.match(xml, /PEREZ MARIA LAURA/);
  assert.match(xml, /consentimiento expreso/);
});
