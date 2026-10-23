$ErrorActionPreference = "Stop"

function SoyAdministrador {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (SoyAdministrador)) {
  try {
    $pedido = Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit $(if ($null -eq $pedido.ExitCode) { 1 } else { $pedido.ExitCode })
  } catch {
    Write-Error "Para instalar SIGEVED para todos los usuarios hay que aceptar el permiso de administrador."
    exit 1
  }
}

$dest = Join-Path $env:ProgramFiles "SIGEVED"
$datos = Join-Path $env:ProgramData "SIGEVED"
$here = $PSScriptRoot

if (Test-Path (Join-Path $here "SIGEVED.exe")) {
  $source = $here
} else {
  $zip = Join-Path $here "SIGEVED.zip"
  if (-not (Test-Path $zip)) {
    throw "No encuentro SIGEVED.exe ni SIGEVED.zip junto a este instalador."
  }
  $stage = Join-Path $env:TEMP "evidia-setup"
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  New-Item -ItemType Directory -Path $stage | Out-Null
  tar -xf $zip -C $stage
  $source = Join-Path $stage "SIGEVED"
}

if (-not (Test-Path (Join-Path $source "SIGEVED.exe"))) {
  throw "El paquete no trae SIGEVED.exe."
}

function DetenerEn([string]$carpeta) {
  if (-not (Test-Path $carpeta)) { return }
  $prefijo = [IO.Path]::GetFullPath($carpeta)
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { try { $_.Path -and $_.Path.StartsWith($prefijo, [StringComparison]::OrdinalIgnoreCase) } catch { $false } } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

DetenerEn $dest
DetenerEn (Join-Path $env:LOCALAPPDATA "SIGEVED")
Start-Sleep -Seconds 1

$mismoLugar = [string]::Equals(
  [IO.Path]::GetFullPath($source).TrimEnd("\"),
  [IO.Path]::GetFullPath($dest).TrimEnd("\"),
  [StringComparison]::OrdinalIgnoreCase
)

if (-not $mismoLugar) {
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  & robocopy $source $dest /E /XD datos /NFL /NDL /NJH /NJS /NC /NS | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "No se pudo copiar la estación." }
}

New-Item -ItemType Directory -Path $datos -Force | Out-Null
if (-not (Test-Path (Join-Path $datos "db.json"))) {
  foreach ($anterior in @(
    (Join-Path $env:LOCALAPPDATA "SIGEVED\datos"),
    (Join-Path $env:LOCALAPPDATA "SIGVED\datos"),
    (Join-Path $env:LOCALAPPDATA "EVIDIA\datos")
  )) {
    if (Test-Path (Join-Path $anterior "db.json")) {
      Copy-Item (Join-Path $anterior "*") $datos -Recurse -Force
      break
    }
  }
}
foreach ($nombre in @("sigi.ejemplo.json", "sigi.json")) {
  $origen = Join-Path $source "datos\$nombre"
  $destinoArchivo = Join-Path $datos $nombre
  if ((Test-Path $origen) -and -not (Test-Path $destinoArchivo)) {
    Copy-Item $origen $destinoArchivo
  }
}

& icacls $datos /grant "*S-1-5-32-545:(OI)(CI)M" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw "No se pudo dar permiso de uso a todos los usuarios de Windows." }

$shell = New-Object -ComObject WScript.Shell
$comunes = @(
  [Environment]::GetFolderPath("CommonDesktopDirectory"),
  [Environment]::GetFolderPath("CommonPrograms")
) | Where-Object { $_ }
$todos = [System.Collections.Generic.List[string]]::new()
foreach ($carpeta in $comunes) { $todos.Add($carpeta) }
foreach ($carpeta in @(
  [Environment]::GetFolderPath("Desktop"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
)) {
  if ($carpeta) { $todos.Add($carpeta) }
}
foreach ($carpeta in $todos) {
  foreach ($viejo in @("SIGEVED.lnk", "SIGVED.lnk", "EVIDIA.lnk")) {
    Remove-Item (Join-Path $carpeta $viejo) -ErrorAction SilentlyContinue
  }
}
foreach ($carpeta in $comunes) {
  if (-not $carpeta) { continue }
  $acceso = $shell.CreateShortcut((Join-Path $carpeta "SIGEVED.lnk"))
  $acceso.TargetPath = Join-Path $dest "SIGEVED.exe"
  $acceso.WorkingDirectory = $dest
  $acceso.Description = "Estación SIGEVED"
  $acceso.IconLocation = "$(Join-Path $dest 'SIGEVED.ico'),0"
  $acceso.Save()
}

Start-Process (Join-Path $dest "SIGEVED.exe")
