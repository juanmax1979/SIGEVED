import { claveExpediente } from "@espejo/shared";
import { cargasEvidenciaMock } from "./carga-evidencia.mock.js";

export type CargaEvidencia = {
  cargada: boolean;
  sistema: "" | "sigi" | "iure";
  detalle: string;
};

const avisoProvisorio =
  "Un registro provisorio no se puede eliminar hasta que tenga número de expediente definitivo y la evidencia esté cargada en SIGI o IURE.";
const avisoPendiente = "Se habilita cuando la evidencia esté cargada en SIGI o IURE.";

export function consultaCargaEvidencia(cause: { expediente?: string; provisorio?: boolean }): CargaEvidencia {
  if (cause.provisorio) return { cargada: false, sistema: "", detalle: avisoProvisorio };
  const clave = claveExpediente(cause.expediente ?? "");
  if (!clave) return { cargada: false, sistema: "", detalle: avisoPendiente };
  const encontrada = cargasEvidenciaMock.find((item) => claveExpediente(item.expediente) === clave);
  if (!encontrada) return { cargada: false, sistema: "", detalle: avisoPendiente };
  const sistema = encontrada.sistema === "iure" ? "IURE" : "SIGI";
  return {
    cargada: true,
    sistema: encontrada.sistema,
    detalle: `La evidencia figura cargada en ${sistema}.`,
  };
}
