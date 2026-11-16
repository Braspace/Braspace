import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateQuestion, gradeChoice, unavailableQuizMetric } from "../screens/quiz-grading.js";
const m = (night, earth) => ({longestDarkH:{value:night},longestBlackoutH:{value:earth}});
const limits = { night:60, blackout:72 };
test("Q2 evaluates darkness only; Q3 evaluates Earth only", () => {
  const metrics=[m(30,90), m(90,30), m(90,90)];
  assert.deepEqual(evaluateQuestion(2,metrics,limits).correctIds, ["A"]);
  assert.deepEqual(evaluateQuestion(3,metrics,limits).correctIds, ["B"]);
  assert.deepEqual(evaluateQuestion(4,metrics,limits).correctIds, ["none"]);
});
test("Q1 and Q4 accept ALL genuinely qualifying scenarios, not only a fixed answer index",()=>{
 const metrics=[m(20,20),m(40,30),m(80,20)];
 for(const q of [1,4]) {
   const out=evaluateQuestion(q,metrics,limits);
   assert.deepEqual(out.correctIds,["A","B"]);
   assert.equal(gradeChoice("B",out),"correct");
   assert.equal(gradeChoice("C",out),"incorrect");
 }
});
test("none-of-the-above is correct when every scenario definitely fails",()=>{
 const out=evaluateQuestion(4,[m(70,100),m(85,88),m(75,98)],limits);
 assert.deepEqual(out.correctIds,["none"]);
 assert.equal(gradeChoice("none",out),"correct");
});
test("not-computed is not wrong; a known failure remains a failure",()=>{
 const r=evaluateQuestion(4,[m(null,60),m(80,null),m(null,null)],limits);
 assert.equal(r.status,"unknown");
 assert.deepEqual(r.verdicts,[null,false,null]);
 assert.deepEqual(r.correctIds,[]);
 assert.equal(gradeChoice("A",r),"unknown");
});
test("Q2 only requires darkness; Q3 only requires communication",()=>{
 assert.deepEqual(evaluateQuestion(2,[m(30,null)],limits).correctIds,["A"]);
 assert.deepEqual(evaluateQuestion(3,[m(null,30)],limits).correctIds,["A"]);
});

test("a missing-data scenario is inconclusive even when another scenario passes",()=>{
 const out = evaluateQuestion(4,[m(20,20),m(null,30),m(80,80)],limits);
 assert.deepEqual(out.verdicts,[true,null,false]);
 assert.deepEqual(out.correctIds,["A"]);
 assert.equal(gradeChoice("A",out),"correct");
 assert.equal(gradeChoice("B",out),"unknown");
 assert.equal(gradeChoice("C",out),"incorrect");
 assert.equal(gradeChoice("none",out),"incorrect");
});
test("an empty catalogue does not fabricate a None-of-the-above answer",()=>{
 const out = evaluateQuestion(4,[],limits);
 assert.equal(out.status,"unknown");
 assert.deepEqual(out.correctIds,[]);
 assert.equal(gradeChoice("none",out),"unknown");
});

test("an unavailable per-scenario lookup remains inconclusive without losing other evidence",()=>{
 const bad=unavailableQuizMetric();
 assert.deepEqual(bad,{longestDarkH:{value:null},longestBlackoutH:{value:null}});
 const out=evaluateQuestion(4,[m(20,30),bad,m(90,80)],limits);
 assert.deepEqual(out.verdicts,[true,null,false]);
 assert.equal(gradeChoice("A",out),"correct");
 assert.equal(gradeChoice("B",out),"unknown");
 assert.equal(gradeChoice("C",out),"incorrect");
});

test("projector isolates failed API/series requests by scenario, not whole page",()=>{
 const ts=readFileSync(new URL("../screens/present.tsx",import.meta.url),"utf8");
 const js=readFileSync(new URL("../screens/present.js",import.meta.url),"utf8");
 for(const src of [ts,js]) {
   assert.ok(src.includes("w.invalid ? unavailableQuizMetric() : apiWindowMetrics(doc, w.site, w.start, w.hours || 336).catch(() => unavailableQuizMetric())"));
   assert.ok(src.includes("markReady();"));
 }
});

test("projector answer buttons keep accessible 44px targets at every viewport",()=>{
 const css=readFileSync(new URL("../screens/present.css",import.meta.url),"utf8");
 assert.match(css,/\.mp-quiz-pick\{[^}]*min-height:44px/);
 assert.doesNotMatch(css,/\.mp-quiz-pick\{min-height:(?!44px)\d+px/);
});
