import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import { adminRoot, dataDir } from "./paths.js";

const MIN_LADO_CORTO = 400;
const MIN_LADO_LARGO = 640;
const MAX_BYTES = 12 * 1024 * 1024;

let workerPromise: Promise<Worker> | null = null;
let cola: Promise<unknown> = Promise.resolve();

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

function medidasImagen(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;
    const marker = buffer[offset + 1] ?? 0;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2) return undefined;
    offset += 2 + size;
  }
  return undefined;
}

function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function numerosCandidatos(texto: string): string[] {
  const found = new Set<string>();
  const compacto = texto.replace(/\s+/g, "");
  for (const match of compacto.matchAll(/IDARG(\d{7,8})/g)) found.add(match[1] ?? "");
  for (const match of texto.matchAll(/\bDNI\b[^0-9]{0,16}(\d{1,3}(?:[.\s]\d{3})+|\d{7,8})/g)) {
    found.add((match[1] ?? "").replace(/\D/g, ""));
  }
  for (const match of texto.matchAll(/\bDOCUMENTO\b[^0-9]{0,24}(\d{7,8})/g)) found.add(match[1] ?? "");
  return [...found].filter((item) => item.length === 7 || item.length === 8);
}

export function evaluarTextoDni(texto: string, dni: string): string {
  const textoPlano = plano(texto);
  const compacto = textoPlano.replace(/\s+/g, "");
  const mrz = /IDARG\d{6,}/.test(compacto);
  const republica = textoPlano.includes("REPUBLICA") && textoPlano.includes("ARGENTINA");
  const documentoIdentidad =
    textoPlano.includes("DOCUMENTO NACIONAL DE IDENTIDAD") ||
    (textoPlano.includes("DOCUMENTO") && textoPlano.includes("IDENTIDAD"));
  const esDni = mrz || documentoIdentidad || (republica && (textoPlano.includes("MERCOSUR") || /\bDNI\b/.test(textoPlano) || textoPlano.includes("DOCUMENTO")));
  if (!esDni) return "La foto no parece un DNI. Encuadrá el documento completo, de frente y con buena luz.";
  const esperado = dni.replace(/\D/g, "");
  const candidatos = numerosCandidatos(textoPlano);
  if (candidatos.length > 0 && esperado && !candidatos.includes(esperado)) {
    return "El número que se lee en la foto no coincide con el DNI cargado.";
  }
  return "";
}

function reducirParaOcr(buffer: Buffer, medidas: { width: number; height: number }): Buffer {
  const largo = Math.max(medidas.width, medidas.height);
  if (largo <= 1600) return buffer;
  const dir = path.join(tmpdir(), `evidia-dni-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const origen = path.join(dir, "origen.jpg");
  const destino = path.join(dir, "ocr.jpg");
  try {
    writeFileSync(origen, buffer);
    const script = [
      "Add-Type -AssemblyName System.Drawing",
      `$img = [System.Drawing.Image]::FromFile('${origen.replace(/'/g, "''")}')`,
      "$escala = 1600 / [Math]::Max($img.Width, $img.Height)",
      "$w = [Math]::Max(1, [int]($img.Width * $escala))",
      "$h = [Math]::Max(1, [int]($img.Height * $escala))",
      "$bmp = New-Object System.Drawing.Bitmap $w, $h",
      "$g = [System.Drawing.Graphics]::FromImage($bmp)",
      "$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
      "$g.DrawImage($img, 0, 0, $w, $h)",
      `$bmp.Save('${destino.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Jpeg)`,
      "$g.Dispose(); $bmp.Dispose(); $img.Dispose()",
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true });
    if (result.status === 0 && existsSync(destino)) return readFileSync(destino);
    return buffer;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function obtenerWorker(): Promise<Worker> {
  if (!workerPromise) {
    const langPath = path.join(adminRoot, "tessdata");
    if (!existsSync(path.join(langPath, "eng.traineddata.gz"))) {
      throw new Error("No se pudo verificar la foto del DNI.");
    }
    workerPromise = createWorker("eng", 1, {
      langPath,
      cachePath: path.join(dataDir, "tess-cache"),
      gzip: true,
    }).catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function encolar<T>(tarea: () => Promise<T>): Promise<T> {
  const run = cola.then(tarea, tarea);
  cola = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function cerrarVerificadorDni(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  const worker = await pending.catch(() => undefined);
  await worker?.terminate();
}

export async function verificarFotoDni(buffer: Buffer, dni: string): Promise<string> {
  if (buffer.length < 32 || buffer.length > MAX_BYTES) {
    return "La foto del DNI no se puede leer. Sacala de nuevo, de cerca y en JPG o PNG.";
  }
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (!jpeg && !png) return "La foto tiene que ser JPG o PNG.";
  const medidas = medidasImagen(buffer);
  if (!medidas) return "La foto del DNI no se puede leer. Sacala de nuevo, de cerca y en JPG o PNG.";
  const corto = Math.min(medidas.width, medidas.height);
  const largo = Math.max(medidas.width, medidas.height);
  if (corto < MIN_LADO_CORTO || largo < MIN_LADO_LARGO) {
    return "La foto quedó muy chica. Acercá el DNI hasta que ocupe casi toda la imagen.";
  }
  const imagen = reducirParaOcr(buffer, medidas);
  const leido = await encolar(async () => {
    const worker = await obtenerWorker();
    const result = await worker.recognize(imagen);
    return result.data.text ?? "";
  });
  return evaluarTextoDni(leido, dni);
}

export async function guardarFotoDni(caseId: string, origen: string, dni: string): Promise<string> {
  if (!idValido(caseId)) return "No encontramos esa causa.";
  const buffer = readFileSync(origen);
  const error = await verificarFotoDni(buffer, dni);
  if (error) return error;
  const ext = buffer[0] === 0x89 ? ".png" : ".jpg";
  const dir = path.join(dataDir, "aportantes");
  mkdirSync(dir, { recursive: true });
  borrarFotoDni(caseId);
  writeFileSync(path.join(dir, `${caseId}${ext}`), buffer);
  return "";
}
