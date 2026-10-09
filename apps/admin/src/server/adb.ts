import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { adminRoot } from "./paths.js";

export type UsbDevice = {
  serial: string;
  state: "device" | "unauthorized" | "offline" | "other";
  model: string;
  manufacturer: string;
  android: string;
  hardwareSerial: string;
  imei: string;
};

const SERIAL_RE = /^[A-Za-z0-9._:-]{2,80}$/;

export function validSerial(serial: string): boolean {
  return SERIAL_RE.test(serial);
}

function candidate(name: string): string[] {
  const env = name === "adb" ? process.env.ADB_PATH : process.env.SCRCPY_PATH;
  return [
    env ?? "",
    path.join(adminRoot, "tools", `${name}.exe`),
    path.join(adminRoot, "tools", "platform-tools", `${name}.exe`),
    path.join(adminRoot, "tools", "scrcpy", `${name}.exe`),
    name,
  ].filter(Boolean);
}

export function findTool(name: "adb" | "scrcpy"): string {
  for (const item of candidate(name)) {
    if (item !== name && existsSync(item)) return item;
  }
  return name;
}

function run(command: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("La operación con el teléfono tardó demasiado."));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8") });
    });
  });
}

async function installed(name: "adb" | "scrcpy"): Promise<boolean> {
  try {
    const result = await run(findTool(name), name === "adb" ? ["version"] : ["--version"], 6000);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function adb(args: string[], timeoutMs = 20000): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  try {
    return await run(findTool("adb"), args, timeoutMs);
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (missing) throw new Error("No está instalado adb en esta computadora.");
    throw error;
  }
}

export function imeiEnTexto(text: string): string {
  const clean = text.replace(/\u0000/g, "");
  const labeled = clean.match(/IMEI[^0-9]{0,12}(\d{14,16})/i);
  if (labeled?.[1]) return labeled[1];
  const quoted = [...clean.matchAll(/'([^']*)'/g)].map((item) => item[1]).join("");
  const fromParcel = quoted.replace(/[.\s]/g, "").match(/\d{14,16}/)?.[0];
  if (fromParcel) return fromParcel;
  return clean.match(/(?:^|[\s:=])(\d{15})(?:\s|$)/)?.[1] ?? "";
}

async function readImei(serial: string): Promise<string> {
  const attempts = [
    ["-s", serial, "shell", "cmd", "phone", "get-imei", "0"],
    ["-s", serial, "shell", "service", "call", "iphonesubinfo", "1", "s16", "com.android.shell"],
    ["-s", serial, "shell", "service", "call", "iphonesubinfo", "1"],
    ["-s", serial, "shell", "dumpsys", "iphonesubinfo"],
  ];
  for (const args of attempts) {
    try {
      const result = await adb(args, 8000);
      const imei = imeiEnTexto(result.stdout.toString("utf8"));
      if (imei) return imei;
    } catch {
      // El siguiente método cubre otra versión de Android.
    }
  }
  return "";
}

export async function imeiDelDispositivoConectado(): Promise<string> {
  try {
    if (!(await installed("adb"))) return "";
    const listed = await adb(["devices", "-l"], 8000);
    const ready = parseDevices(listed.stdout.toString("utf8")).filter((device) => device.state === "device");
    if (ready.length !== 1) return "";
    return readImei(ready[0].serial);
  } catch {
    return "";
  }
}

async function prop(serial: string, key: string): Promise<string> {
  const result = await adb(["-s", serial, "shell", "getprop", key], 8000);
  return result.stdout.toString("utf8").replace(/\0/g, "").trim();
}

export async function usbStatus(): Promise<{ adb: boolean; scrcpy: boolean; devices: UsbDevice[] }> {
  const adbReady = await installed("adb");
  const scrcpy = await installed("scrcpy");
  if (!adbReady) return { adb: false, scrcpy, devices: [] };
  try {
    const listed = await adb(["devices", "-l"], 8000);
    const devices = parseDevices(listed.stdout.toString("utf8"));
    const detailed = await Promise.all(
      devices.map(async (device) => {
        if (device.state !== "device") return device;
        const [manufacturer, model, android, serialNo, bootSerial, imei] = await Promise.all([
          prop(device.serial, "ro.product.manufacturer").catch(() => ""),
          prop(device.serial, "ro.product.model").catch(() => ""),
          prop(device.serial, "ro.build.version.release").catch(() => ""),
          prop(device.serial, "ro.serialno").catch(() => ""),
          prop(device.serial, "ro.boot.serialno").catch(() => ""),
          readImei(device.serial),
        ]);
        return {
          ...device,
          manufacturer,
          model: model || device.model,
          android,
          hardwareSerial: serialNo || bootSerial,
          imei,
        };
      }),
    );
    return { adb: true, scrcpy, devices: detailed };
  } catch {
    return { adb: false, scrcpy, devices: [] };
  }
}

function parseDevices(text: string): UsbDevice[] {
  const devices: UsbDevice[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(device|unauthorized|offline)\b/);
    if (!match || match[1] === "List") continue;
    const model = line.match(/\bmodel:(\S+)/)?.[1]?.replaceAll("_", " ") ?? "";
    const state = match[2] === "device" || match[2] === "unauthorized" || match[2] === "offline" ? match[2] : "other";
    devices.push({
      serial: match[1],
      state,
      model,
      manufacturer: "",
      android: "",
      hardwareSerial: "",
      imei: "",
    });
  }
  return devices;
}

