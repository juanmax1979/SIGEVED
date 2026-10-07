import { createReadStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import archiver from "archiver";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import {
  CASE_TYPES,
  EVIDENCE_CATEGORIES,
  PROTOCOL_VERSION,
  labelCaseType,
  labelCategory,
  type CaseType,
  type EvidenceCategory,
  type PairPayload,
} from "@espejo/shared";
import { z } from "zod";
import { sha256File } from "./hash.js";
import { isLoopback, listLanHosts } from "./network.js";
import { clientDist, dataDir, ensureDataDirs } from "./paths.js";
import {
  caseBundle,
  closeSession,
  connectDevice,
  createCase,
  createSession,
  disconnectDevice,
  evidenceFilePath,
  getAdminToken,
  markPullFailed,
  pendingPulls,
  readSnapshot,
  requestPulls,
  saveEvidence,
  sessionByToken,
  sessionView,
  syncCatalog,
  updateCase,
} from "./store.js";

const PORT = Number(process.env.PORT ?? 4780);
const uploadDir = path.join(dataDir, "tmp");
ensureDataDirs();
mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 1024 * 1024 * 1024 },
});

const caseType = z.enum(CASE_TYPES.map((item) => item.id) as [CaseType, ...CaseType[]]);
const category = z.enum(
  EVIDENCE_CATEGORIES.map((item) => item.id) as [EvidenceCategory, ...EvidenceCategory[]],
);

const caseInput = z.object({
  caratula: z.string().trim().min(3).max(240),
  expediente: z.string().trim().max(80).default(""),
  tipo: caseType,
  dependencia: z.string().trim().max(160).default(""),
  responsable: z.string().trim().max(120).default(""),
  notas: z.string().trim().max(2000).default(""),
});

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: ["http://127.0.0.1:5173", "http://localhost:5173"] }));
app.use(express.json({ limit: "2mb" }));

function adminCookie(req: Request): string {
  const raw = req.headers.cookie ?? "";
  const part = raw
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("espejo_admin="));
  return part ? decodeURIComponent(part.slice("espejo_admin=".length)) : "";
}

app.use((req, res, next) => {
  if (req.path === "/api/health" || req.path === "/api/bootstrap" || req.path.startsWith("/api/pair")) {
    next();
    return;
  }
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }
  const presented = req.get("x-espejo-admin") || adminCookie(req);
  if (presented && presented === getAdminToken()) {
    next();
    return;
  }
  res.status(401).json({ error: "Esta estación solo se administra desde esta computadora." });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "espejo-estacion", version: PROTOCOL_VERSION });
});

