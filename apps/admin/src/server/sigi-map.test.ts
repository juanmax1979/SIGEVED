import assert from "node:assert/strict";
import test from "node:test";
import { mapExpediente, mapUsuario, etiquetaDependencia } from "./sigi-map.js";
import { mismaDependencia } from "@espejo/shared";
import { dniDelUsuario } from "./store.js";

test("arma el usuario y sus dependencias de SIGI", () => {
  const mapped = mapUsuario([
    {
      COD_DEP: "FI14",
      NOMB_DEP: "EQUIPO FISCAL Nº 14",
      COD_CIRC_DEP: "1",
      DESC_CIRC_DEP: "PRIMERA CIRCUNSCRIPCION JUDICIAL",
      TITU_SUBROG: "TITULAR",
      NOMB_USUARIO: "AVALOS FERNANDEZ JUAN MARCELO",
    },
    {
      COD_DEP: "FI15",
      NOMB_DEP: "EQUIPO FISCAL Nº 15",
      COD_CIRC_DEP: "15",
      DESC_CIRC_DEP: "PRIMERA CIRCUNSCRIPCION JUDICIAL",
      TITU_SUBROG: "SUBROGA",
      NOMB_USUARIO: "AVALOS FERNANDEZ JUAN MARCELO",
    },
  ]);
  assert.equal(mapped.nombre, "AVALOS FERNANDEZ JUAN MARCELO");
  assert.equal(mapped.dependencias.length, 2);
  assert.equal(mapped.dependencias[0]?.id, "FI14");
  assert.equal(mapped.dependencias[0]?.rol, "TITULAR");
  assert.equal(mapped.dependencias[1]?.nombre, "EQUIPO FISCAL Nº 15");
  assert.equal(etiquetaDependencia(mapped.dependencias[1]!), "EQUIPO FISCAL Nº 15 · SUBROGA · PRIMERA CIRCUNSCRIPCION JUDICIAL");
});

test("completa la causa con el expediente de SIGI", () => {
  const mapped = mapExpediente(
    [
      {
        Expediente: "1/2021-1",
        CARATULA: "PEREZ JOSEFA S/ DENUNCIA VIOLENCIA FAMILIAR",
        Proceso: "DENUNCIA VIOLENCIA FAMILIAR",
        DependRadicExpte: "JUZGADO DE NIÑEZ, ADOLESCENCIA Y FAMILIA Nº 3",
      },
    ],
    "1/2021-1",
  );
  assert.equal(mapped.expediente, "1/2021-1");
  assert.equal(mapped.caratula, "PEREZ JOSEFA S/ DENUNCIA VIOLENCIA FAMILIAR");
  assert.equal(mapped.proceso, "DENUNCIA VIOLENCIA FAMILIAR");
  assert.equal(mapped.dependencia, "JUZGADO DE NIÑEZ, ADOLESCENCIA Y FAMILIA Nº 3");
  assert.equal(mismaDependencia(mapped.dependencia, "JUZGADO DE NIÑEZ, ADOLESCENCIA Y FAMILIA N° 3"), true);
  assert.equal(mismaDependencia(mapped.dependencia, "EQUIPO FISCAL Nº 14"), false);
});

test("vincula el DNI con el usuario de Windows y no reutiliza el de otra sesión", () => {
  const base = {
    windowsUser: "javalos",
    requested: "",
    vinculo: "",
    operator: { username: "javalos", dni: "27324828" },
    configured: "",
  };
  assert.equal(dniDelUsuario(base), "27324828");
  assert.equal(dniDelUsuario({ ...base, vinculo: "30111222", operator: null }), "30111222");
  assert.equal(dniDelUsuario({ ...base, operator: { username: "otro", dni: "30111222" } }), "");
  assert.equal(dniDelUsuario({ ...base, requested: "27.324.828" }), "27324828");
});
