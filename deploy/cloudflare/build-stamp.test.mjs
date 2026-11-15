import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const sha='a'.repeat(40), assignment=`const BRASPACE_COMMIT = "${sha}";`;
function exactLineGrep(input){
 const r=spawnSync('grep',['-Fxq',assignment],{input,encoding:'utf8'});
 assert.equal(r.error,undefined);
 return r.status===0;
}
test('release SHA gate accepts the exact executable declaration',()=>{
 assert.equal(exactLineGrep(`${assignment}\n`),true);
 assert.equal(exactLineGrep(`const API = "https://example.com";\n${assignment}\n`),true);
});
test('release SHA gate rejects comments, suffixes and unrelated build SHAs',()=>{
 for(const input of [
  `// ${assignment}\n`, `/* ${assignment} */\n`, `prefix ${assignment}\n`,
  `${assignment} // forged\n`, `const BRASPACE_COMMIT = "${'b'.repeat(40)}";\n`,
  '// BRASPACE_COMMIT is intentionally absent\n',
 ]) assert.equal(exactLineGrep(input),false,input);
});
test('both actual release scripts use fixed-string full-line matching',()=>{
 for(const [path,source] of [
  ['deploy.sh',readFileSync(new URL('./deploy.sh',import.meta.url),'utf8')],
  ['smoke-publico.sh',readFileSync(new URL('../../scripts/smoke-publico.sh',import.meta.url),'utf8')],
 ]){
  assert.equal((source.match(/grep -Fxq /g)||[]).length,1,path+' exact commit check is present');
  assert.equal((source.match(/grep -Fq /g)||[]).length,0,path+' has no substring-only SHA check');
  assert.ok(source.includes('grep -Fxq "const BRASPACE_COMMIT = \\"'),path+' checks an executable declaration');
 }
});
