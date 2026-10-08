export const PROTOCOL_VERSION = 1 as const;

export const CASE_TYPES = [
  { id: "violencia_domestica", label: "Violencia doméstica" },
  { id: "violencia_genero", label: "Violencia de género" },
  { id: "otro", label: "Otra investigación" },
] as const;

export type CaseType = (typeof CASE_TYPES)[number]["id"];

export const EVIDENCE_CATEGORIES = [
  { id: "lesiones", label: "Lesiones o estado físico" },
  { id: "lugar", label: "Lugar de los hechos" },
  { id: "amenaza", label: "Amenaza o mensaje" },
  { id: "documento", label: "Documento" },
  { id: "audio", label: "Audio" },
  { id: "otro", label: "Otro" },
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number]["id"];

export type CaseRecord = {
  id: string;
  caratula: string;
  expediente: string;
  tipo: CaseType;
  dependencia: string;
  oficina: string;
  proceso: string;
  responsable: string;
  notas: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionStatus = "waiting" | "connected" | "closed";

export type PairingSession = {
  id: string;
  caseId: string;
  token: string;
  code: string;
  host: string;
  createdAt: string;
  expiresAt: string;
  status: SessionStatus;
  deviceId?: string;
  deviceName?: string;
  contributorName?: string;
  connectedAt?: string;
};

export type CatalogItem = {
  localId: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  capturedAt: string;
  category: EvidenceCategory;
  note: string;
  source: "camera" | "gallery" | "document";
};

export type PullRequestStatus = "pending" | "done" | "failed";

export type PullRequest = {
  id: string;
  sessionId: string;
  localId: string;
  status: PullRequestStatus;
  error?: string;
  createdAt: string;
  finishedAt?: string;
};

export type EvidenceRecord = {
  id: string;
  caseId: string;
  sessionId: string;
  localId: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  claimedSha256: string;
  sha256Verified: boolean;
  capturedAt: string;
  receivedAt: string;
  category: EvidenceCategory;
  note: string;
  source: "camera" | "gallery" | "document" | "pantalla";
  deviceId: string;
  deviceName: string;
  contributorName: string;
  storedName: string;
};

export type PairPayload = {
  v: typeof PROTOCOL_VERSION;
  host: string;
  token: string;
  code: string;
  caratula: string;
};

export function labelCaseType(tipo: CaseType): string {
  return CASE_TYPES.find((item) => item.id === tipo)?.label ?? tipo;
}

export function labelCategory(category: EvidenceCategory): string {
  return EVIDENCE_CATEGORIES.find((item) => item.id === category)?.label ?? category;
}

export const FINGERPRINT_PATHS = [
  "M32 7c9.5 0 17 8 17 19v8",
  "M15 30c0-11 7.5-21 17-23",
  "M21 32c0-7 4.8-14 11-14s11 6 11 15c0 9-2 16-6 22",
  "M27 33c0-3.5 2.2-7 5-7s5 3.2 5 9c0 8-1.2 15-4.2 21",
  "M32 31.5c0 8 0 16-.4 24",
  "M18 42c2.2 7 6.4 13 14 17",
  "M46 38c.4 8-3.2 16-9.5 22",
  "M24 24c2-6 8-8 12-4",
] as const;

export function mismaDependencia(a: string, b: string): boolean {
  const clave = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[º°]/g, "")
      .replace(/[^A-Z0-9]/g, "");
  const left = clave(a);
  const right = clave(b);
  return left.length > 0 && left === right;
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