app.get("/api/bootstrap", (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) {
    res.status(403).json({
      error: "Abrí la estación en esta computadora: http://127.0.0.1:" + PORT,
    });
    return;
  }
  res.append("Set-Cookie", `espejo_admin=${getAdminToken()}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({
    adminToken: getAdminToken(),
    port: PORT,
    hostname: os.hostname(),
    hosts: listLanHosts(),
  });
});

app.get("/api/cases", (_req, res) => {
  const db = readSnapshot();
  const cases = db.cases.map((cause) => ({
    ...cause,
    evidenceCount: db.evidence.filter((item) => item.caseId === cause.id).length,
  }));
  res.json({ cases });
});

app.post("/api/cases", (req, res) => {
  const parsed = caseInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Revisá los datos de la causa." });
    return;
  }
  createCase(parsed.data)
    .then((cause) => res.status(201).json({ case: cause }))
    .catch(nextError(res));
});

app.get("/api/cases/:id", (req, res) => {
  const bundle = caseBundle(req.params.id);
  if (!bundle.cause) {
    res.status(404).json({ error: "No encontramos esa causa." });
    return;
  }
  res.json(bundle);
});

const casePatch = z.object({
  caratula: z.string().trim().min(3).max(240).optional(),
  expediente: z.string().trim().max(80).optional(),
  tipo: caseType.optional(),
  dependencia: z.string().trim().max(160).optional(),
  responsable: z.string().trim().max(120).optional(),
  notas: z.string().trim().max(2000).optional(),
});

app.patch("/api/cases/:id", (req, res) => {
  const parsed = casePatch.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Revisá los datos de la causa." });
    return;
  }
  updateCase(req.params.id, parsed.data)
    .then((cause) => {
      if (!cause) {
        res.status(404).json({ error: "No encontramos esa causa." });
        return;
      }
      res.json({ case: cause });
    })
    .catch(nextError(res));
});

app.post("/api/cases/:id/sessions", (req, res) => {
  const hosts = listLanHosts();
  const requested = typeof req.body?.host === "string" ? req.body.host : "";
  const chosen = hosts.find((item) => item.address === requested) ?? hosts[0];
  if (!chosen) {
    res.status(400).json({
      error: "Esta computadora no tiene una red local. Conectala al mismo Wi-Fi que el teléfono.",
    });
    return;
  }
  const host = `http://${chosen.address}:${PORT}`;
  createSession(req.params.id, host)
    .then((session) => {
      if (!session) {
        res.status(404).json({ error: "No encontramos esa causa." });
        return;
      }
      const db = readSnapshot();
      const cause = db.cases.find((item) => item.id === session.caseId);
      const payload: PairPayload = {
        v: PROTOCOL_VERSION,
        host,
        token: session.token,
        code: session.code,
        caratula: cause?.caratula ?? "Causa",
      };
      res.status(201).json({ session, payload, hosts });
    })
    .catch(nextError(res));
});

app.get("/api/sessions/:id", (req, res) => {
  const view = sessionView(req.params.id);
  if (!view.session) {
    res.status(404).json({ error: "No encontramos esa sesión." });
    return;
  }
  res.json({ ...view, hosts: listLanHosts() });
});

app.post("/api/sessions/:id/close", (req, res) => {
  closeSession(req.params.id)
    .then((session) => {
      if (!session) {
        res.status(404).json({ error: "No encontramos esa sesión." });
        return;
      }
      res.json({ session });
    })
    .catch(nextError(res));
});

app.post("/api/sessions/:id/pull", (req, res) => {
  const parsed = z.object({ localIds: z.array(z.string().min(1)).min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Elegí al menos un archivo." });
    return;
  }
  requestPulls(req.params.id, parsed.data.localIds)
    .then((pulls) => res.json({ pulls }))
    .catch(nextError(res));
});

app.get("/api/evidence/:id/file", (req, res) => {
  const db = readSnapshot();
  const record = db.evidence.find((item) => item.id === req.params.id);
  if (!record) {
    res.status(404).json({ error: "No encontramos ese archivo." });
    return;
  }
  const filePath = evidenceFilePath(record);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "El archivo no está en el disco de esta estación." });
    return;
  }
  res.setHeader("Content-Type", record.mime);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(record.filename)}"`);
  createReadStream(filePath).pipe(res);
});

