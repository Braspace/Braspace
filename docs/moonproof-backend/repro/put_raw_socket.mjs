import net from "node:net";
const [host, port] = [process.argv[2] || "127.0.0.1", +process.argv[3] || 15499];
const N = +process.argv[4] || 100, SIZE = 2 * 1024 * 1024;
function one(method) {
  return new Promise(resolve => {
    const s = net.connect(port, host); let got = "", done = false, wrote = 0, err = null;
    const fin = (tag) => { if (!done) { done = true; s.destroy(); resolve(tag); } };
    s.on("data", d => { got += d; if (/\r\n\r\n/.test(got) && !done) setTimeout(() => fin("HTTP " + got.split(" ")[1]), 20); });
    s.on("error", e => { err = e.code; });
    s.on("close", () => fin(got ? "HTTP " + got.split(" ")[1] + (err ? " +" + err : "") : "RESET:" + err));
    s.write(`${method} /api/compare HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${SIZE}\r\n\r\n`);
    const chunk = Buffer.alloc(64 * 1024, 120);
    (function pump() { if (done || wrote >= SIZE) return; wrote += chunk.length; if (s.write(chunk)) setImmediate(pump); else s.once("drain", pump); })();
  });
}
const t = {};
for (const m of ["PUT", "POST"]) { t[m] = {}; const rs = await Promise.all(Array.from({ length: N }, () => one(m))); for (const r of rs) t[m][r] = (t[m][r] || 0) + 1; }
console.log(JSON.stringify(t));
