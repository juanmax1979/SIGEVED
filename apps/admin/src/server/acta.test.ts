import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { docxActa, marcoFoto, textoActa } from "./acta.js";

const data = {
  cause: {
    id: "11111111-1111-4111-8111-111111111111",
    caratula: "Gomez c/ Escalante",
    expediente: "12345/2026-1",
    tipo: "violencia_genero" as const,
    dependencia: "EQUIPO FISCAL Nº 14",
    oficina: "EQUIPO FISCAL Nº 14",
    proceso: "Denuncia",
    responsable: "AVALOS FERNANDEZ JUAN MARCELO",
    notas: "",
    aportante: {
      nombre: "PEREZ MARIA LAURA",
      dni: "30111222",
      caracter: "aportante_imputado" as const,
      caracterDetalle: "",
      dniFoto: false,
      anonimo: false,
      sinFotoDni: false,
      motivoSinFoto: "",
    },
    createdAt: "2026-10-19T13:00:00.000Z",
    updatedAt: "2026-10-19T13:00:00.000Z",
  },
  evidence: [],
  sessions: [
    {
      id: "sesion",
      caseId: "11111111-1111-4111-8111-111111111111",
      token: "token",
      code: "KCQV-757B",
      host: "http://127.0.0.1:4780",
      createdAt: "2026-10-19T13:00:00.000Z",
      expiresAt: "2026-10-19T15:00:00.000Z",
      status: "connected" as const,
      deviceName: "Pixel 8",
      imei: "356938035643809",
    },
  ],
  dispositivos: [
    {
      marca: "Google",
      modelo: "Pixel 8",
      serie: "1A2B3C4D5E6F",
      imei: "356938035643809",
    },
  ],
  generadoEn: "2026-10-19T16:00:00.000Z",
};

test("el acta sigue el modelo de extracción y deja constancia de la herramienta", () => {
  const texto = textoActa(data);
  assert.match(texto, /ACTA DE EXTRACCIÓN DE EVIDENCIA DIGITAL/);
  assert.match(texto, /Expediente N\.º: 12345\/2026-1/);
  assert.match(texto, /Carátula: Gomez c\/ Escalante/);
  assert.match(texto, /Fiscalía \/ Dependencia: EQUIPO FISCAL Nº 14/);
  assert.match(texto, /Lugar y fecha: Resistencia, 19 de octubre de 2026/);
  assert.match(texto, /siendo las 13:00/);
  assert.match(texto, /el\/la Sr\.\/Sra\. PEREZ MARIA LAURA, DNI N\.º 30\.111\.222/);
  assert.match(texto, /del dispositivo móvil marca Google, modelo Pixel 8, serie 1A2B3C4D5E6F, IMEI 356938035643809/);
  assert.match(texto, /mediante la herramienta SIGEVED/);
  assert.match(texto, /desactivar la depuración USB y las opciones de desarrollador/);
  assert.match(texto, /Ley 965-N/);
  assert.match(texto, /sin que en esta diligencia se obtuvieran archivos digitales/);
  assert.match(texto, /Firma del funcionario actuante: _+/);
  assert.match(texto, /Firma del responsable técnico: _+/);
  assert.match(texto, /Firma del testigo\/aportante: _+/);
  assert.equal(texto.includes("AVALOS FERNANDEZ JUAN MARCELO"), false);
});

test("el acta anonimizada no nombra a la persona ni muestra el DNI", () => {
  const texto = textoActa({ ...data, anonimo: true });
  assert.match(texto, /aportado voluntariamente por una persona aportante/);
  assert.match(texto, /marca Google, modelo Pixel 8, serie 1A2B3C4D5E6F, IMEI 356938035643809/);
  assert.equal(texto.includes("PEREZ MARIA LAURA"), false);
  assert.equal(texto.includes("30.111.222"), false);
  assert.equal(texto.includes("Aportante-imputado"), false);
  assert.match(texto, /No siendo para más, se da por finalizado el acto, previa lectura/);
  assert.equal(texto.includes("AVALOS FERNANDEZ JUAN MARCELO"), false);
});

test("el acta deja constancia del motivo cuando no hay foto del DNI", () => {
  const texto = textoActa({
    ...data,
    cause: {
      ...data.cause,
      aportante: { ...data.cause.aportante, sinFotoDni: true, motivoSinFoto: "El documento se perdió en un incendio." },
    },
  });
  assert.match(texto, /No se adjunta fotografía del documento nacional de identidad/);
  assert.match(texto, /Motivo consignado por el operador: El documento se perdió en un incendio/);
});

test("el acta nombra marca, modelo, serie e IMEI y marca lo que no se pudo leer", () => {
  const texto = textoActa({
    ...data,
    dispositivos: [{ marca: "Samsung", modelo: "", serie: "", imei: "" }],
  });
  assert.match(texto, /marca Samsung, modelo no disponible, serie no disponible, IMEI no disponible/);
});

test("la foto del DNI entra en un recuadro y no se agranda", () => {
  const apaisada = marcoFoto(2400, 800);
  assert.ok(apaisada.width <= 460);
  assert.ok(apaisada.height <= 250);
  assert.equal(apaisada.width, 460);
  const alta = marcoFoto(900, 2400);
  assert.equal(alta.height, 250);
  assert.ok(alta.width < 460);
  const chica = marcoFoto(80, 40);
  assert.equal(chica.width, 80);
  assert.equal(chica.height, 40);
});

test("el acta judicial es un Word editable y la firma queda después de la foto", async () => {
  const png = Buffer.alloc(32);
  png.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  png.writeUInt32BE(13, 4);
  png.write("IHDR", 12, "latin1");
  png.writeUInt32BE(1800, 16);
  png.writeUInt32BE(1200, 20);
  const docx = await docxActa(data, png);
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  const dir = mkdtempSync(path.join(tmpdir(), "evidia-acta-"));
  const file = path.join(dir, "acta.docx");
  writeFileSync(file, docx);
  const xml = execFileSync("tar", ["-xOf", file, "word/document.xml"], { encoding: "utf8" });
  const foto = xml.indexOf("<w:drawing");
  const firma = xml.indexOf("Firma del testigo/aportante");
  assert.ok(foto > 0);
  assert.ok(firma > foto);
  assert.match(xml, /ACTA DE EXTRACCIÓN DE EVIDENCIA DIGITAL/);
  assert.match(xml, /Ley 965-N/);
  assert.match(xml, /Firma del funcionario actuante/);
  assert.equal(xml.includes("AVALOS FERNANDEZ JUAN MARCELO"), false);
});
