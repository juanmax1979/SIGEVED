$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$allowed = @(
  "procNumeradorDatosUsuarioSIGI_DepsCircNomyApe",
  "procNumeradorDatosExpteCaratProcDepRadic",
  "spGetDatosLoginNumerador",
  "spGetDatosExpedienteNumerador"
)

try {
  Add-Type -AssemblyName System.Data
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $reader = New-Object System.IO.StreamReader ([Console]::OpenStandardInput()), $utf8
  $cfg = $reader.ReadToEnd() | ConvertFrom-Json
  if ($allowed -notcontains $cfg.procedure) {
    throw "Procedimiento no habilitado."
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
    } else {
      $cmd = $conn.CreateCommand()
      $cmd.CommandType = [System.Data.CommandType]::StoredProcedure
      $schemaName = [string]$cfg.schema
      if ($schemaName) { $cmd.CommandText = "$schemaName.$($cfg.procedure)" } else { $cmd.CommandText = [string]$cfg.procedure }
      $parametros = @()
      if ($cfg.parameters) { $parametros = @($cfg.parameters) }
      elseif ($cfg.parameter) { $parametros = @($cfg.parameter) }
      foreach ($parameter in $parametros) {
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
          "varchar" { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::VarChar, 255); $added.Value = $raw }
          default { $added = $cmd.Parameters.Add($name, [System.Data.SqlDbType]::NVarChar, 200); $added.Value = $raw }
        }
      }
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