app.get("/api/cases/:id/export", async (req, res, next) => {
  try {
    const bundle = caseBundle(req.params.id);
    if (!bundle.cause) {
      res.status(404).json({ error: "No encontramos esa causa." });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="espejo-${stamp}.zip"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", next);
    archive.pipe(res);
    const manifest = {
      sistema: "Espejo PJCH",
      version: PROTOCOL_VERSION,
      exportadoEn: new Date().toISOString(),
      causa: bundle.cause,
      sesiones: bundle.sessions.map((session) => ({
        id: session.id,
        code: session.code,
        status: session.status,
        deviceName: session.deviceName,
        contributorName: session.contributorName,
        connectedAt: session.connectedAt,
        createdAt: session.createdAt,
      })),
      archivos: bundle.evidence.map((item) => ({
        id: item.id,
        nombre: item.filename,
        tipo: item.mime,
        categoria: labelCategory(item.category),
        bytes: item.size,
        sha256: item.sha256,
        sha256InformadaPorTelefono: item.claimedSha256,
        huellaVerificada: item.sha256Verified,
        capturadoEn: item.capturedAt,
        recibidoEn: item.receivedAt,
        dispositivo: item.deviceName,
        aportante: item.contributorName,
        nota: item.note,
        archivoEnPaquete: `archivos/${item.storedName}`,
      })),
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifiesto.json" });
    archive.append(actaTexto(bundle.cause, bundle.evidence), { name: "acta-recepcion.txt" });
    for (const item of bundle.evidence) {
      const filePath = evidenceFilePath(item);
      if (existsSync(filePath)) archive.file(filePath, { name: `archivos/${item.storedName}` });
    }
    await archive.finalize();
  } catch (error) {
    next(error);
  }
});

const catalogItem = z.object({
  localId: z.string().min(8),
  filename: z.string().min(1).max(180),
  mime: z.string().min(1).max(120),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.string().min(10),
  category,
  note: z.string().max(2000).default(""),
  source: z.enum(["camera", "gallery", "document"]),
});

app.post("/api/pair/connect", (req, res) => {
  const parsed = z
    .object({
      token: z.string().min(4),
      deviceId: z.string().min(8).max(80),
      deviceName: z.string().trim().min(1).max(80),
      contributorName: z.string().trim().max(120).default(""),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "No se pudo leer la conexión del teléfono." });
    return;
  }
  connectDevice({
    tokenOrCode: parsed.data.token,
    deviceId: parsed.data.deviceId,
    deviceName: parsed.data.deviceName,
    contributorName: parsed.data.contributorName,
  })
    .then((result) => {
      if (!result) {
        res.status(404).json({ error: "El código no está vigente o ya lo usa otro teléfono." });
        return;
      }
      res.json({
        sessionId: result.session.id,
        token: result.session.token,
        caratula: result.caratula,
        expiresAt: result.session.expiresAt,
      });
    })
    .catch(nextError(res));
});

app.post("/api/pair/catalog", (req, res) => {
  const parsed = z
    .object({
      token: z.string().min(8),
      deviceId: z.string().min(8),
      items: z.array(catalogItem).max(500),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "El listado de archivos no es válido." });
    return;
  }
  syncCatalog(parsed.data.token, parsed.data.deviceId, parsed.data.items)
    .then((items) => {
      if (!items) {
        res.status(404).json({ error: "La sesión no está conectada con este teléfono." });
        return;
      }
      const session = sessionByToken(parsed.data.token);
      const received = session
        ? readSnapshot()
            .evidence.filter((item) => item.caseId === session.caseId && item.sha256Verified)
            .map((item) => item.sha256)
        : [];
      res.json({ items, received });
    })
    .catch(nextError(res));
});

app.get("/api/pair/requests", (req, res) => {
  const token = String(req.query.token ?? "");
  const deviceId = String(req.query.deviceId ?? "");
  if (!token || !deviceId) {
    res.status(400).json({ error: "Falta la sesión." });
    return;
  }
  res.json({ pulls: pendingPulls(token, deviceId) });
});

