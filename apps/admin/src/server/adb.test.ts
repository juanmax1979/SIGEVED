import assert from "node:assert/strict";
import test from "node:test";
import { elegirFotoNueva, imeiEnTexto, parseContentQuery, parseFindMedia, recortarMiniatura, rutaDeMedioPermitida, tamanoGrabacion } from "./adb.js";

test("lee el IMEI del texto que devuelve el teléfono", () => {
  assert.equal(imeiEnTexto("Result: Parcel(\n  0x00000000: 00350031 00330034 00350036 '1 4 3 5 6'\n  0x00000013: 00370038 00390030 00310032 '7 8 9 0 1 2'\n  0x00000026: 00330034 00350036 00000000 '3 4 5 6')"), "143567890123456");
  assert.equal(imeiEnTexto("IMEI: 356938035643809\n"), "356938035643809");
  assert.equal(imeiEnTexto("356938035643809\n"), "356938035643809");
  assert.equal(imeiEnTexto("sin identificador"), "");
});

test("lista imágenes y videos del teléfono y descarta otras rutas", () => {
  const consulta = [
    "Row: 0 _id=15, _display_name=IMG_1.jpg, _data=/storage/emulated/0/DCIM/Camera/IMG_1.jpg, _size=2048, date_added=10",
    "Row: 1 _display_name=nota.txt, _data=/storage/emulated/0/Download/nota.txt, _size=10, date_added=9",
    "Row: 2 _display_name=clip.mp4, _data=/sdcard/Movies/clip.mp4, _size=90, date_added=8",
  ].join("\n");
  assert.deepEqual(parseContentQuery(consulta, "imagen").map((item) => item.name), ["IMG_1.jpg"]);
  assert.equal(parseContentQuery(consulta, "imagen")[0]?.id, "15");
  assert.deepEqual(parseContentQuery(consulta, "video").map((item) => item.path), ["/sdcard/Movies/clip.mp4"]);
  const hallados = "/sdcard/DCIM/Camera/a.png\n/sdcard/Download/b.mp4\n/data/secret/c.jpg\n";
  assert.deepEqual(parseFindMedia(hallados, "imagen").map((item) => item.path), ["/sdcard/DCIM/Camera/a.png"]);
  assert.equal(rutaDeMedioPermitida("/sdcard/DCIM/../secret.jpg", "imagen"), false);
});

test("elige la foto nueva del teléfono y deja afuera las que ya estaban", () => {
  const conocidas = ["/sdcard/DCIM/Camera/vieja.jpg"];
  const actuales = [
    { id: "1", name: "vieja.jpg", path: "/sdcard/DCIM/Camera/vieja.jpg", size: 10, date: 1 },
    { id: "2", name: "dni.heic", path: "/sdcard/DCIM/Camera/dni.heic", size: 20, date: 3 },
    { id: "3", name: "dni.jpg", path: "/sdcard/DCIM/Camera/dni.jpg", size: 30, date: 2 },
  ];
  assert.equal(elegirFotoNueva(conocidas, actuales).foto?.path, "/sdcard/DCIM/Camera/dni.jpg");
  const yaVistas = ["/sdcard/DCIM/Camera/vieja.jpg", "/sdcard/DCIM/Camera/dni.jpg"];
  assert.equal(elegirFotoNueva(yaVistas, actuales).foto, undefined);
  assert.equal(elegirFotoNueva(yaVistas, actuales).incompatible, true);
});

test("recorta la miniatura aunque el teléfono anteponga un aviso", () => {
  const aviso = Buffer.from("Error: no es la imagen\n");
  const jpeg = Buffer.concat([aviso, Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
  const recorte = recortarMiniatura(jpeg);
  assert.equal(recorte?.[0], 0xff);
  assert.equal(recorte?.[1], 0xd8);
  assert.equal(recortarMiniatura(Buffer.from("sin imagen")), undefined);
});

test("reduce la pantalla del teléfono a un tamaño que el grabador acepta", () => {
  assert.equal(tamanoGrabacion(1220, 2712), "720x1600");
  assert.equal(tamanoGrabacion(2712, 1220), "1600x720");
  assert.equal(tamanoGrabacion(720, 1280), "720x1280");
});
