import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

export const adminRoot = path.resolve(serverDir, "../..");
export const dataDir = path.resolve(process.env.ESPEJO_DATA_DIR ?? path.join(adminRoot, "data"));
export const filesDir = path.join(dataDir, "files");
export const dbPath = path.join(dataDir, "db.json");
export const clientDist = path.join(adminRoot, "dist");

export function ensureDataDirs(): void {
  mkdirSync(filesDir, { recursive: true });
}
