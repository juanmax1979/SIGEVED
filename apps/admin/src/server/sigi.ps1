$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$allowed = @(
  "procNumeradorDatosUsuarioSIGI_DepsCircNomyApe",
  "procNumeradorDatosExpteCaratProcDepRadic",
  "usp_PruebaDigital_VerificarIncorporacion",
  "spGetDatosLoginNumerador",
  "spGetDatosExpedienteNumerador"
)

function Add-SqlParameter($cmd, $parameter) {
  $name = [string]$parameter.name
  $type = ([string]$parameter.type).ToLower()
  $raw = [string]$parameter.value
  switch ($type) {
    "int" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::Int); $added.Value = [int]$raw }
    "bigint" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::BigInt); $added.Value = [int64]$raw }
    "smallint" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::SmallInt); $added.Value = [int16]$raw }
    "tinyint" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::TinyInt); $added.Value = [byte]$raw }
    "decimal" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::Decimal); $added.Value = [decimal]$raw }
    "numeric" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::Decimal); $added.Value = [decimal]$raw }
    "float" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::Float); $added.Value = [double]$raw }
    "real" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::Real); $added.Value = [single]$raw }
    "char" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::Char, 64); $added.Value = $raw }
    "varchar" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::VarChar, 260); $added.Value = $raw }
    default { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::NVarChar, 260); $added.Value = $raw }
  }
}

function Invoke-Procedure($connection, $call) {
  $cmd = $connection.CreateCommand()
  $cmd.CommandType = [System.Data.CommandType]::StoredProcedure
  $schemaName = [string]$call.schema
  if ($schemaName) { $cmd.CommandText = "$schemaName.$($call.procedure)" } else { $cmd.CommandText = [string]$call.procedure }
  $parametros = @()
  if ($call.parameters) { $parametros = @($call.parameters) }
  elseif ($call.parameter) { $parametros = @($call.parameter) }
  foreach ($parameter in $parametros) { Add-SqlParameter $cmd $parameter }
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
  $table = New-Object System.Data.DataTable
  [void]$adapter.Fill($table)
  $rows = @()
  foreach ($row in $table.Rows) {
    $obj = [ordered]@{}
    foreach ($col in $table.Columns) {
      $val = $row[$col]
      if ($null -eq $val -or $val -is [System.DBNull]) { $obj[$col.ColumnName] = "" }
      else { $obj[$col.ColumnName] = [string]$val }
    }
    $rows += [pscustomobject]$obj
  }
  return @($rows)
}

try {
  Add-Type -AssemblyName System.Data
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $reader = New-Object System.IO.StreamReader ([Console]::OpenStandardInput()), $utf8
  $cfg = $reader.ReadToEnd() | ConvertFrom-Json
  $calls = @()
  if ($cfg.action -eq "exec-batch") { $calls = @($cfg.calls) }
  elseif ($cfg.procedure) { $calls = @($cfg) }
  if ($calls.Count -eq 0) { throw "Procedimiento no habilitado." }
  foreach ($call in $calls) {
    if ($allowed -notcontains [string]$call.procedure) { throw "Procedimiento no habilitado." }
  }
  $conn = New-Object System.Data.SqlClient.SqlConnection $cfg.connectionString
  $conn.Open()
  try {
    if ($cfg.action -eq "describe") {
      $cmd = $conn.CreateCommand()
      $cmd.CommandText = @"
SELECT SPECIFIC_SCHEMA, PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE
FROM INFORMATION_SCHEMA.PARAMETERS
WHERE SPECIFIC_NAME = @proc
ORDER BY ORDINAL_POSITION
"@
      $null = $cmd.Parameters.Add("@proc", [System.Data.SqlDbType]::NVarChar, 128)
      $cmd.Parameters["@proc"].Value = $cfg.procedure
      $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
      $table = New-Object System.Data.DataTable
      [void]$adapter.Fill($table)
      $schema = ""
      $parameters = @()
      foreach ($row in $table.Rows) {
        if (-not $schema) { $schema = [string]$row["SPECIFIC_SCHEMA"] }
        $parameters += [pscustomobject]@{
          name = [string]$row["PARAMETER_NAME"]
          type = [string]$row["DATA_TYPE"]
          mode = [string]$row["PARAMETER_MODE"]
        }
      }
      if (-not $schema) {
        $exists = $conn.CreateCommand()
        $exists.CommandText = "SELECT TOP 1 SPECIFIC_SCHEMA FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_NAME = @proc AND ROUTINE_TYPE = 'PROCEDURE'"
        $null = $exists.Parameters.Add("@proc", [System.Data.SqlDbType]::NVarChar, 128)
        $exists.Parameters["@proc"].Value = $cfg.procedure
        $schemaValue = $exists.ExecuteScalar()
        if ($schemaValue) { $schema = [string]$schemaValue }
      }
      [pscustomobject]@{ schema = $schema; parameters = $parameters } | ConvertTo-Json -Depth 4 -Compress
    } elseif ($cfg.action -eq "exec-batch") {
      $resultados = @()
      foreach ($call in $calls) {
        $rows = Invoke-Procedure $conn $call
        $resultados += [pscustomobject]@{ rows = $rows }
      }
      [pscustomobject]@{ resultados = @($resultados) } | ConvertTo-Json -Depth 6 -Compress
    } else {
      $rows = Invoke-Procedure $conn $cfg
      if ($rows.Count -eq 0) { Write-Output "[]" }
      else { $rows | ConvertTo-Json -Depth 4 -Compress }
    }
  } finally {
    $conn.Close()
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
