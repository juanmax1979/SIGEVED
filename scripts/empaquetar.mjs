import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");
const paquete = path.join(release, "SIGVED");
const appDir = path.join(paquete, "app");
const csc = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: command === "npm" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} terminó con código ${result.status ?? "desconocido"}.`);
  }
}

function esperar(url, child) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error("La estación empaquetada se cerró antes de responder."));
        return;
      }
      try {
        const response = await fetch(url);
        if (response.ok) {
          clearInterval(timer);
          resolve(await response.json());
        }
      } catch {
        // todavía está arrancando
      }
    }, 300);
    setTimeout(() => {
      clearInterval(timer);
      reject(new Error("La estación empaquetada no respondió a tiempo."));
    }, 20000);
  });
}

if (!existsSync(path.join(root, "node_modules", "esbuild", "package.json"))) {
  console.log("Instalando esbuild...");
  run("npm", ["install", "--save-dev", "esbuild"]);
}

console.log("Compilando la interfaz...");
run("npm", ["run", "build", "--workspace", "@espejo/admin"]);

console.log("Empaquetando el servidor...");
rmSync(paquete, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
const esbuild = await import(pathToFileURL(path.join(root, "node_modules", "esbuild", "lib", "main.js")).href);
await esbuild.build({
  entryPoints: [path.join(root, "apps", "admin", "src", "server", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: path.join(appDir, "server.mjs"),
  external: ["archiver", "cors", "docx", "express", "multer", "pdfkit", "tesseract.js", "zod"],
  logLevel: "info",
});

cpSync(path.join(root, "apps", "admin", "src", "server", "sigi.ps1"), path.join(appDir, "sigi.ps1"));
cpSync(path.join(root, "apps", "admin", "dist"), path.join(appDir, "dist"), { recursive: true });
cpSync(path.join(root, "apps", "admin", "tessdata"), path.join(appDir, "tessdata"), { recursive: true });
const tools = path.join(root, "apps", "admin", "tools");
if (existsSync(tools)) cpSync(tools, path.join(appDir, "tools"), { recursive: true });

const serverPackage = {
  name: "evidia-estacion",
  private: true,
  type: "module",
  dependencies: {
    archiver: "^7.0.1",
    cors: "^2.8.5",
    express: "^5.1.0",
    multer: "^2.0.2",
    docx: "^9.13.0",
    pdfkit: "^0.20.2",
    "tesseract.js": "^7.0.0",
    zod: "^4.1.5",
  },
};
writeFileSync(path.join(appDir, "package.json"), JSON.stringify(serverPackage, null, 2));
console.log("Instalando las librerías de la estación...");
run("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-package-lock", "--no-fund", "--no-audit"], appDir);

mkdirSync(path.join(paquete, "runtime"), { recursive: true });
cpSync(process.execPath, path.join(paquete, "runtime", "node.exe"));

mkdirSync(path.join(paquete, "datos"), { recursive: true });
writeFileSync(
  path.join(paquete, "datos", "sigi.ejemplo.json"),
  `${JSON.stringify({ server: "SERVIDOR", database: "BASE_SIGI" }, null, 2)}\n`,
);
const sigiLocal = path.join(root, "apps", "admin", "data", "sigi.json");
if (existsSync(sigiLocal)) cpSync(sigiLocal, path.join(paquete, "datos", "sigi.json"));

writeFileSync(
  path.join(paquete, "LEEME.txt"),
  [
    "SIGVED",
    "Sistema Integrado de Gestión Voluntario de Evidencia Digital",
    "Poder Judicial del Chaco",
    "",
    "Instalar en esta PC:",
    "  Ejecutá Instalar-SIGVED.exe, o, si descomprimiste la carpeta, Instalar.bat.",
    "  Queda en %LOCALAPPDATA%\\SIGVED y crea un acceso directo.",
    "",
    "Probar sin instalar:",
    "  Ejecutá SIGVED.exe dentro de esta carpeta.",
    "",
    "SIGI y Active Directory:",
    "  Si el paquete trae datos\\sigi.json, la estación ya puede consultar SIGI.",
    "  Si no está, copiá datos\\sigi.ejemplo.json como datos\\sigi.json y completá server y database.",
    "  Si la PC está en el dominio y el archivo no trae usuario, usa la cuenta de Windows.",
    "  El DNI sale del atributo employeeID de la cuenta que inició sesión.",
    "",
    "La primera vez Windows puede pedir permiso de firewall para node.exe.",
    "Aceptalo en redes privadas para que el teléfono pueda conectarse.",
    "",
    "Cerrar la ventana de SIGVED detiene la estación.",
    "El registro queda en datos\\estacion.log.",
    "",
  ].join("\r\n"),
);

cpSync(path.join(root, "scripts", "instalar.ps1"), path.join(paquete, "instalar.ps1"));
writeFileSync(
  path.join(paquete, "Instalar.bat"),
  "@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0instalar.ps1\"\r\n",
);

if (!existsSync(csc)) throw new Error("No encuentro el compilador de .NET Framework para armar SIGVED.exe.");
const icono = path.join(paquete, "SIGVED.ico");
console.log("Preparando el ícono...");
run("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  path.join(root, "scripts", "crear-icono.ps1"),
  "-Origen",
  path.join(root, "apps", "mobile", "assets", "icon.png"),
  "-Destino",
  icono,
]);
console.log("Compilando SIGVED.exe...");
run(csc, [
  "/nologo",
  "/target:winexe",
  "/optimize",
  "/win32icon:" + icono,
  "/r:System.Windows.Forms.dll",
  "/r:System.Drawing.dll",
  `/out:${path.join(paquete, "SIGVED.exe")}`,
  path.join(root, "scripts", "evidia-launcher.cs"),
]);

console.log("Probando el paquete...");
const datosPrueba = path.join(os.tmpdir(), "evidia-paquete-prueba");
rmSync(datosPrueba, { recursive: true, force: true });
mkdirSync(datosPrueba, { recursive: true });
const child = spawn(path.join(paquete, "runtime", "node.exe"), [path.join(appDir, "server.mjs")], {
  cwd: appDir,
  env: { ...process.env, ESPEJO_ROOT: appDir, ESPEJO_DATA_DIR: datosPrueba, PORT: "4791" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let registro = "";
child.stdout.on("data", (chunk) => {
  registro += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  registro += chunk.toString();
});
try {
  const health = await esperar("http://127.0.0.1:4791/api/health", child);
  if (!health.ok) throw new Error("La estación no respondió ok.");
  const inicio = await fetch("http://127.0.0.1:4791/");
  if (!inicio.ok) throw new Error("La interfaz no se sirve desde el paquete.");
  console.log("La estación empaquetada respondió.");
} catch (error) {
  console.error(registro);
  throw error;
} finally {
  child.kill();
}

const zip = path.join(release, "SIGVED.zip");
if (existsSync(zip)) rmSync(zip);
console.log("Comprimiendo...");
run("tar", ["-a", "-c", "-f", zip, "-C", release, "SIGVED"]);

const instalador = path.join(release, "Instalar-SIGVED.exe");
const payload = path.join(release, "payload-instalador");
rmSync(payload, { recursive: true, force: true });
mkdirSync(payload, { recursive: true });
cpSync(zip, path.join(payload, "SIGVED.zip"));
cpSync(path.join(root, "scripts", "instalar.ps1"), path.join(payload, "instalar.ps1"));
writeFileSync(
  path.join(payload, "instalar.cmd"),
  "@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0instalar.ps1\"\r\n",
);

const sed = path.join(release, "evidia.sed");
const q = (value) => value.replace(/\\/g, "\\\\");
writeFileSync(
  sed,
  [
    "[Version]",
    "Class=IEXPRESS",
    "SEDVersion=3",
    "[Options]",
    "PackagePurpose=InstallApp",
    "ShowInstallProgramWindow=1",
    "HideExtractAnimation=1",
    "UseLongFileName=1",
    "InsideCompressed=0",
    "CAB_FixedSize=0",
    "CAB_ResvCodeSigning=0",
    "RebootMode=N",
    "InstallPrompt=%InstallPrompt%",
    "DisplayLicense=%DisplayLicense%",
    "FinishMessage=%FinishMessage%",
    "TargetName=%TargetName%",
    "FriendlyName=%FriendlyName%",
    "AppLaunched=%AppLaunched%",
    "PostInstallCmd=%PostInstallCmd%",
    "AdminQuietInstCmd=%AdminQuietInstCmd%",
    "UserQuietInstCmd=%UserQuietInstCmd%",
    "SourceFiles=SourceFiles",
    "[SourceFiles]",
    `SourceFiles0=${payload}\\`,
    "[SourceFiles0]",
    "%FILE0%=",
    "%FILE1%=",
    "%FILE2%=",
    "[Strings]",
    "InstallPrompt=",
    "DisplayLicense=",
    "FinishMessage=SIGVED quedó instalado. Se abrió la estación.",
    `TargetName=${q(instalador)}`,
    "FriendlyName=SIGVED",
    "AppLaunched=instalar.cmd",
    "PostInstallCmd=<None>",
    "AdminQuietInstCmd=",
    "UserQuietInstCmd=",
    'FILE0="SIGVED.zip"',
    'FILE1="instalar.ps1"',
    'FILE2="instalar.cmd"',
    "",
  ].join("\r\n"),
);

console.log("Armando el instalador...");
const iexpress = spawnSync(path.join(process.env.WINDIR ?? "C:\\Windows", "System32", "iexpress.exe"), ["/N", "/Q", sed], {
  stdio: "inherit",
});
if (iexpress.status !== 0 || !existsSync(instalador)) {
  console.log("No se pudo armar el .exe de instalación. Quedaron la carpeta y el zip.");
} else {
  console.log(instalador);
}

console.log(paquete);
console.log(zip);
