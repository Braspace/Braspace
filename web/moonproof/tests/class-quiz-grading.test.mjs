import test from "node:test";
import assert from "node:assert/strict";
import { evaluateQuestion, gradeChoice } from "../screens/quiz-grading.js";
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
