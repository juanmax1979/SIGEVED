import assert from "node:assert/strict";
import test from "node:test";
import { dniDeAtributos } from "./directorio.js";

test("toma el DNI del atributo employeeID de Active Directory", () => {
  assert.equal(dniDeAtributos("27324828", "20273248286"), "27324828");
  assert.equal(dniDeAtributos("", "20-27324828-6"), "27324828");
  assert.equal(dniDeAtributos("javalos", ""), "");
});
