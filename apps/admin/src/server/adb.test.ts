import assert from "node:assert/strict";
import test from "node:test";
import { imeiEnTexto, tamanoGrabacion } from "./adb.js";

test("lee el IMEI del texto que devuelve el teléfono", () => {
  assert.equal(imeiEnTexto("Result: Parcel(\n  0x00000000: 00350031 00330034 00350036 '1 4 3 5 6'\n  0x00000013: 00370038 00390030 00310032 '7 8 9 0 1 2'\n  0x00000026: 00330034 00350036 00000000 '3 4 5 6')"), "143567890123456");
  assert.equal(imeiEnTexto("IMEI: 356938035643809\n"), "356938035643809");
  assert.equal(imeiEnTexto("356938035643809\n"), "356938035643809");
  assert.equal(imeiEnTexto("sin identificador"), "");
});

test("reduce la pantalla del teléfono a un tamaño que el grabador acepta", () => {
  assert.equal(tamanoGrabacion(1220, 2712), "720x1600");
  assert.equal(tamanoGrabacion(2712, 1220), "1600x720");
  assert.equal(tamanoGrabacion(720, 1280), "720x1280");
});
