const base = process.argv[2], R = +process.argv[3] || 20;
const routes = ["/api/compare","/api/scenarios/delay","/api/onboard/site-evaluate","/api/onboard/site-report","/api/onboard/report","/api/onboard/navigation","/api/onboard/evaluate","/v1/visibility","/api/vector/search"];
const big = "x".repeat(2 * 1024 * 1024), J = { "content-type": "application/json" };
const cases = [["bad-json","POST",J,"{"],["text/plain","POST",{"content-type":"text/plain"},"hi"],["2MiB","POST",J,big],["GET","GET",{}],["PUT","PUT",J,"{}"]];
const out = {}; 
for (let r = 0; r < R; r++) for (const p of routes) for (const [n,m,h,b] of cases) {
  let k; try { const x = await fetch(base+p,{method:m,headers:h,body:b}); await x.arrayBuffer(); k = x.status; } catch(e){ k = "ERR:"+(e.cause?.code||e.message); }
  out[n] ??= {}; out[n][k] = (out[n][k]||0)+1;
}
console.log(JSON.stringify(out));