export async function captureScreen(serial: string): Promise<Buffer> {
  if (!validSerial(serial)) throw new Error("El identificador del teléfono no es válido.");
  const result = await adb(["-s", serial, "exec-out", "screencap", "-p"], 20000);
  if (result.code !== 0 || result.stdout.length < 32) {
    throw new Error(result.stderr.trim() || "No se pudo capturar la pantalla.");
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const start = result.stdout.indexOf(signature);
  if (start < 0) throw new Error("La captura no llegó como imagen.");
  return result.stdout.subarray(start);
}

export function tamanoGrabacion(width: number, height: number): string {
  const maxLong = 1600;
  const long = Math.max(width, height);
  const scale = long > maxLong ? maxLong / long : 1;
  const even = (value: number) => Math.max(16, Math.round((value * scale) / 16) * 16);
  return `${even(width)}x${even(height)}`;
}

function parseDisplaySize(text: string): { width: number; height: number } | undefined {
  const override = text.match(/Override size:\s*(\d+)x(\d+)/);
  const physical = text.match(/Physical size:\s*(\d+)x(\d+)/);
  const match = override ?? physical;
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function recordScreen(serial: string, seconds: number, destination: string): Promise<void> {
  if (!validSerial(serial)) throw new Error("El identificador del teléfono no es válido.");
  const measured = await adb(["-s", serial, "shell", "wm", "size"], 8000);
  const display = parseDisplaySize(measured.stdout.toString("utf8"));
  const size = display ? tamanoGrabacion(display.width, display.height) : "720x1280";
  const remote = "/sdcard/Download/evidia-pantalla.mp4";
  const recorded = await adb(
    ["-s", serial, "shell", "screenrecord", "--size", size, "--bit-rate", "8000000", "--time-limit", String(seconds), remote],
    seconds * 1000 + 20000,
  );
  if (recorded.code !== 0) {
    const detail = recorded.stderr.trim();
    if (detail.includes("Encoder failed")) {
      throw new Error("El teléfono no pudo iniciar el grabador de video. Cerrá el espejo de pantalla e intentá de nuevo.");
    }
    throw new Error(detail || "No se pudo grabar la pantalla.");
  }
  const pulled = await adb(["-s", serial, "pull", remote, destination], 60000);
  await adb(["-s", serial, "shell", "rm", "-f", remote], 8000).catch(() => undefined);
  if (pulled.code !== 0) throw new Error(pulled.stderr.trim() || "No se pudo copiar el video a esta PC.");
}

export async function mirrorScreen(serial: string): Promise<void> {
  if (!validSerial(serial)) throw new Error("El identificador del teléfono no es válido.");
  if (!(await installed("scrcpy"))) {
    throw new Error("Para espejar la pantalla hace falta scrcpy en esta computadora.");
  }
  const child = spawn(findTool("scrcpy"), ["--serial", serial, "--window-title", "EVIDIA — pantalla del teléfono"], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.on("error", () => undefined);
  child.unref();
}
