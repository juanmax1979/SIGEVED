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
      caracter: "declaracion_imputado" as const,
      caracterDetalle: "",
      dniFoto: false,
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
  generadoEn: "2026-10-19T16:00:00.000Z",
};

test("el acta sigue el modelo de extracción y deja constancia de la app", () => {
  const texto = textoActa(data);
  assert.match(texto, /Expte\. Nº 12345\/2026-1/);
  assert.match(texto, /En la ciudad de Resistencia, capital de la provincia del Chaco, a los 19 días del mes de octubre de 2026/);
  assert.match(texto, /autos caratulados: "Gomez c\/ Escalante"/);
  assert.match(texto, /se hace presente PEREZ MARIA LAURA, DNI 30\.111\.222, en carácter de Declaración de imputado/);
  assert.match(texto, /entrega voluntariamente el dispositivo Pixel 8, identificado como Pixel 8, IMEI 356938035643809/);
  assert.match(texto, /manipulado solo a los efectos de extraer la evidencia digital/);
  assert.match(texto, /se instalará una aplicación móvil la cual solo se utilizará a esos efectos/);
  assert.match(texto, /se procederá a su desinstalación del mismo/);
  assert.match(texto, /Luego el dispositivo es devuelto a la persona aportante/);
  assert.match(texto, /No siendo para más, finaliza el acto, previa íntegra lectura efectuada a viva voz por el actuario/);
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
  const firma = xml.indexOf("Firma del compareciente");
  assert.ok(foto > 0);
  assert.ok(firma > foto);
  assert.match(xml, /Resistencia/);
  assert.match(xml, /Ante mí/);
});
