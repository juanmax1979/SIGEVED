import assert from "node:assert/strict";
import test from "node:test";
import {
  consultarCargas,
  decidirCarga,
  incorporacionesDesdeSql,
  indicaIncorporacion,
  resumirIncorporacion,
} from "./carga-sistema.js";

const hash = "a".repeat(64);
const paquete = { nombre: "18326-2017-PABLO-PEREZ-EV.zip", sha256: hash };

test("un registro provisorio no se consulta en SIGI", () => {
  const decision = decidirCarga({ provisorio: true, expediente: "18326/2017-1" }, paquete);
  assert.equal(decision.tipo, "resuelta");
  if (decision.tipo === "resuelta") {
    assert.equal(decision.carga.cargada, false);
    assert.match(decision.carga.detalle, /provisorio/i);
  }
});

test("IURE sigue con el mock y SIGI espera el paquete", () => {
  const iure = decidirCarga({ expediente: "3921/2026-1-C", oficina: "Juzgado · IURE" });
  assert.equal(iure.tipo, "resuelta");
  if (iure.tipo === "resuelta") assert.equal(iure.carga.cargada, true);
  const sinPaquete = decidirCarga({ expediente: "18326/2017-1", oficina: "Equipo fiscal" });
  assert.equal(sinPaquete.tipo, "resuelta");
  if (sinPaquete.tipo === "resuelta") assert.match(sinPaquete.carga.detalle, /paquete/i);
});

test("habilita el borrado cuando SIGI tiene el paquete", () => {
  const decision = decidirCarga({ expediente: "18326/2017-1" }, paquete);
  assert.equal(decision.tipo, "consultar");
  if (decision.tipo !== "consultar") return;
  assert.equal(decision.consultas[0]?.nombre, paquete.nombre);
  const cargada = resumirIncorporacion(
    [{ filename: paquete.nombre, storedName: "", sha256: hash }],
    decision.consultas,
    [true],
  );
  assert.equal(cargada.cargada, true);
  assert.equal(cargada.sistema, "sigi");
  const falta = resumirIncorporacion(
    [{ filename: paquete.nombre, storedName: "", sha256: hash }],
    decision.consultas,
    [false],
  );
  assert.equal(falta.cargada, false);
  assert.match(falta.detalle, /18326-2017-PABLO-PEREZ-EV\.zip/);
});

test("interpreta la respuesta de usp_PruebaDigital_VerificarIncorporacion", () => {
  assert.equal(indicaIncorporacion("True"), true);
  assert.equal(indicaIncorporacion("1"), true);
  assert.equal(indicaIncorporacion("False"), false);
  assert.deepEqual(incorporacionesDesdeSql({ resultados: { rows: { Existe: "True" } } }, 1), [true]);
  assert.deepEqual(
    incorporacionesDesdeSql({ resultados: [{ rows: [{ Existe: "0" }] }, { rows: [{ Existe: "1" }] }] }, 2),
    [false, true],
  );
});

test("si SIGI no responde, el borrado sigue deshabilitado", async () => {
  const [carga] = await consultarCargas([{ cause: { expediente: "18326/2017-1" }, paquete }], async () => {
    throw new Error("SIGI no respondió a tiempo.");
  });
  assert.equal(carga.cargada, false);
  assert.match(carga.detalle, /no respondió/);
});
