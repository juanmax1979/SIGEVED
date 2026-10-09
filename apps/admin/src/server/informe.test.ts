import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { escribirInformePdf } from "./informe.js";

test("arma un informe PDF institucional con la huella del paquete", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "evidia-informe-"));
  const file = path.join(dir, "informe.pdf");
  const sha256 = "061ac265a80913449e5c4f68b3fbd694c3d70bf02e26cdc3a2843ba9a44eaf16";
  await escribirInformePdf(file, {
    cause: {
      id: "causa",
      caratula: "Gomez c/ Escalante S/ Violencia Domestica",
      expediente: "12345/2026-1",
      tipo: "violencia_genero",
      dependencia: "Juzgado de ejemplo",
      oficina: "EQUIPO FISCAL Nº 15",
      proceso: "Denuncia",
      responsable: "AVALOS FERNANDEZ JUAN MARCELO",
      notas: "",
      createdAt: "2026-10-09T10:00:00.000Z",
      updatedAt: "2026-10-09T10:00:00.000Z",
    },
    evidence: [],
    sessions: [
      {
        id: "sesion",
        caseId: "causa",
        token: "token",
        code: "KCQV-757B",
        host: "http://127.0.0.1:4780",
        createdAt: "2026-10-09T10:00:00.000Z",
        expiresAt: "2026-10-09T12:00:00.000Z",
        status: "connected",
        deviceName: "23122PCD1G",
        imei: "356938035643809",
      },
    ],
    sha256,
    generadoEn: "2026-10-09T13:00:00.000Z",
  });
  const pdf = readFileSync(file);
  const text = pdf.toString("latin1");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal((text.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.match(text, /Poder Judicial del Chaco/);
  assert.match(text, /333536393338303335363433383039/);
  assert.match(text, new RegExp(Buffer.from(sha256).toString("hex")));
});
