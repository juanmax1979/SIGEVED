import type { ExpedienteSigi, UsuarioSigi } from "./sigi-map.js";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function mapUsuarioIure(rows: Record<string, unknown>[]): UsuarioSigi {
  const nombre = rows.map((row) => text(row.name)).find(Boolean) ?? "";
  const seen = new Set<string>();
  const dependencias: UsuarioSigi["dependencias"] = [];
  for (const row of rows) {
    if (text(row.fecha_baja)) continue;
    const id = text(row.IdDependencia);
    const nombreDep = text(row.NombreYLocalidad);
    const fueroId = text(row.IdFuero);
    if (!id || !nombreDep || !fueroId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const circ = text(row.circ);
    dependencias.push({
      id,
      nombre: nombreDep,
      rol: text(row.nombre),
      circunscripcion: circ.length > 2 ? circ : "",
      sistema: "iure",
      fueroId,
    });
  }
  return { nombre, dependencias };
}

export function mapExpedienteIure(rows: Record<string, unknown>[], numero: string, dependencia: string): ExpedienteSigi {
  const row = rows[0] ?? {};
  return {
    expediente: text(row.nroexpediente) || numero,
    caratula: text(row.caratula),
    dependencia,
    radicacion: dependencia,
    proceso: text(row.descripcion),
    columnas: Object.keys(row),
  };
}
