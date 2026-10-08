import { spawn } from "node:child_process";

export function dniDeAtributos(employeeId: string, employeeNumber: string): string {
  const id = employeeId.replace(/\D/g, "");
  if (id.length >= 7 && id.length <= 8) return id;
  const cuil = employeeNumber.replace(/\D/g, "");
  if (cuil.length >= 10 && cuil.length <= 11) {
    const dni = cuil.slice(2, -1);
    if (dni.length >= 7 && dni.length <= 8) return dni;
  }
  return "";
}

const script = `
$ErrorActionPreference = 'Stop'
$sid = ([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value
$entry = [ADSI]("LDAP://<SID=" + $sid + ">")
$id = [string]$entry.psbase.Properties['employeeID'].Value
$number = [string]$entry.psbase.Properties['employeeNumber'].Value
Write-Output ($id + "|" + $number)
`;

let cache: Promise<string> | undefined;

export function dniDesdeDirectorio(): Promise<string> {
  cache ??= leerDni();
  return cache;
}

function leerDni(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
    const out: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      resolve("");
    }, 8000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
    child.on("close", () => {
      clearTimeout(timer);
      const [id = "", number = ""] = Buffer.concat(out).toString("utf8").trim().split("|");
      resolve(dniDeAtributos(id, number));
    });
  });
}
