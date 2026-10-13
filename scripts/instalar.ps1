$ErrorActionPreference = "Stop"

$dest = Join-Path $env:LOCALAPPDATA "EVIDIA"
$here = $PSScriptRoot

if (Test-Path (Join-Path $here "EVIDIA.exe")) {
  $source = $here
} else {
  $zip = Join-Path $here "EVIDIA.zip"
  if (-not (Test-Path $zip)) {
    throw "No encuentro EVIDIA.exe ni EVIDIA.zip junto a este instalador."
  }
  $stage = Join-Path $env:TEMP "evidia-setup"
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  New-Item -ItemType Directory -Path $stage | Out-Null
  tar -xf $zip -C $stage
  $source = Join-Path $stage "EVIDIA"
}

if (-not (Test-Path (Join-Path $source "EVIDIA.exe"))) {
  throw "El paquete no trae EVIDIA.exe."
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
  $acceso = $shell.CreateShortcut((Join-Path $carpeta "EVIDIA.lnk"))
  $acceso.TargetPath = Join-Path $dest "EVIDIA.exe"
  $acceso.WorkingDirectory = $dest
  $acceso.Description = "Estación EVIDIA"
  $acceso.IconLocation = "$(Join-Path $dest 'EVIDIA.ico'),0"
  $acceso.Save()
}

Start-Process (Join-Path $dest "EVIDIA.exe")
