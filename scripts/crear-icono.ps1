param(
  [Parameter(Mandatory = $true)][string]$Origen,
  [Parameter(Mandatory = $true)][string]$Destino
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Write-Int32([byte[]]$buffer, [int]$offset, [int]$value) {
  [Array]::Copy([BitConverter]::GetBytes($value), 0, $buffer, $offset, 4)
}

function Write-Int16([byte[]]$buffer, [int]$offset, [int]$value) {
  [Array]::Copy([BitConverter]::GetBytes([int16]$value), 0, $buffer, $offset, 2)
}

function Get-Dib([System.Drawing.Bitmap]$bmp) {
  $width = $bmp.Width
  $height = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $raw = New-Object byte[] ($stride * $height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $raw, 0, $raw.Length)
  $bmp.UnlockBits($data)

  $xor = New-Object byte[] ($width * $height * 4)
  $maskStride = [int]([Math]::Ceiling($width / 32.0) * 4)
  $mask = New-Object byte[] ($maskStride * $height)
  for ($y = 0; $y -lt $height; $y++) {
    $src = $y * $stride
    $dst = ($height - 1 - $y) * $width * 4
    [Array]::Copy($raw, $src, $xor, $dst, $width * 4)
    for ($x = 0; $x -lt $width; $x++) {
      if ($raw[$src + ($x * 4) + 3] -lt 128) {
        $index = (($height - 1 - $y) * $maskStride) + [Math]::Floor($x / 8)
        $shift = 7 - ($x % 8)
        $mask[$index] = [byte]($mask[$index] -bor [byte][Math]::Pow(2, $shift))
      }
    }
  }

  $header = New-Object byte[] 40
  Write-Int32 $header 0 40
  Write-Int32 $header 4 $width
  Write-Int32 $header 8 ($height * 2)
  Write-Int16 $header 12 1
  Write-Int16 $header 14 32
  Write-Int32 $header 20 $xor.Length

  $stream = New-Object System.IO.MemoryStream
  $stream.Write($header, 0, $header.Length)
  $stream.Write($xor, 0, $xor.Length)
  $stream.Write($mask, 0, $mask.Length)
  $bytes = $stream.ToArray()
  $stream.Dispose()
  return ,$bytes
}

$src = [System.Drawing.Bitmap]::FromFile($Origen)
$sizes = 16, 24, 32, 48, 64, 128, 256
$images = New-Object System.Collections.Generic.List[byte[]]
foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $bmp.SetResolution($src.HorizontalResolution, $src.VerticalResolution)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $g.Dispose()
  $images.Add((Get-Dib $bmp))
  $bmp.Dispose()
}
$src.Dispose()

$fs = [System.IO.File]::Create($Destino)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$images.Count)
$offset = 6 + (16 * $images.Count)
for ($i = 0; $i -lt $images.Count; $i++) {
  $size = if ($sizes[$i] -ge 256) { [byte]0 } else { [byte]$sizes[$i] }
  $bw.Write($size)
  $bw.Write($size)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]32)
  $bw.Write([uint32]$images[$i].Length)
  $bw.Write([uint32]$offset)
  $offset += $images[$i].Length
}
foreach ($image in $images) { $bw.Write($image) }
$bw.Flush()
$bw.Dispose()
$fs.Dispose()
