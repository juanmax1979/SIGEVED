import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { sha256File } from "./hash.js";
import { makePairingCode, safeFilename } from "./store.js";

describe("custodia", () => {
  it("calcula una huella SHA-256 estable y distingue archivos", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "espejo-"));
    const left = path.join(dir, "a.txt");
    const right = path.join(dir, "b.txt");
    writeFileSync(left, "evidencia");
    writeFileSync(right, "otra evidencia");
    const hash = await sha256File(left);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(await sha256File(left), hash);
    assert.notEqual(await sha256File(right), hash);
  });

  it("genera un código legible y un nombre de archivo seguro", () => {
    const code = makePairingCode();
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(safeFilename("../../secreto.txt"), "secreto.txt");
    assert.equal(safeFilename("foto lesión.jpg"), "foto lesión.jpg");
  });
});
