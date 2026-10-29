import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { errorFormatoFoto } from "./dni-foto.js";

test("acepta una foto chica o que no parece un documento", () => {
  assert.equal(errorFormatoFoto(pngSolido(80, 60, [20, 40, 80])), "");
  assert.equal(errorFormatoFoto(pngSolido(900, 560, [30, 90, 160])), "");
  assert.match(errorFormatoFoto(Buffer.from("esto no es una foto")), /JPG o PNG/);
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
