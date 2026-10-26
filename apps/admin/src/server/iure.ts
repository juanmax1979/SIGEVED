import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.js";
import { mapExpedienteIure, mapUsuarioIure } from "./iure-map.js";
import { consultarSql } from "./sigi.js";
import type { ExpedienteSigi, UsuarioSigi } from "./sigi-map.js";

const LOGIN_PROC = "spGetDatosLoginNumerador";
const EXPTE_PROC = "spGetDatosExpedienteNumerador";

type IureConfig = {
  server: string;
  port: string;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
};

type IureParameter = {
  name: string;
  type: string;
  value: string;
};

export function mensajeSinIure(): string {
  return `Falta ${path.join(dataDir, "iure.json")} con el servidor y la base de IURE.`;
}

export function iureConfig(): IureConfig | undefined {
  const file = path.join(dataDir, "iure.json");
  if (!existsSync(file)) return undefined;
  const fromFile = JSON.parse(readFileSync(file, "utf8")) as Partial<IureConfig & { trustCert?: boolean }>;
  const server = String(fromFile.server || process.env.IURE_SQLSERVER_HOST || "").trim();
  const database = String(fromFile.database || process.env.IURE_SQLSERVER_DATABASE || "").trim();
  const user = String(fromFile.user || process.env.IURE_SQLSERVER_USER || "").trim();
  const password = String(fromFile.password || process.env.IURE_SQLSERVER_PASSWORD || "");
  const port = String(fromFile.port || process.env.IURE_SQLSERVER_PORT || "1433").trim();
  if (!server || !database || !user || !password) return undefined;
  if ([server, database, user, port].some((value) => /[;\r\n]/.test(value)) || /[\r\n;]/.test(password)) {
    throw new Error("La conexión a IURE no es válida.");
  }
  return {
    server,
    port,
    database,
    user,
    password,
    encrypt: fromFile.encrypt === true || process.env.IURE_SQLSERVER_ENCRYPT === "true",
  };
}

function connectionString(config: IureConfig): string {
  const encrypt = config.encrypt ? "True" : "False";
  return `Server=${config.server},${config.port};Database=${config.database};User ID=${config.user};Password=${config.password};Encrypt=${encrypt};TrustServerCertificate=True;Connection Timeout=8`;
}

async function execIure(procedure: string, parameters: IureParameter[]): Promise<Record<string, unknown>[]> {
  const config = iureConfig();
  if (!config) throw new Error(mensajeSinIure());
  const rows = await consultarSql(
    {
      connectionString: connectionString(config),
      action: "exec",
      procedure,
      schema: "dbo",
      parameters,
    },
    "IURE",
  );
  if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  if (rows && typeof rows === "object") return [rows as Record<string, unknown>];
  return [];
}

export async function cuentaIure(login: string): Promise<{ usuario: UsuarioSigi; dni: string }> {
  const rows = await execIure(LOGIN_PROC, [{ name: "@login", type: "varchar", value: login.trim() }]);
  const dni = rows.map((row) => String(row.dni ?? "").replace(/\D/g, "")).find(Boolean) ?? "";
  return { usuario: mapUsuarioIure(rows), dni };
}

export async function datosUsuarioIure(login: string): Promise<UsuarioSigi> {
  return (await cuentaIure(login)).usuario;
}

export async function datosExpedienteIure(numero: string, idDependencia: string, idFuero: string, dependencia: string): Promise<ExpedienteSigi> {
  const dependenciaId = idDependencia.replace(/\D/g, "");
  const fueroId = idFuero.replace(/\D/g, "");
  if (!dependenciaId || !fueroId) throw new Error("Elegí una dependencia de IURE antes de consultar el expediente.");
  const rows = await execIure(EXPTE_PROC, [
    { name: "@NroExpedienteEnviado", type: "varchar", value: numero.trim() },
    { name: "@IdDependencia", type: "int", value: dependenciaId },
    { name: "@IdFuero", type: "int", value: fueroId },
  ]);
  const mapped = mapExpedienteIure(rows, numero, dependencia);
  if (!mapped.caratula) throw new Error("IURE no tiene ese expediente en la dependencia elegida.");
  return mapped;
}
