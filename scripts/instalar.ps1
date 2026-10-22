$ErrorActionPreference = "Stop"

$dest = Join-Path $env:LOCALAPPDATA "SIGEVED"
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

$mismoLugar = [string]::Equals(
  [IO.Path]::GetFullPath($source).TrimEnd("\"),
  [IO.Path]::GetFullPath($dest).TrimEnd("\"),
  [StringComparison]::OrdinalIgnoreCase
)

if (-not $mismoLugar) {
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  & robocopy $source $dest /E /XD datos /NFL /NDL /NJH /NJS /NC /NS | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "No se pudo copiar la estación." }
  $datos = Join-Path $dest "datos"
  if (-not (Test-Path $datos)) {
    foreach ($anterior in @("SIGVED", "EVIDIA")) {
      $carpetaAnterior = Join-Path $env:LOCALAPPDATA $anterior
      $datosAnteriores = Join-Path $carpetaAnterior "datos"
      if (Test-Path (Join-Path $datosAnteriores "db.json")) {
        Get-Process -ErrorAction SilentlyContinue |
          Where-Object { try { $_.Path -like "$carpetaAnterior\*" } catch { $false } } |
          Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Move-Item $datosAnteriores $datos
        break
      }
    }
  }
  New-Item -ItemType Directory -Path $datos -Force | Out-Null
  foreach ($nombre in @("sigi.ejemplo.json", "sigi.json")) {
    $origen = Join-Path $source "datos\$nombre"
    $destinoArchivo = Join-Path $datos $nombre
    if ((Test-Path $origen) -and -not (Test-Path $destinoArchivo)) {
      Copy-Item $origen $destinoArchivo
    }
  }
}

$shell = New-Object -ComObject WScript.Shell
foreach ($carpeta in @(
  [Environment]::GetFolderPath("Desktop"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
)) {
  foreach ($viejo in @("SIGVED.lnk", "EVIDIA.lnk")) {
    Remove-Item (Join-Path $carpeta $viejo) -ErrorAction SilentlyContinue
  }
  $acceso = $shell.CreateShortcut((Join-Path $carpeta "SIGEVED.lnk"))
  $acceso.TargetPath = Join-Path $dest "SIGEVED.exe"
  $acceso.WorkingDirectory = $dest
  $acceso.Description = "Estación SIGEVED"
  $acceso.IconLocation = "$(Join-Path $dest 'SIGEVED.ico'),0"
  $acceso.Save()
}

Start-Process (Join-Path $dest "SIGEVED.exe")
