import assert from "node:assert/strict";
import test from "node:test";
import { etiquetaDependencia } from "./sigi-map.js";
import { mapExpedienteIure, mapUsuarioIure } from "./iure-map.js";

test("arma las dependencias habilitadas de IURE", () => {
  const mapped = mapUsuarioIure([
    {
      dni: "23273906",
      name: "HEÑIN, Fernando",
      email: "fernando.henin@justiciachaco.gov.ar",
      IdDependencia: "490",
      NombreYLocalidad: "CAM. APELACIONES CIVIL Y COMERCIAL - SALA 4 - RESISTENCIA",
      IdFuero: "2",
      nombre: "Civil y Comercial",
      circ: "I",
      fecha_alta: "",
      fecha_baja: "",
    },
    {
      dni: "23273906",
      name: "HEÑIN, Fernando",
      IdDependencia: "491",
      NombreYLocalidad: "DEPENDENCIA DADA DE BAJA",
      IdFuero: "2",
      nombre: "Civil y Comercial",
      fecha_baja: "2020-01-01",
    },
  ]);
  assert.equal(mapped.nombre, "HEÑIN, Fernando");
  assert.equal(mapped.dependencias.length, 1);
  assert.equal(mapped.dependencias[0]?.id, "490");
  assert.equal(mapped.dependencias[0]?.fueroId, "2");
  assert.equal(mapped.dependencias[0]?.rol, "Civil y Comercial");
  assert.equal(
    etiquetaDependencia(mapped.dependencias[0]!),
    "CAM. APELACIONES CIVIL Y COMERCIAL - SALA 4 - RESISTENCIA · Civil y Comercial · IURE",
  );
});

test("completa la causa con el expediente de IURE", () => {
  const mapped = mapExpedienteIure(
    [{ IdExpediente: "10", nroexpediente: "155/2024", caratula: "PEREZ C/ GARCIA S/ DAÑOS", descripcion: "Daños y perjuicios" }],
    "155/2024",
    "CAM. APELACIONES CIVIL Y COMERCIAL - SALA 4 - RESISTENCIA",
  );
  assert.equal(mapped.expediente, "155/2024");
  assert.equal(mapped.caratula, "PEREZ C/ GARCIA S/ DAÑOS");
  assert.equal(mapped.proceso, "Daños y perjuicios");
  assert.equal(mapped.dependencia, "CAM. APELACIONES CIVIL Y COMERCIAL - SALA 4 - RESISTENCIA");
});
