import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { cerrarVerificadorDni, evaluarTextoDni, verificarFotoDni } from "./dni-foto.js";

test("reconoce el texto de un DNI y rechaza otra cosa", () => {
  assert.equal(
    evaluarTextoDni("REPUBLICA ARGENTINA\nMERCOSUR\nDOCUMENTO NACIONAL DE IDENTIDAD\nDNI 30.111.222", "30111222"),
    "",
  );
  assert.equal(evaluarTextoDni("IDARG30111222<<<<<<<<<<<<<<<\n8001011F", "30111222"), "");
  assert.match(evaluarTextoDni("un gato durmiendo en el patio", "30111222"), /no parece un DNI/);
  assert.match(
    evaluarTextoDni("REPUBLICA ARGENTINA MERCOSUR DNI 27888999", "30111222"),
    /no coincide/,
  );
});

test("rechaza una imagen demasiado chica sin tratarla como documento", async () => {
  const error = await verificarFotoDni(pngSolido(80, 60, [20, 40, 80]), "30111222");
  assert.match(error, /muy chica/);
});

test("rechaza una foto que no es un DNI", { timeout: 120000 }, async () => {
  const error = await verificarFotoDni(pngSolido(900, 560, [30, 90, 160]), "30111222");
  assert.match(error, /no parece un DNI/);
});

test("acepta una foto en la que se lee el DNI", { timeout: 120000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "evidia-dni-"));
  const file = path.join(dir, "dni.png");
  const script = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 1200, 760
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font "Arial", 36, ([System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Black
$g.DrawString("REPUBLICA ARGENTINA", $font, $brush, 40, 40)
$g.DrawString("MERCOSUR", $font, $brush, 40, 130)
$g.DrawString("DOCUMENTO NACIONAL DE IDENTIDAD", $font, $brush, 40, 220)
$g.DrawString("DNI 30111222", $font, $brush, 40, 330)
$bmp.Save('${file.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;
  const drawn = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true });
  assert.equal(drawn.status, 0, drawn.stderr?.toString());
  const error = await verificarFotoDni(readFileSync(file), "30111222");
  assert.equal(error, "");
});

test.after(async () => {
  await cerrarVerificadorDni();
});

function pngSolido(width: number, height: number, rgb: [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const index = row + 1 + x * 3;
      raw[index] = rgb[0];
      raw[index + 1] = rgb[1];
      raw[index + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(8 + body.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 4 + body.length);
  return out;
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ~crc;
}
