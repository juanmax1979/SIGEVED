import assert from "node:assert/strict";
import test from "node:test";
import { consultaCargaEvidencia } from "./carga-sistema.js";

test("solo habilita el borrado si el mock dice que la evidencia ya está en SIGI o IURE", () => {
  assert.equal(consultaCargaEvidencia({ expediente: "" }).cargada, false);
  assert.equal(consultaCargaEvidencia({ expediente: "1/2020-1" }).cargada, false);
  assert.equal(consultaCargaEvidencia({ expediente: "18326 / 2017-1" }).sistema, "sigi");
  assert.equal(consultaCargaEvidencia({ expediente: "3921/2026-1-C" }).sistema, "iure");
  assert.equal(consultaCargaEvidencia({ expediente: "3921/2026-1-C" }).cargada, true);
});

test("un registro provisorio no se puede eliminar aunque el expediente figure cargado", () => {
  const carga = consultaCargaEvidencia({ provisorio: true, expediente: "18326/2017-1" });
  assert.equal(carga.cargada, false);
  assert.match(carga.detalle, /provisorio/i);
  assert.match(carga.detalle, /definitivo/i);
});
