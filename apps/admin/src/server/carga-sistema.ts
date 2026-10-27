import { claveExpediente } from "@espejo/shared";
import { cargasEvidenciaMock } from "./carga-evidencia.mock.js";

export type CargaEvidencia = {
  cargada: boolean;
  sistema: "" | "sigi" | "iure";
  detalle: string;
};

export type ArchivoEvidencia = {
  filename: string;
  storedName: string;
  sha256: string;
};

export type ConsultaIncorporacion = {
  indice: number;
  expediente: string;
  nombre: string;
  sha256: string;
};

export type DecisionCarga =
  | { tipo: "resuelta"; carga: CargaEvidencia }
  | { tipo: "consultar"; consultas: ConsultaIncorporacion[] };

const avisoProvisorio =
  "Un registro provisorio no se puede eliminar hasta que tenga número de expediente definitivo y la evidencia esté incorporada en SIGI o IURE.";
const avisoPendiente = "Se habilita cuando la evidencia esté incorporada en SIGI o IURE.";
const avisoSinPaquete = "Se habilita cuando el paquete de evidencia esté incorporado en SIGI.";

export function esOficinaIure(oficina: string | undefined): boolean {
  const ultimo = (oficina ?? "")
    .split("·")
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  return ultimo?.toUpperCase() === "IURE";
}

export function indicaIncorporacion(valor: unknown): boolean {
  const value = String(valor ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

function lista(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

export function incorporacionesDesdeSql(payload: unknown, cantidad: number): boolean[] {
  const raiz =
    payload && typeof payload === "object" && "resultados" in payload
      ? (payload as { resultados: unknown }).resultados
      : payload;
  const lotes = lista(raiz).map((item) => {
    const rows = item && typeof item === "object" && "rows" in item ? (item as { rows: unknown }).rows : item;
    return lista(rows).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  });
  if (lotes.length !== cantidad) throw new Error("SIGI no devolvió la verificación de todos los archivos.");
  return lotes.map((rows) => rows.some((row) => indicaIncorporacion(row.Existe ?? row.existe)));
}

function cargaIure(expediente: string): CargaEvidencia {
  const clave = claveExpediente(expediente);
  const encontrada = cargasEvidenciaMock.find((item) => item.sistema === "iure" && claveExpediente(item.expediente) === clave);
  if (!encontrada) return { cargada: false, sistema: "", detalle: avisoPendiente };
  return { cargada: true, sistema: "iure", detalle: "La evidencia figura cargada en IURE." };
}

export type PaqueteEvidencia = { nombre: string; sha256: string };

export function decidirCarga(
  cause: { expediente?: string; provisorio?: boolean; oficina?: string },
  paquete?: PaqueteEvidencia,
): DecisionCarga {
  if (cause.provisorio) return { tipo: "resuelta", carga: { cargada: false, sistema: "", detalle: avisoProvisorio } };
  const expediente = (cause.expediente ?? "").trim();
  if (!expediente) return { tipo: "resuelta", carga: { cargada: false, sistema: "", detalle: avisoPendiente } };
  if (esOficinaIure(cause.oficina)) return { tipo: "resuelta", carga: cargaIure(expediente) };
  const sha256 = paquete?.sha256.trim().toLowerCase() ?? "";
  const nombre = paquete?.nombre.trim().slice(0, 260) ?? "";
  if (!nombre || !/^[a-f0-9]{64}$/.test(sha256)) {
    return { tipo: "resuelta", carga: { cargada: false, sistema: "", detalle: avisoSinPaquete } };
  }
  return {
    tipo: "consultar",
    consultas: [{ indice: 0, expediente: expediente.slice(0, 50), nombre, sha256 }],
  };
}

export async function consultarCargas(
  entradas: { cause: { expediente?: string; provisorio?: boolean; oficina?: string }; paquete?: PaqueteEvidencia }[],
  verificar: (consultas: ConsultaIncorporacion[]) => Promise<boolean[]>,
): Promise<CargaEvidencia[]> {
  const decisiones = entradas.map((entrada) => decidirCarga(entrada.cause, entrada.paquete));
  const cargas: CargaEvidencia[] = decisiones.map((decision) =>
    decision.tipo === "resuelta" ? decision.carga : { cargada: false, sistema: "", detalle: avisoSinPaquete },
  );
  const pendientes = decisiones.flatMap((decision, index) => (decision.tipo === "consultar" ? [{ index, consultas: decision.consultas }] : []));
  if (pendientes.length === 0) return cargas;
  const planas = pendientes.flatMap((item) => item.consultas);
  const unicas: ConsultaIncorporacion[] = [];
  const posiciones = planas.map((consulta) => {
    const clave = `${consulta.expediente}\n${consulta.nombre}\n${consulta.sha256}`;
    const existente = unicas.findIndex((item) => `${item.expediente}\n${item.nombre}\n${item.sha256}` === clave);
    if (existente >= 0) return existente;
    unicas.push(consulta);
    return unicas.length - 1;
  });
  try {
    const flagsUnicas = await verificar(unicas);
    if (flagsUnicas.length !== unicas.length) throw new Error("SIGI no devolvió la verificación de todos los archivos.");
    const flags = posiciones.map((posicion) => flagsUnicas[posicion]);
    let cursor = 0;
    for (const pendiente of pendientes) {
      const parte = flags.slice(cursor, cursor + pendiente.consultas.length);
      cursor += pendiente.consultas.length;
      const paquete = entradas[pendiente.index].paquete;
      cargas[pendiente.index] = resumirIncorporacion(
        [{ filename: paquete?.nombre ?? "paquete", storedName: "", sha256: paquete?.sha256 ?? "" }],
        pendiente.consultas,
        parte,
      );
    }
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "No se pudo consultar SIGI.";
    for (const pendiente of pendientes) cargas[pendiente.index] = { cargada: false, sistema: "", detalle };
  }
  return cargas;
}

export function resumirIncorporacion(
  evidence: ArchivoEvidencia[],
  consultas: ConsultaIncorporacion[],
  flags: boolean[],
): CargaEvidencia {
  if (flags.length !== consultas.length) throw new Error("SIGI no devolvió la verificación de todos los archivos.");
  const faltantes: string[] = [];
  evidence.forEach((item, indice) => {
    const posiciones = consultas.flatMap((consulta, posicion) => (consulta.indice === indice ? [posicion] : []));
    const incorporado = posiciones.length > 0 && posiciones.some((posicion) => flags[posicion]);
    if (!incorporado) faltantes.push(item.filename.trim() || "archivo sin nombre");
  });
  if (faltantes.length === 0) {
    return { cargada: true, sistema: "sigi", detalle: "La evidencia figura incorporada en SIGI." };
  }
  const muestra = faltantes.slice(0, 3).join(", ");
  const resto = faltantes.length > 3 ? ` y ${faltantes.length - 3} archivos más` : "";
  return { cargada: false, sistema: "", detalle: `Falta incorporar en SIGI: ${muestra}${resto}.` };
}
