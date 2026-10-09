import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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
  causaDeOficina,
  labelCaseType,
  labelCategory,
  mismaDependencia,
  type CaseType,
  type EvidenceCategory,
  type PairPayload,
  type PairingSession,
} from "@espejo/shared";
import { z } from "zod";
import { sha256File } from "./hash.js";
import { escribirInformePdf } from "./informe.js";
import { isLoopback, listLanHosts } from "./network.js";
import { captureScreen, imeiDelDispositivoConectado, mirrorScreen, recordScreen, usbStatus } from "./adb.js";
import { dniDesdeDirectorio } from "./directorio.js";
import { datosExpediente, datosUsuario, dniConfigurado, sigiConfig, usuarioPideDni, windowsUser } from "./sigi.js";
import { etiquetaDependencia } from "./sigi-map.js";
import { clientDist, dataDir, ensureDataDirs } from "./paths.js";
import {
  caseBundle,
  closeSession,
  connectDevice,
  createCase,
  createSession,
  deleteCase,
  disconnectDevice,
  dniDelUsuario,
  evidenceFilePath,
  getAdminToken,
  getOperator,
  getVinculo,
  setVinculo,
  markPullFailed,
  pendingPulls,
  readSnapshot,
  requestPulls,
  saveEvidence,
  saveStationCapture,
  setOperator,
  sessionByToken,
  sessionView,
  setSessionImei,
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
  oficina: z.string().trim().max(160).default(""),
  proceso: z.string().trim().max(160).default(""),
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

app.get("/api/sigi/me", async (req, res) => {
  const username = windowsUser();
  const empty = {
    configured: true,
    needsDni: true,
    username,
    dni: "",
    origen: "" as "" | "directorio",
    nombre: "",
    dependencias: [] as { id: string; nombre: string; circunscripcion: string }[],
    oficinaId: "",
    oficinaNombre: "",
    error: "",
  };
  if (!sigiConfig()) {
    res.json({ ...empty, configured: false, needsDni: false, error: "Falta apps/admin/data/sigi.json con el servidor y la base de SIGI." });
    return;
  }
  try {
    const needsDni = await usuarioPideDni();
    const adDni = await dniDesdeDirectorio();
    const requested = adDni ? "" : typeof req.query.dni === "string" ? req.query.dni.replace(/\D/g, "") : "";
    const current = getOperator();
    const dni =
      adDni ||
      dniDelUsuario({
        windowsUser: username,
        requested,
        vinculo: getVinculo(username),
        operator: current,
        configured: dniConfigurado(),
      });
    if (needsDni && !dni) {
      res.json({
        ...empty,
        error: "La cuenta de Active Directory no tiene DNI. Revisá el atributo employeeID.",
      });
      return;
    }
    const user = await datosUsuario(needsDni ? dni : username);
    const sameUser = current?.username.toLowerCase() === username.toLowerCase();
    const selected = sameUser ? user.dependencias.find((item) => item.id === current?.oficinaId) : undefined;
    const only = user.dependencias.length === 1 ? user.dependencias[0] : undefined;
    const office = selected ?? only ?? user.dependencias[0];
    if (office && (!sameUser || current?.oficinaId !== office.id || current.dni !== dni)) {
      await setOperator({
        username,
        nombre: user.nombre,
        dni,
        oficinaId: office.id,
        oficinaNombre: etiquetaDependencia(office),
      });
    } else if (needsDni && dni && (user.nombre || user.dependencias.length > 0) && getVinculo(username) !== dni) {
      await setVinculo(username, dni);
    }
    res.json({
      configured: true,
      needsDni,
      username,
      dni,
      origen: adDni ? "directorio" : "",
      nombre: user.nombre,
      dependencias: user.dependencias,
      oficinaId: office?.id ?? "",
      oficinaNombre: office ? etiquetaDependencia(office) : "",
      error: user.dependencias.length === 0 ? "Este usuario no tiene dependencias habilitadas en SIGI." : "",
    });
  } catch (error) {
    res.status(502).json({
      ...empty,
      needsDni: true,
      error: error instanceof Error ? error.message : "No se pudo consultar SIGI.",
    });
  }
});

app.post("/api/sigi/oficina", async (req, res) => {
  try {
    const body = z.object({ id: z.string().min(1), dni: z.string().optional() }).parse(req.body);
    const username = windowsUser();
    const adDni = await dniDesdeDirectorio();
    const dni =
      adDni ||
      dniDelUsuario({
        windowsUser: username,
        requested: body.dni ?? "",
        vinculo: getVinculo(username),
        operator: getOperator(),
        configured: dniConfigurado(),
      });
    const user = await datosUsuario(dni);
    const office = user.dependencias.find((item) => item.id === body.id);
    if (!office) {
      res.status(400).json({ error: "Esa dependencia no está habilitada para este usuario." });
      return;
    }
    const operator = await setOperator({
      username,
      nombre: user.nombre,
      dni,
      oficinaId: office.id,
      oficinaNombre: etiquetaDependencia(office),
    });
    res.json({ operator });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo elegir la dependencia." });
  }
});

app.get("/api/sigi/expediente", async (req, res) => {
  const numero = z.string().trim().min(1).max(80).safeParse(req.query.numero);
  if (!numero.success) {
    res.status(400).json({ error: "Escribí el número de expediente." });
    return;
  }
  try {
    const found = await datosExpediente(numero.data);
    res.json({ expediente: found });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "No se pudo consultar el expediente." });
  }
});

