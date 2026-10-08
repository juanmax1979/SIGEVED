import { randomBytes, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  CaseRecord,
  CatalogItem,
  EvidenceRecord,
  PairingSession,
  PullRequest,
} from "@espejo/shared";
import { dataDir, dbPath, ensureDataDirs, filesDir } from "./paths.js";

export type OperatorSession = {
  username: string;
  nombre: string;
  dni: string;
  oficinaId: string;
  oficinaNombre: string;
};

export type Database = {
  adminToken: string;
  cases: CaseRecord[];
  sessions: PairingSession[];
  evidence: EvidenceRecord[];
  pulls: PullRequest[];
  catalogs: Record<string, CatalogItem[]>;
  operator: OperatorSession | null;
  vinculos: Record<string, string>;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function emptyDb(): Database {
  return {
    adminToken: randomBytes(24).toString("hex"),
    cases: [],
    sessions: [],
    evidence: [],
    pulls: [],
    catalogs: {},
    operator: null,
    vinculos: {},
  };
}

function readDb(): Database {
  ensureDataDirs();
  if (!existsSync(dbPath)) {
    const created = emptyDb();
    writeFileSync(dbPath, JSON.stringify(created, null, 2));
    return created;
  }
  const parsed = JSON.parse(readFileSync(dbPath, "utf8")) as Database;
  return {
    ...emptyDb(),
    ...parsed,
    catalogs: parsed.catalogs ?? {},
    pulls: parsed.pulls ?? [],
    operator: parsed.operator ?? null,
    vinculos: parsed.vinculos ?? {},
    cases: (parsed.cases ?? []).map((item) => ({
      ...item,
      oficina: item.oficina ?? "",
      proceso: item.proceso ?? "",
    })),
  };
}

let chain: Promise<unknown> = Promise.resolve();

function mutate<T>(fn: (db: Database) => T): Promise<T> {
  const run = chain.then(() => {
    const db = readDb();
    const result = fn(db);
    const tmp = `${dbPath}.tmp`;
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(tmp, JSON.stringify(db, null, 2));
    renameSync(tmp, dbPath);
    return result;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function readSnapshot(): Database {
  return readDb();
}

export function getAdminToken(): string {
  return readDb().adminToken;
}

export function getOperator(): OperatorSession | null {
  return readDb().operator;
}

export function setOperator(operator: OperatorSession): Promise<OperatorSession> {
  return mutate((db) => {
    db.operator = operator;
    const dni = operator.dni.replace(/\D/g, "");
    if (operator.username && dni) db.vinculos[operator.username.toLowerCase()] = dni;
    return operator;
  });
}

export function getVinculo(username: string): string {
  return readDb().vinculos[username.toLowerCase()] ?? "";
}

export function setVinculo(username: string, dni: string): Promise<void> {
  return mutate((db) => {
    const digits = dni.replace(/\D/g, "");
    if (username && digits) db.vinculos[username.toLowerCase()] = digits;
  });
}

export function dniDelUsuario(input: {
  windowsUser: string;
  requested: string;
  vinculo: string;
  operator: { username: string; dni: string } | null;
  configured: string;
}): string {
  const requested = input.requested.replace(/\D/g, "");
  if (requested) return requested;
  const key = input.windowsUser.toLowerCase();
  const linked = input.vinculo.replace(/\D/g, "");
  if (linked) return linked;
  if (input.operator && input.operator.username.toLowerCase() === key) {
    const dni = input.operator.dni.replace(/\D/g, "");
    if (dni) return dni;
  }
  return input.configured.replace(/\D/g, "");
}

export function createCase(
  input: Omit<CaseRecord, "id" | "createdAt" | "updatedAt">,
): Promise<CaseRecord> {
  return mutate((db) => {
    const now = new Date().toISOString();
    const record: CaseRecord = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    db.cases.unshift(record);
    return record;
  });
}

export function updateCase(
  id: string,
  patch: Partial<Omit<CaseRecord, "id" | "createdAt">>,
): Promise<CaseRecord | undefined> {
  return mutate((db) => {
    const found = db.cases.find((item) => item.id === id);
    if (!found) return undefined;
    Object.assign(found, patch, { updatedAt: new Date().toISOString() });
    return found;
  });
}

export function makePairingCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function createSession(caseId: string, host: string): Promise<PairingSession | undefined> {
  return mutate((db) => {
    const cause = db.cases.find((item) => item.id === caseId);
    if (!cause) return undefined;
    const now = new Date();
    const session: PairingSession = {
      id: randomUUID(),
      caseId,
      token: randomBytes(24).toString("hex"),
      code: makePairingCode(),
      host,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 2).toISOString(),
      status: "waiting",
    };
    db.sessions.unshift(session);
    db.catalogs[session.id] = [];
    return session;
  });
}

export function closeSession(sessionId: string): Promise<PairingSession | undefined> {
  return mutate((db) => {
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) return undefined;
    session.status = "closed";
    return session;
  });
}

function activeSession(db: Database, tokenOrCode: string): PairingSession | undefined {
  const key = tokenOrCode.trim().toUpperCase();
  const session = db.sessions.find(
    (item) => item.token === tokenOrCode || item.code.toUpperCase() === key,
  );
  if (!session) return undefined;
  if (session.status === "closed") return undefined;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = "closed";
    return undefined;
  }
  return session;
}

export function connectDevice(input: {
  tokenOrCode: string;
  deviceId: string;
  deviceName: string;
  contributorName: string;
}): Promise<{ session: PairingSession; caratula: string } | undefined> {
  return mutate((db) => {
    const session = activeSession(db, input.tokenOrCode);
    if (!session) return undefined;
    if (session.deviceId && session.deviceId !== input.deviceId) return undefined;
    session.status = "connected";
    session.deviceId = input.deviceId;
    session.deviceName = input.deviceName;
    session.contributorName = input.contributorName.trim();
    session.connectedAt = session.connectedAt ?? new Date().toISOString();
    const cause = db.cases.find((item) => item.id === session.caseId);
    return { session, caratula: cause?.caratula ?? "Causa" };
  });
}

export function syncCatalog(
  token: string,
  deviceId: string,
  items: CatalogItem[],
): Promise<CatalogItem[] | undefined> {
  return mutate((db) => {
    const session = activeSession(db, token);
    if (!session || session.deviceId !== deviceId) return undefined;
    db.catalogs[session.id] = items;
    return items;
  });
}

export function disconnectDevice(token: string, deviceId: string): Promise<boolean> {
  return mutate((db) => {
    const session = db.sessions.find((item) => item.token === token && item.deviceId === deviceId);
    if (!session || session.status === "closed") return false;
    session.status = "waiting";
    return true;
  });
}

export function requestPulls(sessionId: string, localIds: string[]): Promise<PullRequest[]> {
  return mutate((db) => {
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== "connected") return [];
    const created: PullRequest[] = [];
    for (const localId of localIds) {
      const existing = db.pulls.find(
        (item) => item.sessionId === sessionId && item.localId === localId && item.status === "pending",
      );
      if (existing) {
        created.push(existing);
        continue;
      }
      const pull: PullRequest = {
        id: randomUUID(),
        sessionId,
        localId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      db.pulls.push(pull);
      created.push(pull);
    }
    return created;
  });
}

export function pendingPulls(token: string, deviceId: string): PullRequest[] {
  const db = readDb();
  const session = db.sessions.find((item) => item.token === token && item.deviceId === deviceId);
  if (!session || session.status !== "connected") return [];
  return db.pulls.filter((item) => item.sessionId === session.id && item.status === "pending");
}

export function sessionByToken(token: string): PairingSession | undefined {
  const db = readDb();
  return db.sessions.find((item) => item.token === token);
}

export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || "archivo";
  const cleaned = base.replace(/[^\w.\- ()áéíóúüñÁÉÍÓÚÜÑ]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 120) || "archivo";
}