app.post("/api/pair/fail", (req, res) => {
  const parsed = z
    .object({
      token: z.string().min(8),
      localId: z.string().min(8),
      error: z.string().max(200).default("No se pudo enviar el archivo."),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Falta la sesión." });
    return;
  }
  markPullFailed(parsed.data.token, parsed.data.localId, parsed.data.error)
    .then(() => res.json({ ok: true }))
    .catch(nextError(res));
});

app.post("/api/pair/disconnect", (req, res) => {
  const parsed = z.object({ token: z.string().min(8), deviceId: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Falta la sesión." });
    return;
  }
  disconnectDevice(parsed.data.token, parsed.data.deviceId)
    .then(() => res.json({ ok: true }))
    .catch(nextError(res));
});

app.post("/api/pair/upload", upload.single("file"), async (req, res, next) => {
  const tempPath = req.file?.path;
  try {
    const parsed = catalogItem
      .extend({
        token: z.string().min(8),
        deviceId: z.string().min(8),
      })
      .safeParse({
        ...req.body,
        size: Number(req.body?.size),
      });
    if (!parsed.success || !tempPath) {
      if (tempPath) unlinkSync(tempPath);
      res.status(400).json({ error: "El archivo llegó incompleto." });
      return;
    }
    const actual = await sha256File(tempPath);
    const record = await saveEvidence({
      ...parsed.data,
      sha256: actual,
      claimedSha256: parsed.data.sha256,
      size: req.file?.size ?? parsed.data.size,
      sha256Verified: actual === parsed.data.sha256,
      tempPath,
    });
    if (tempPath && existsSync(tempPath)) unlinkSync(tempPath);
    if (!record) {
      res.status(404).json({ error: "La sesión ya no acepta archivos." });
      return;
    }
    res.json({
      evidenceId: record.id,
      sha256: record.sha256,
      sha256Verified: record.sha256Verified,
    });
  } catch (error) {
    if (tempPath && existsSync(tempPath)) unlinkSync(tempPath);
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const localId = typeof req.body?.localId === "string" ? req.body.localId : "";
    if (token && localId) await markPullFailed(token, localId, "No se pudo guardar el archivo.");
    next(error);
  }
});

function actaTexto(
  cause: NonNullable<ReturnType<typeof caseBundle>["cause"]>,
  evidence: ReturnType<typeof caseBundle>["evidence"],
): string {
  const lines = [
    "ESPEJO PJCH — ACTA DE RECEPCIÓN DE EVIDENCIA DIGITAL",
    "",
    `Carátula: ${cause.caratula}`,
    `Expediente: ${cause.expediente || "—"}`,
    `Tipo: ${labelCaseType(cause.tipo)}`,
    `Dependencia: ${cause.dependencia || "—"}`,
    `Responsable de la recepción: ${cause.responsable || "—"}`,
    `Exportado: ${new Date().toISOString()}`,
    "",
    "Cada archivo fue elegido en el teléfono de la persona aportante y enviado a esta estación.",
    "La huella SHA-256 se calcula al guardar el archivo en el teléfono y se vuelve a calcular al recibirlo.",
    "",
  ];
  if (evidence.length === 0) lines.push("No hay archivos recibidos.");
  evidence.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.filename}`,
      `   Categoría: ${labelCategory(item.category)}`,
      `   SHA-256 del archivo recibido: ${item.sha256}`,
      `   SHA-256 informada por el teléfono: ${item.claimedSha256}`,
      `   Huella verificada: ${item.sha256Verified ? "sí" : "no coincide"}`,
      `   Capturado: ${item.capturedAt}`,
      `   Recibido: ${item.receivedAt}`,
      `   Dispositivo: ${item.deviceName}`,
      `   Aportante: ${item.contributorName || "—"}`,
      `   Nota: ${item.note || "—"}`,
      "",
    );
  });
  return lines.join("\n");
}

function nextError(res: Response) {
  return (error: unknown) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: "La estación no pudo completar la operación." });
  };
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  if (!res.headersSent) res.status(500).json({ error: "La estación no pudo completar la operación." });
});

const devMode = process.argv.includes("--dev") || process.env.ESPEJO_DEV === "1";
if (!devMode && existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

readSnapshot();

const server = app.listen(PORT, "0.0.0.0", () => {
  const hosts = listLanHosts();
  console.log(`Espejo estación lista en http://127.0.0.1:${PORT}`);
  if (hosts.length === 0) {
    console.log("Sin red local: el teléfono no va a poder conectarse hasta que esta PC esté en un Wi-Fi.");
  } else {
    for (const host of hosts) console.log(`Red ${host.name}: http://${host.address}:${PORT}`);
  }
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