app.get("/api/cases", (_req, res) => {
  const db = readSnapshot();
  const oficina = getOperator()?.oficinaNombre ?? "";
  const cases = db.cases
    .filter((cause) => causaDeOficina(cause, oficina))
    .map((cause) => ({
      ...cause,
      evidenceCount: db.evidence.filter((item) => item.caseId === cause.id).length,
    }));
  res.json({ cases });
});

app.post("/api/cases", async (req, res) => {
  const parsed = caseInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Revisá los datos de la causa." });
    return;
  }
  try {
    const operator = getOperator();
    if (!operator?.dni || operator.username.toLowerCase() !== windowsUser().toLowerCase()) {
      res.status(403).json({ error: "Ingresá con tu DNI de SIGI. Solo se crean causas en una dependencia habilitada." });
      return;
    }
    const user = await datosUsuario(operator.dni);
    const match = user.dependencias.find((item) => mismaDependencia(item.nombre, parsed.data.dependencia));
    if (!match) {
      res.status(403).json({
        error: "No podés cargar evidencia en esta causa. La dependencia del expediente no está habilitada para tu usuario en SIGI.",
      });
      return;
    }
    if (operator.oficinaId !== match.id) {
      res.status(403).json({
        error: `Este expediente corresponde a ${etiquetaDependencia(match)}. Elegí esa dependencia para cargar la evidencia.`,
      });
      return;
    }
    const cause = await createCase({
      ...parsed.data,
      dependencia: match.nombre,
      oficina: etiquetaDependencia(match),
      responsable: user.nombre || parsed.data.responsable,
    });
    res.status(201).json({ case: cause });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "No se pudo verificar la dependencia en SIGI." });
  }
});

