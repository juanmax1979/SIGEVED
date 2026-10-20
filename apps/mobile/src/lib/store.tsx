import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { fetch } from "expo/fetch";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  EVIDENCE_CATEGORIES,
  type CatalogItem,
  type EvidenceCategory,
  type PairPayload,
} from "../../../../packages/shared/src/index";
import { hashFile } from "./hash";

export type LocalEvidence = {
  localId: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  capturedAt: string;
  category: EvidenceCategory;
  note: string;
  source: CatalogItem["source"];
  folder: string;
  delivery: "local" | "sending" | "sent" | "error";
  detail?: string;
};

export type StationLink = {
  host: string;
  token: string;
  caratula: string;
  expiresAt: string;
};

type IndexFile = {
  deviceId: string;
  items: LocalEvidence[];
};

type StoreValue = {
  ready: boolean;
  items: LocalEvidence[];
  deviceId: string;
  link: StationLink | null;
  busy: string;
  addFromUri: (input: {
    uri: string;
    filename?: string | null;
    mime?: string | null;
    source: LocalEvidence["source"];
  }) => Promise<void>;
  updateItem: (localId: string, patch: Partial<Pick<LocalEvidence, "category" | "note">>) => Promise<void>;
  removeItem: (localId: string) => Promise<void>;
  connectStation: (input: { host: string; token: string; contributorName: string; deviceName: string }) => Promise<void>;
  disconnectStation: () => Promise<void>;
  sendItems: (localIds: string[]) => Promise<void>;
  pullPending: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

function indexFile(): File {
  return new File(Paths.document, "espejo-index.json");
}

async function readIndex(): Promise<IndexFile> {
  const file = indexFile();
  if (!file.exists) {
    const created: IndexFile = { deviceId: Crypto.randomUUID(), items: [] };
    file.create({ intermediates: true });
    file.write(JSON.stringify(created));
    return created;
  }
  return JSON.parse(await file.text()) as IndexFile;
}

async function writeIndex(index: IndexFile): Promise<void> {
  const file = indexFile();
  if (!file.exists) file.create({ intermediates: true });
  file.write(JSON.stringify(index));
}

export function fileFor(item: LocalEvidence): File {
  return new File(Paths.document, "evidence", item.folder, item.filename);
}

function safeName(name: string): string {
  const base = decodeURIComponent(name.split(/[/\\]/).pop() || "archivo");
  const cleaned = base.replace(/[^\w.\- ()áéíóúüñÁÉÍÓÚÜÑ]/g, "_");
  return cleaned.slice(0, 120) || "archivo";
}

function toCatalog(item: LocalEvidence): CatalogItem {
  return {
    localId: item.localId,
    filename: item.filename,
    mime: item.mime,
    size: item.size,
    sha256: item.sha256,
    capturedAt: item.capturedAt,
    category: item.category,
    note: item.note,
    source: item.source,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LocalEvidence[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [link, setLink] = useState<StationLink | null>(null);
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(false);
  const indexRef = useRef<IndexFile | null>(null);
  const linkRef = useRef<StationLink | null>(null);
  const sendingRef = useRef(false);

  async function persist(next: IndexFile) {
    indexRef.current = next;
    setDeviceId(next.deviceId);
    setItems(next.items);
    await writeIndex(next);
  }

  useEffect(() => {
    readIndex()
      .then((value) => {
        indexRef.current = value;
        setDeviceId(value.deviceId);
        setItems(value.items);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  async function addFromUri(input: {
    uri: string;
    filename?: string | null;
    mime?: string | null;
    source: LocalEvidence["source"];
  }) {
    const current = indexRef.current;
    if (!current) return;
    setBusy("Guardando el archivo y calculando su huella…");
    try {
      const localId = Crypto.randomUUID();
      const folder = new Directory(Paths.document, "evidence", localId);
      if (!folder.exists) folder.create({ intermediates: true });
      const filename = safeName(input.filename || input.uri);
      const target = new File(folder, filename);
      await new File(input.uri).copy(target);
      const item: LocalEvidence = {
        localId,
        filename,
        mime: input.mime || target.type || "application/octet-stream",
        size: target.size,
        sha256: await hashFile(target),
        capturedAt: new Date().toISOString(),
        category: input.source === "document" ? "documento" : "otro",
        note: "",
        source: input.source,
        folder: localId,
        delivery: "local",
      };
      await persist({ ...current, items: [item, ...current.items] });
    } finally {
      setBusy("");
    }
  }

  async function updateItem(localId: string, patch: Partial<Pick<LocalEvidence, "category" | "note">>) {
    const current = indexRef.current;
    if (!current) return;
    await persist({
      ...current,
      items: current.items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    });
  }

  async function removeItem(localId: string) {
    const current = indexRef.current;
    if (!current) return;
    const found = current.items.find((item) => item.localId === localId);
    if (found) {
      const folder = new Directory(Paths.document, "evidence", found.folder);
      if (folder.exists) folder.delete();
    }
    await persist({ ...current, items: current.items.filter((item) => item.localId !== localId) });
  }

  async function syncCatalog(station: StationLink, index: IndexFile): Promise<string[]> {
    const response = await fetch(`${station.host}/api/pair/catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: station.token, deviceId: index.deviceId, items: index.items.map(toCatalog) }),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { received?: string[] };
    return body.received ?? [];
  }

  async function connectStation(input: { host: string; token: string; contributorName: string; deviceName: string }) {
    const current = indexRef.current;
    if (!current) return;
    const host = input.host.replace(/\/$/, "");
    const health = await fetch(`${host}/api/health`);
    if (!health.ok) throw new Error("No llegamos a la estación. Revisá el Wi-Fi y que la estación esté abierta.");
    const response = await fetch(`${host}/api/pair/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: input.token,
        deviceId: current.deviceId,
        deviceName: input.deviceName,
        contributorName: input.contributorName,
      }),
    });
    const body = (await response.json()) as { error?: string; token?: string; caratula?: string; expiresAt?: string };
    if (!response.ok || !body.token) throw new Error(body.error || "La estación rechazó la conexión.");
    const station: StationLink = {
      host,
      token: body.token,
      caratula: body.caratula || "Causa",
      expiresAt: body.expiresAt || "",
    };
    linkRef.current = station;
    setLink(station);
    const received = await syncCatalog(station, current);
    if (received.length > 0) {
      await persist({
        ...indexRef.current!,
        items: indexRef.current!.items.map((item) =>
          received.includes(item.sha256) ? { ...item, delivery: "sent", detail: "Ya está en la estación" } : item,
        ),
      });
    }
  }

  async function disconnectStation() {
    const station = linkRef.current;
    const current = indexRef.current;
    if (station && current) {
      await fetch(`${station.host}/api/pair/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: station.token, deviceId: current.deviceId }),
      }).catch(() => undefined);
    }
    linkRef.current = null;
    setLink(null);
  }

  async function uploadOne(index: IndexFile, station: StationLink, localId: string): Promise<IndexFile> {
    const item = index.items.find((entry) => entry.localId === localId);
    if (!item || !fileFor(item).exists) {
      await fetch(`${station.host}/api/pair/fail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: station.token, localId, error: "El archivo ya no está en el teléfono." }),
      }).catch(() => undefined);
      return index;
    }
    const form = new FormData();
    form.append("file", fileFor(item) as unknown as Blob);
    form.append("token", station.token);
    form.append("deviceId", index.deviceId);
    form.append("localId", item.localId);
    form.append("filename", item.filename);
    form.append("mime", item.mime);
    form.append("size", String(item.size));
    form.append("sha256", item.sha256);
    form.append("capturedAt", item.capturedAt);
    form.append("category", item.category);
    form.append("note", item.note);
    form.append("source", item.source);
    const response = await fetch(`${station.host}/api/pair/upload`, { method: "POST", body: form });
    const body = (await response.json().catch(() => ({}))) as { error?: string; sha256Verified?: boolean };
    if (!response.ok) throw new Error(body.error || "No se pudo enviar el archivo.");
    const detail =
      body.sha256Verified === false
        ? "La estación guardó el archivo, pero la huella no coincidió."
        : "Recibido por la estación";
    return {
      ...index,
      items: index.items.map((entry) => (entry.localId === localId ? { ...entry, delivery: "sent", detail } : entry)),
    };
  }

  async function sendItems(localIds: string[]) {
    const station = linkRef.current;
    if (!indexRef.current || !station) throw new Error("No hay una estación conectada.");
    if (sendingRef.current) return;
    sendingRef.current = true;
    let current = indexRef.current;
    try {
      for (const localId of localIds) {
        const item = current.items.find((entry) => entry.localId === localId);
        if (!item || item.delivery === "sent") continue;
        setBusy(`Enviando ${item.filename}…`);
        current = {
          ...current,
          items: current.items.map((entry) => (entry.localId === localId ? { ...entry, delivery: "sending" } : entry)),
        };
        indexRef.current = current;
        setItems(current.items);
        try {
          current = await uploadOne(current, station, localId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "No se pudo enviar.";
          current = {
            ...current,
            items: current.items.map((entry) =>
              entry.localId === localId ? { ...entry, delivery: "error", detail: message } : entry,
            ),
          };
        }
        indexRef.current = current;
        setItems(current.items);
      }
      await persist(current);
      await syncCatalog(station, current);
    } finally {
      sendingRef.current = false;
      setBusy("");
    }
  }

  async function pullPending() {
    const station = linkRef.current;
    const current = indexRef.current;
    if (!station || !current || sendingRef.current) return;
    await syncCatalog(station, current);
    const response = await fetch(
      `${station.host}/api/pair/requests?token=${encodeURIComponent(station.token)}&deviceId=${encodeURIComponent(current.deviceId)}`,
    );
    if (!response.ok) return;
    const body = (await response.json()) as { pulls?: { localId: string; status: string }[] };
    const pending = (body.pulls ?? [])
      .filter((pull) => pull.status === "pending")
      .map((pull) => pull.localId)
      .filter((localId) => current.items.some((item) => item.localId === localId && item.delivery !== "sent"));
    if (pending.length > 0) await sendItems(pending);
  }

  const value: StoreValue = {
    ready,
    items,
    deviceId,
    link,
    busy,
    addFromUri,
    updateItem,
    removeItem,
    connectStation,
    disconnectStation,
    sendItems,
    pullPending,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Falta el almacén de evidencia.");
  return value;
}

export const categories = EVIDENCE_CATEGORIES;

export function parsePairPayload(raw: string): PairPayload {
  const parsed = JSON.parse(raw) as PairPayload;
  if (parsed.v !== 1 || !parsed.host?.startsWith("http") || !parsed.token) {
    throw new Error("Ese código no es de una estación SIGVED.");
  }
  return parsed;
}