export function evidenceFilePath(record: Pick<EvidenceRecord, "caseId" | "storedName">): string {
  return path.join(filesDir, record.caseId, record.storedName);
}

export async function saveEvidence(input: {
  token: string;
  deviceId: string;
  localId: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  claimedSha256: string;
  sha256Verified: boolean;
  capturedAt: string;
  category: EvidenceRecord["category"];
  note: string;
  source: EvidenceRecord["source"];
  tempPath: string;
}): Promise<EvidenceRecord | undefined> {
  return mutate((db) => {
    const session = activeSession(db, input.token);
    if (!session || session.deviceId !== input.deviceId) return undefined;
    const duplicate = db.evidence.find(
      (item) => item.caseId === session.caseId && item.sha256 === input.sha256,
    );
    const pull = db.pulls.find(
      (item) => item.sessionId === session.id && item.localId === input.localId && item.status === "pending",
    );
    if (duplicate) {
      if (pull) {
        pull.status = "done";
        pull.finishedAt = new Date().toISOString();
      }
      return duplicate;
    }
    const id = randomUUID();
    const storedName = `${id}-${safeFilename(input.filename)}`;
    const folder = path.join(filesDir, session.caseId);
    mkdirSync(folder, { recursive: true });
    const destination = path.join(folder, storedName);
    renameSync(input.tempPath, destination);
    const record: EvidenceRecord = {
      id,
      caseId: session.caseId,
      sessionId: session.id,
      localId: input.localId,
      filename: safeFilename(input.filename),
      mime: input.mime || "application/octet-stream",
      size: input.size,
      sha256: input.sha256,
      claimedSha256: input.claimedSha256,
      sha256Verified: input.sha256Verified,
      capturedAt: input.capturedAt,
      receivedAt: new Date().toISOString(),
      category: input.category,
      note: input.note,
      source: input.source,
      deviceId: input.deviceId,
      deviceName: session.deviceName ?? "Teléfono",
      contributorName: session.contributorName ?? "",
      storedName,
    };
    db.evidence.unshift(record);
    if (pull) {
      pull.status = "done";
      pull.finishedAt = record.receivedAt;
    } else {
      db.pulls.push({
        id: randomUUID(),
        sessionId: session.id,
        localId: input.localId,
        status: "done",
        createdAt: record.receivedAt,
        finishedAt: record.receivedAt,
      });
    }
    const cause = db.cases.find((item) => item.id === session.caseId);
    if (cause) cause.updatedAt = record.receivedAt;
    return record;
  });
}