app.delete("/api/cases/:id", (req, res) => {
  deleteCase(req.params.id)
    .then((removed) => {
      if (!removed) {
        res.status(404).json({ error: "No encontramos esa causa." });
        return;
      }
      res.json({ ok: true });
    })
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

app.get("/api/sessions/:id", async (req, res) => {
  const view = sessionView(req.params.id);
  if (!view.session) {
    res.status(404).json({ error: "No encontramos esa sesión." });
    return;
  }
  if (view.session.status === "connected" && !view.session.imei) {
    const imei = await imeiDelDispositivoConectado();
    if (imei) {
      await setSessionImei(view.session.id, imei);
      view.session.imei = imei;
    }
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

app.get("/api/usb/status", async (_req, res) => {
  res.json(await usbStatus());
});

app.post("/api/usb/mirror", async (req, res) => {
  try {
    const body = z.object({ serial: z.string() }).parse(req.body);
    await mirrorScreen(body.serial);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo espejar la pantalla." });
  }
});

app.post("/api/cases/:id/usb/capture", async (req, res) => {
  const temp = path.join(uploadDir, `${randomUUID()}.png`);
  try {
    const body = z
      .object({
        serial: z.string(),
        category: category.default("otro"),
        note: z.string().max(2000).default(""),
        deviceName: z.string().max(160).default(""),
      })
      .parse(req.body);
    const png = await captureScreen(body.serial);
    writeFileSync(temp, png);
    const record = await saveStationCapture({
      caseId: req.params.id,
      filename: captureName("png"),
      mime: "image/png",
      sha256: createHash("sha256").update(png).digest("hex"),
      size: png.length,
      category: body.category,
      note: body.note || "Captura de la pantalla del teléfono, tomada desde esta estación.",
      deviceId: body.serial,
      deviceName: body.deviceName || body.serial,
      tempPath: temp,
    });
    if (!record) {
      res.status(404).json({ error: "No encontramos esa causa." });
      return;
    }
    res.json({ evidence: record });
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp);
    res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo capturar la pantalla." });
  }
});

app.post("/api/cases/:id/usb/record", async (req, res) => {
  const temp = path.join(uploadDir, `${randomUUID()}.mp4`);
  try {
    const body = z
      .object({
        serial: z.string(),
        seconds: z.number().int().min(5).max(180).default(30),
        category: category.default("otro"),
        note: z.string().max(2000).default(""),
        deviceName: z.string().max(160).default(""),
      })
      .parse(req.body);
    await recordScreen(body.serial, body.seconds, temp);
    const record = await saveStationCapture({
      caseId: req.params.id,
      filename: captureName("mp4"),
      mime: "video/mp4",
      sha256: await sha256File(temp),
      size: statSync(temp).size,
      category: body.category,
      note: body.note || `Grabación de ${body.seconds} segundos de la pantalla del teléfono.`,
      deviceId: body.serial,
      deviceName: body.deviceName || body.serial,
      tempPath: temp,
    });
    if (!record) {
      res.status(404).json({ error: "No encontramos esa causa." });
      return;
    }
    res.json({ evidence: record });
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp);
    res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo grabar la pantalla." });
  }
});

app.post("/api/cases/:id/package", async (req, res) => {
  try {
    const packed = await writeCasePackage(req.params.id);
    if (!packed) {
      res.status(404).json({ error: "No encontramos esa causa." });
      return;
    }
    res.json({ sha256: packed.sha256 });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "No se pudo armar el paquete." });
  }
});

app.get("/api/cases/:id/package/zip", (req, res) => {
  const zipPath = packagePath(req.params.id, "evidencia.zip");
  if (!existsSync(zipPath)) {
    res.status(404).json({ error: "Todavía no hay un paquete de esta causa." });
    return;
  }
  res.download(zipPath, "evidencia.zip");
});

app.get("/api/cases/:id/package/informe", (req, res) => {
  const pdfPath = packagePath(req.params.id, "informe.pdf");
  if (existsSync(pdfPath)) {
    res.download(pdfPath, "informe.pdf");
    return;
  }
  const informePath = packagePath(req.params.id, "informe.txt");
  if (!existsSync(informePath)) {
    res.status(404).json({ error: "Todavía no hay un informe de esta causa." });
    return;
  }
  res.download(informePath, "informe.txt");
});

app.get("/api/cases/:id/export", async (req, res, next) => {
  try {
    const bundle = caseBundle(req.params.id);
    if (!bundle.cause) {
      res.status(404).json({ error: "No encontramos esa causa." });
      return;
    }
    bundle.sessions = await sesionesConImei(bundle.sessions);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="evidia-${stamp}.zip"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", next);
    archive.pipe(res);
    fillArchive(archive, bundle.cause, bundle);
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

app.post("/api/pair/connect", async (req, res) => {
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
  try {
    const imei = await imeiDelDispositivoConectado();
    const result = await connectDevice({
      tokenOrCode: parsed.data.token,
      deviceId: parsed.data.deviceId,
      deviceName: parsed.data.deviceName,
      contributorName: parsed.data.contributorName,
      imei,
    });
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
  } catch (error) {
    nextError(res)(error);
  }
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

function captureName(ext: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `pantalla-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`;
}

async function sesionesConImei(sessions: PairingSession[]): Promise<PairingSession[]> {
  if (sessions.every((item) => item.imei)) return sessions;
  const imei = await imeiDelDispositivoConectado();
  if (!imei) return sessions;
  const pending = sessions.filter((item) => !item.imei && item.status === "connected");
  await Promise.all(pending.map((item) => setSessionImei(item.id, imei)));
  return sessions.map((item) => (item.imei || item.status !== "connected" ? item : { ...item, imei }));
}

function packagePath(caseId: string, name: string): string {
  return path.join(dataDir, "exports", caseId, name);
}

function fillArchive(
  archive: ReturnType<typeof archiver>,
  cause: NonNullable<ReturnType<typeof caseBundle>["cause"]>,
  bundle: ReturnType<typeof caseBundle>,
): void {
  const manifest = {
    sistema: "EVIDIA",
    version: PROTOCOL_VERSION,
    exportadoEn: new Date().toISOString(),
    causa: bundle.cause,
    sesiones: bundle.sessions.map((session) => ({
      id: session.id,
      code: session.code,
      status: session.status,
      deviceName: session.deviceName,
      contributorName: session.contributorName,
      imei: session.imei || "",
      connectedAt: session.connectedAt,
      createdAt: session.createdAt,
    })),
    archivos: bundle.evidence.map((item) => ({
      id: item.id,
      nombre: item.filename,
      tipo: item.mime,
      categoria: labelCategory(item.category),
      origen: item.source === "pantalla" ? "captura de pantalla por USB" : "archivo enviado por la app",
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
  archive.append(actaTexto(cause, bundle.evidence), { name: "acta-recepcion.txt" });
  for (const item of bundle.evidence) {
    const filePath = evidenceFilePath(item);
    if (existsSync(filePath)) archive.file(filePath, { name: `archivos/${item.storedName}` });
  }
}

async function writeCasePackage(caseId: string): Promise<{ sha256: string } | undefined> {
  const bundle = caseBundle(caseId);
  if (!bundle.cause) return undefined;
  bundle.sessions = await sesionesConImei(bundle.sessions);
  const folder = path.join(dataDir, "exports", caseId);
  mkdirSync(folder, { recursive: true });
  const zipPath = path.join(folder, "evidencia.zip");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    fillArchive(archive, bundle.cause!, bundle);
    archive.finalize().catch(reject);
  });
  const sha256 = await sha256File(zipPath);
  await escribirInformePdf(path.join(folder, "informe.pdf"), {
    cause: bundle.cause,
    evidence: bundle.evidence,
    sessions: bundle.sessions,
    sha256,
    generadoEn: new Date().toISOString(),
  });
  return { sha256 };
}

function actaTexto(
  cause: NonNullable<ReturnType<typeof caseBundle>["cause"]>,
  evidence: ReturnType<typeof caseBundle>["evidence"],
): string {
  const lines = [
    "EVIDIA — ACTA DE RECEPCIÓN DE EVIDENCIA DIGITAL",
    "",
    `Carátula: ${cause.caratula}`,
    `Expediente: ${cause.expediente || "—"}`,
    `Tipo: ${labelCaseType(cause.tipo)}`,
    `Dependencia del expediente: ${cause.dependencia || "—"}`,
    `Oficina de carga: ${cause.oficina || "—"}`,
    `Proceso: ${cause.proceso || "—"}`,
    `Responsable de la recepción: ${cause.responsable || "—"}`,
    `Exportado: ${new Date().toISOString()}`,
    "",
    "Los archivos llegan de dos maneras: los elige la persona aportante en la app, o los captura esta estación desde la pantalla del teléfono conectado por USB.",
    "La huella SHA-256 de cada archivo se calcula otra vez al guardarlo en esta estación.",
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
      `   Origen: ${item.source === "pantalla" ? "captura de pantalla por USB" : "archivo enviado por la app"}`,
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
