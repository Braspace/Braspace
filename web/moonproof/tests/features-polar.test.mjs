// Teste do catálogo de feições polares (BR70 / MoonProof).
// Fonte: Gazetteer of Planetary Nomenclature, IAU/USGS. Verifica estrutura, recorte de latitude, duplicatas e URL.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile(new URL("../data/features.json", import.meta.url), "utf8"));

test("cabeçalho de fonte e data de acesso", () => {
  assert.match(data.source, /Gazetteer of Planetary Nomenclature/);
  assert.match(data.accessed_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("lista não vazia e todas as feições têm campos obrigatórios", () => {
  assert.ok(Array.isArray(data.features) && data.features.length > 0);
  for (const f of data.features) {
    assert.equal(typeof f.name, "string"); assert.ok(f.name.length > 0);
    assert.ok(["Crater", "Mons"].includes(f.type), f.name);
    assert.equal(typeof f.lat, "number");
    assert.equal(typeof f.lon_e, "number");
    assert.ok(f.lon_e > -180 && f.lon_e <= 180, `lon fora de (-180,180]: ${f.name}`);
    assert.equal(typeof f.diameter_km, "number"); assert.ok(f.diameter_km > 0, f.name);
  }
});

test("todas as latitudes são ≤ -84 (ao sul de 84°S)", () => {
  for (const f of data.features) assert.ok(f.lat <= -84, `${f.name} em ${f.lat}`);
});

test("sem duplicata de nome", () => {
  const seen = new Set();
  for (const f of data.features) { assert.ok(!seen.has(f.name), `duplicado: ${f.name}`); seen.add(f.name); }
});

test("toda feição tem URL da ficha USGS", () => {
  for (const f of data.features)
    assert.match(f.url, /^https?:\/\/planetarynames\.wr\.usgs\.gov\/Feature\/\d+$/, f.name);
});

test("as nove feições pedidas estão presentes", () => {
  const names = new Set(data.features.map((f) => f.name));
  for (const n of ["Shackleton", "de Gerlache", "Haworth", "Shoemaker", "Faustini", "Nobile", "Sverdrup", "Slater", "Mons Mouton"])
    assert.ok(names.has(n), n);
});
