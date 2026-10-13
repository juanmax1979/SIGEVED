import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const inSourceTree = path.basename(serverDir) === "server" && path.basename(path.dirname(serverDir)) === "src";

export const adminRoot = process.env.ESPEJO_ROOT
  ? path.resolve(process.env.ESPEJO_ROOT)
  : inSourceTree
    ? path.resolve(serverDir, "../..")
    : serverDir;
export const dataDir = path.resolve(process.env.ESPEJO_DATA_DIR ?? path.join(adminRoot, "data"));
export const filesDir = path.join(dataDir, "files");
export const dbPath = path.join(dataDir, "db.json");
export const clientDist = path.join(adminRoot, "dist");

export function ensureDataDirs(): void {
  mkdirSync(filesDir, { recursive: true });
}
