import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

// BS-040: the UI must not equate geometric Sun visibility with produced energy.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=f=>readFile(path.join(root,f),"utf-8");

test("the guidance document exists and forbids energy wording for visibility",async()=>{
  const md=await readFile(path.join(root,"..","docs","SOLAR_ANGLE_VS_POWER.md"),"utf-8");
  assert.match(md,/never reported as energy produced/);
  assert.match(md,/Do not use: "power available"/);
});
