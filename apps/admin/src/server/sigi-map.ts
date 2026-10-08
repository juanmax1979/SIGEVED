export type DependenciaSigi = {
  id: string;
  nombre: string;
  circunscripcion: string;
  rol: string;
};

export type UsuarioSigi = {
  nombre: string;
  dependencias: DependenciaSigi[];
};

export type ExpedienteSigi = {
  expediente: string;
  caratula: string;
  dependencia: string;
  radicacion: string;
  proceso: string;
  columnas: string[];
};

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function cell(row: Record<string, unknown>, hints: string[], avoid: string[] = []): string {
  const entries = Object.entries(row).filter(([key]) => !avoid.some((token) => norm(key).includes(token)));
  for (const hint of hints) {
    const exact = entries.find(([key]) => norm(key) === hint);
    if (exact && text(exact[1])) return text(exact[1]);
  }
  for (const hint of hints) {
    const partial = entries.find(([key]) => norm(key).includes(hint));
    if (partial && text(partial[1])) return text(partial[1]);
  }
  return "";
}

function personName(row: Record<string, unknown>): string {
  const sigi = cell(row, ["nombusuario"]);
  if (sigi) return sigi;
  const avoid = ["dependencia", "circunscripcion", "expediente", "usuario", "login"];
  const completo = cell(row, ["nomyape", "nombreapellido", "apellidonombre", "apenom"], avoid);
  if (completo) return completo;
  const apellido = cell(row, ["apellido"], avoid);
  const nombre = cell(row, ["nombre", "nombres"], avoid);
  if (apellido && nombre) return `${apellido}, ${nombre}`;
  return apellido || nombre;
}

export function etiquetaDependencia(item: DependenciaSigi): string {
  return [item.nombre, item.rol, item.circunscripcion].filter(Boolean).join(" · ");
}

export function mapUsuario(rows: Record<string, unknown>[]): UsuarioSigi {
  const nombre = rows.map(personName).find(Boolean) ?? "";
  const seen = new Set<string>();
  const dependencias: DependenciaSigi[] = [];
  for (const row of rows) {
    const nombreDep = cell(row, ["nombdep", "dependencia", "nomdep", "descdep"]);
    if (!nombreDep) continue;
    const id = cell(row, ["coddep", "iddependencia", "coddependencia", "iddep"]) || nombreDep;
    const circunscripcion = cell(row, ["desccircdep", "circunscripcion"]);
    const rol = cell(row, ["titusubrog"]);
    const key = norm(id);
    if (seen.has(key)) continue;
    seen.add(key);
    dependencias.push({ id, nombre: nombreDep, circunscripcion, rol });
  }
  return { nombre, dependencias };
}

export function mapExpediente(rows: Record<string, unknown>[], numero: string): ExpedienteSigi {
  const row = rows[0] ?? {};
  const radicacion = cell(row, ["dependradicexpte", "radicacion", "depradic"]);
  const dependencia = cell(row, ["dependencia", "nombdep", "nomdep"]) || radicacion;
  return {
    expediente: cell(row, ["expediente", "nroexpediente", "nroexpte"]) || numero,
    caratula: cell(row, ["caratula", "carat"]),
    dependencia,
    radicacion,
    proceso: cell(row, ["proceso", "procedimiento"]),
    columnas: Object.keys(row),
  };
}