export function markPullFailed(token: string, localId: string, error: string): Promise<void> {
  return mutate((db) => {
    const session = db.sessions.find((item) => item.token === token);
    if (!session) return;
    const pull = db.pulls.find(
      (item) => item.sessionId === session.id && item.localId === localId && item.status === "pending",
    );
    if (!pull) return;
    pull.status = "failed";
    pull.error = error;
    pull.finishedAt = new Date().toISOString();
  });
}

export function saveStationCapture(input: {
  caseId: string;
  filename: string;
  mime: string;
  sha256: string;
  size: number;
  category: EvidenceRecord["category"];
  note: string;
  deviceId: string;
  deviceName: string;
  tempPath: string;
}): Promise<EvidenceRecord | undefined> {
  return mutate((db) => {
    const cause = db.cases.find((item) => item.id === input.caseId);
    if (!cause) return undefined;
    const id = randomUUID();
    const storedName = `${id}-${safeFilename(input.filename)}`;
    const folder = path.join(filesDir, input.caseId);
    mkdirSync(folder, { recursive: true });
    const finalPath = path.join(folder, storedName);
    try {
      renameSync(input.tempPath, finalPath);
    } catch {
      copyFileSync(input.tempPath, finalPath);
      rmSync(input.tempPath, { force: true });
    }
    const now = new Date().toISOString();
    const record: EvidenceRecord = {
      id,
      caseId: input.caseId,
      sessionId: "usb",
      localId: id,
      filename: safeFilename(input.filename),
      mime: input.mime,
      size: input.size,
      sha256: input.sha256,
      claimedSha256: input.sha256,
      sha256Verified: true,
      capturedAt: now,
      receivedAt: now,
      category: input.category,
      note: input.note,
      source: "pantalla",
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      contributorName: "",
      storedName,
    };
    db.evidence.unshift(record);
    cause.updatedAt = now;
    return record;
  });
}

export function caseBundle(caseId: string): {
  cause?: CaseRecord;
  evidence: EvidenceRecord[];
  sessions: PairingSession[];
} {
  const db = readDb();
  return {
    cause: db.cases.find((item) => item.id === caseId),
    evidence: db.evidence.filter((item) => item.caseId === caseId),
    sessions: db.sessions.filter((item) => item.caseId === caseId),
  };
}

export function sessionView(sessionId: string): {
  session?: PairingSession;
  cause?: CaseRecord;
  catalog: CatalogItem[];
  pulls: PullRequest[];
  evidence: EvidenceRecord[];
} {
  const db = readDb();
  const session = db.sessions.find((item) => item.id === sessionId);
  return {
    session,
    cause: session ? db.cases.find((item) => item.id === session.caseId) : undefined,
    catalog: session ? (db.catalogs[session.id] ?? []) : [],
    pulls: db.pulls.filter((item) => item.sessionId === sessionId),
    evidence: session ? db.evidence.filter((item) => item.caseId === session.caseId) : [],
  };
}
