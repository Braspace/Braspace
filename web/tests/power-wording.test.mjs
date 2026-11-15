import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

// BS-040: the UI must not equate geometric Sun visibility with produced energy.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=f=>readFile(path.join(root,f),"utf-8");

test("the mission form says solar power is an assumed input, not a result",async()=>{
  const html=await read("index.html");
  assert.match(html,/Assumed solar power \(W\)/);
  assert.match(html,/Power is an assumed constant whenever the synthetic Sun is visible/);
  assert.match(html,/Earth geometric visibility only, not an RF link/);
});

test("the status line states there is no validated power or RF model",async()=>{
  const js=await read("app.js");
  assert.match(js,/no real NASA elevation, validated ephemerides or spacecraft RF\/power model/);
});

test("the guidance document exists and forbids energy wording for visibility",async()=>{
  const md=await readFile(path.join(root,"..","docs","SOLAR_ANGLE_VS_POWER.md"),"utf-8");
  assert.match(md,/never reported as energy produced/);
  assert.match(md,/Do not use: "power available"/);
});
