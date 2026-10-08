import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir } from "./paths.js";
import { mapExpediente, mapUsuario, type ExpedienteSigi, type UsuarioSigi } from "./sigi-map.js";

const USER_PROC = "procNumeradorDatosUsuarioSIGI_DepsCircNomyApe";
const EXPTE_PROC = "procNumeradorDatosExpteCaratProcDepRadic";
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "sigi.ps1");

type SigiConfig = {
  server: string;
  database: string;
  user?: string;
  password?: string;
  dni?: string;
};

type SigiParameter = {
  name: string;
  type: string;
  mode: string;
};

const described = new Map<string, { schema: string; parameters: SigiParameter[] }>();

export function windowsUser(): string {
  return process.env.USERNAME || "usuario";
}

export function sigiConfig(): SigiConfig | undefined {
  const file = path.join(dataDir, "sigi.json");
  let fromFile: Partial<SigiConfig> = {};
  if (existsSync(file)) {
    fromFile = JSON.parse(readFileSync(file, "utf8")) as Partial<SigiConfig>;
  }
  const server = String(fromFile.server || process.env.SIGI_SERVER || "").trim();
  const database = String(fromFile.database || process.env.SIGI_DATABASE || "").trim();
  if (!server || !database) return undefined;
  if (/[;\r\n]/.test(server) || /[;\r\n]/.test(database)) {
    throw new Error("El servidor o la base de SIGI no son válidos.");
  }
  return {
    server,
    database,
    user: fromFile.user || process.env.SIGI_USER,
    password: fromFile.password || process.env.SIGI_PASSWORD,
    dni: String(fromFile.dni || process.env.SIGI_DNI || "").replace(/\D/g, ""),
  };
}

function connectionString(config: SigiConfig): string {
  const base = `Server=${config.server};Database=${config.database};TrustServerCertificate=True;Connection Timeout=8`;
  if (config.user) return `${base};User ID=${config.user};Password=${config.password ?? ""}`;
  return `${base};Integrated Security=True`;
}

function runSql(payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: true },
    );
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("SIGI no respondió a tiempo."));
    }, 20000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(err).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(stderr || "No se pudo consultar SIGI."));
        return;
      }
      const stdout = Buffer.concat(out).toString("utf8").trim();
      try {
        resolve(stdout ? JSON.parse(stdout) : []);
      } catch {
        reject(new Error("SIGI devolvió una respuesta que no se pudo leer."));
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function describe(config: SigiConfig, procedure: string): Promise<{ schema: string; parameters: SigiParameter[] }> {
  const cached = described.get(procedure);
  if (cached) return cached;
  const result = (await runSql({
    connectionString: connectionString(config),
    action: "describe",
    procedure,
  })) as { schema?: string; parameters?: SigiParameter[] };
  if (!result.schema) throw new Error(`SIGI no tiene el procedimiento ${procedure}.`);
  const parameters = Array.isArray(result.parameters) ? result.parameters : result.parameters ? [result.parameters] : [];
  const value = { schema: result.schema, parameters };
  described.set(procedure, value);
  return value;
}

function chooseParameter(parameters: SigiParameter[], hints: string[]): SigiParameter | undefined {
  const inputs = parameters.filter((item) => item.mode === "IN");
  if (inputs.length === 0) return undefined;
  if (inputs.length === 1) return inputs[0];
  return inputs.find((item) => hints.some((hint) => item.name.toLowerCase().includes(hint)));
}

const NUMERIC_TYPES = ["int", "bigint", "smallint", "tinyint", "decimal", "numeric", "float", "real"];

function sqlValue(parameter: SigiParameter, value: string): string {
  if (!NUMERIC_TYPES.includes(parameter.type.toLowerCase())) return value;
  const digits = value.replace(/\D/g, "");
  if (!digits) throw new Error("SIGI identifica al usuario por DNI. Escribí el número, sin puntos.");
  return digits;
}

async function execProc(procedure: string, value: string, hints: string[]): Promise<Record<string, unknown>[]> {
  const config = sigiConfig();
  if (!config) throw new Error("Falta apps/admin/data/sigi.json con el servidor y la base de SIGI.");
  const info = await describe(config, procedure);
  const parameter = chooseParameter(info.parameters, hints);
  if (info.parameters.filter((item) => item.mode === "IN").length > 1 && !parameter) {
    const names = info.parameters.map((item) => item.name).join(", ");
    throw new Error(`No sé qué parámetro usar en ${procedure}. Tiene: ${names}.`);
  }
  const rows = await runSql({
    connectionString: connectionString(config),
    action: "exec",
    procedure,
    schema: info.schema,
    parameter: parameter ? { name: parameter.name, type: parameter.type, value: sqlValue(parameter, value) } : undefined,
  });
  if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  if (rows && typeof rows === "object") return [rows as Record<string, unknown>];
  return [];
}

export async function usuarioPideDni(): Promise<boolean> {
  const config = sigiConfig();
  if (!config) return false;
  const info = await describe(config, USER_PROC);
  const parameter = chooseParameter(info.parameters, ["dni", "usuario", "login", "cuil", "operador"]);
  if (!parameter) return false;
  return NUMERIC_TYPES.includes(parameter.type.toLowerCase()) || parameter.name.toLowerCase().includes("dni");
}

export function dniConfigurado(): string {
  return sigiConfig()?.dni ?? "";
}

export async function datosUsuario(dni: string): Promise<UsuarioSigi> {
  const rows = await execProc(USER_PROC, dni, ["dni", "usuario", "login", "cuil", "operador"]);
  return mapUsuario(rows);
}

export async function datosExpediente(numero: string): Promise<ExpedienteSigi> {
  const rows = await execProc(EXPTE_PROC, numero, ["nroexpediente", "expediente", "nroexpte"]);
  const mapped = mapExpediente(rows, numero);
  if (!mapped.caratula && !mapped.dependencia) {
    const columnas = mapped.columnas.length ? mapped.columnas.join(", ") : "ninguna";
    throw new Error(`SIGI no devolvió carátula ni dependencia. Columnas: ${columnas}.`);
  }
  return mapped;
}
