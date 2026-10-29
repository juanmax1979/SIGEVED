import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.js";

const MAX_BYTES = 12 * 1024 * 1024;

function idValido(caseId: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(caseId);
}

export function rutaFotoDni(caseId: string): string | undefined {
  if (!idValido(caseId)) return undefined;
  for (const ext of [".jpg", ".png"]) {
    const file = path.join(dataDir, "aportantes", `${caseId}${ext}`);
    if (existsSync(file)) return file;
  }
  return undefined;
}

export function borrarFotoDni(caseId: string): void {
  if (!idValido(caseId)) return;
  for (const ext of [".jpg", ".png"]) {
    rmSync(path.join(dataDir, "aportantes", `${caseId}${ext}`), { force: true });
  }
}

export function errorFormatoFoto(buffer: Buffer): string {
  if (buffer.length < 32 || buffer.length > MAX_BYTES) {
    return "La foto del DNI no se puede leer. Sacala de nuevo, en JPG o PNG.";
  }
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (!jpeg && !png) return "La foto tiene que ser JPG o PNG.";
  return "";
}

export async function guardarFotoDni(caseId: string, origen: string): Promise<string> {
  if (!idValido(caseId)) return "No encontramos esa causa.";
  const buffer = readFileSync(origen);
  const error = errorFormatoFoto(buffer);
  if (error) return error;
  const ext = buffer[0] === 0x89 ? ".png" : ".jpg";
  const dir = path.join(dataDir, "aportantes");
  mkdirSync(dir, { recursive: true });
  borrarFotoDni(caseId);
  writeFileSync(path.join(dir, `${caseId}${ext}`), buffer);
  return "";
}
