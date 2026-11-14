// Shared V3 screens on the original MoonProof terrain-first design system.
// Raw NASA-derived preliminary metrics; example mockup numbers are never used.
import {mountShell} from "../core/shell.js";
import {mountTerrain} from "../core/terrain.js";
import {loadSites,windowMetrics,dailySun,api,sealFor} from "../core/data.js";
import {createLayerCard,barEl,sealEl} from "../core/layers.js";
import {getState,setState,onState,hrefTo} from "../core/state.js";
import {t,fmtNum,lang} from "../core/i18n.js";

const screen=document.body.dataset.screen;
const left=document.getElementById("flow-left");
const right=document.getElementById("flow-right");
const dock=document.getElementById("flow-dock");
const notice=document.getElementById("flow-status");
const DEFAULT_UTC="2027-03-14T06:00:00Z";
const day=3600000;
const names={
 explore:"Explorar",compare:"Comparar",recover:"Replanejar",
 cockpit:"Cockpit",landing:"Landing Lab",debrief:"Debrief",
 evidence:"Evidências",learn:"Kit Aula",plan:"Kit Planejamento"
};
const questions=[
 ["A Terra acima do horizonte garante comunicação por rádio?","Não. Linha de visada geométrica não garante link RF: antena, potência, frequência e rede terrestre também importam."],
 ["Por que uma crista bloqueia o Sol no Polo Sul?","O Sol permanece baixo no horizonte lunar polar; relevo cria sombras prolongadas."],
 ["O Landing Lab certifica um local de pouso?","Não. É um modelo educativo de descida 3DOF, sem certificação de engenharia ou segurança."],
 ["Como comparar dois locais sem enganar?","Use a mesma janela UTC e verifique fontes, série, resolução, incerteza e cobertura de dados."]
];
let doc=null,terrain=null,online=false,ready=false,phase=0,selectedLayer="altitude",scenario=1,question=0,revealed=false;
let limits={night:null,blackout:null},backendText="",layers=new Map();
function pt(a,b){return lang()==="pt-BR"?a:b;}
function node(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x;}
function put(parent,...children){for(const c of children)if(c!=null)parent.append(c);return parent;}
function para(text,cls){return node("p",cls||"",text);}
function block(title,glass){return put(node("article",glass?"mp-glass":"mp-card"),node("h2","",title));}
function action(label,fn,cls){const b=node("button","mp-pill "+(cls||""),label);b.type="button";b.onclick=fn;return b;}
function link(label,to,cls){const a=node("a","mp-pill "+(cls||""),label);a.href=to;return a;}
function format(v,unit,digits){return typeof v==="number"&&Number.isFinite(v)?fmtNum(v,digits===undefined?1:digits)+(unit||""):"N/D";}
function start(){return getState().start||DEFAULT_UTC;}
function hours(){const n=Number(getState().hours);return Number.isInteger(n)&&n>0&&n<=720?n:336;}
function site(){return doc.sites.find(s=>s.id===getState().site)||doc.sites[0];}
function dataCard(m,desc){
 const c=block(desc);c.append(sealEl(sealFor(m?.sunPct?.status)));
 c.append(metrics([["Sol",format(m?.sunPct?.value,"%")],["Terra",format(m?.earthPct?.value,"%")],["Noite",format(m?.longestDarkH?.value,"h")]]));return c;
}
function metrics(rows){
 const outer=node("div","mp-metrics");
 for(const item of rows)outer.append(put(node("div"),node("b","",item[1]),node("span","",item[0])));
 return outer;
}
function dataTable(headers,rows,caption){
 const wrap=node("div","mp-scroll"),tb=node("table","mp-rows");
 tb.append(node("caption","",caption||""));
 const head=tb.createTHead().insertRow();
 for(const h of headers){const th=node("th","",h);th.scope="col";head.append(th);}
 const body=tb.createTBody();
 for(const row of rows){const tr=body.insertRow();for(const c of row)tr.insertCell().textContent=String(c??"—");}
 wrap.append(tb);return wrap;
}
function sourceInfo(m){return m?.sunPct?.detail?.sha256||"N/D";}
function labelSelect(title,options,value,cb){
 const l=node("label","",title),s=node("select");
 for(const pair of options)s.append(new Option(pair[1],pair[0],false,String(pair[0])===String(value)));
 s.onchange=()=>cb(s.value);l.append(s);return l;
}
function params(){
 const card=block(pt("Janela UTC · editável","UTC window · editable"),true);
 const label=node("label","",pt("Início UTC","UTC start")),inp=node("input");
 inp.type="datetime-local";inp.value=start().slice(0,16);
 inp.onchange=()=>{if(!inp.value)return;const date=new Date(inp.value+":00Z");if(!Number.isNaN(date.valueOf()))setState({start:date.toISOString()});};
 label.append(inp);
 card.append(label,labelSelect(pt("Duração","Duration"),[[24,"24 h"],[72,"72 h"],[168,"7 dias"],[336,"14 dias"],[720,"30 dias"]],hours(),v=>setState({hours:Number(v)})));
 card.append(para(pt("A data mostrada é escolhida pelo usuário. Não é o relógio da missão.","User-selected date, not a live mission clock."),"mp-disclaimer"));
 return card;
}
function picker(){
 const c=block(pt("Locais do Polo Sul","South Pole sites"),true);
 c.append(labelSelect(pt("Centro da região","Region feature centre"),doc.sites.map(s=>[s.id,s.name]),site().id,v=>setState({site:v})));
 return c;
}
async function read(s,utc=start(),h=hours()){
 try{const m=await windowMetrics(doc,s,utc,h);return {site:s,start:utc,m,ok:[m.sunPct.value,m.earthPct.value,m.longestDarkH.value,m.longestBlackoutH.value].every(v=>typeof v==="number"&&Number.isFinite(v))};}
 catch(e){return {site:s,start:utc,m:null,ok:false};}
}
function conditions(w){
 if(!w.ok)return null;
 return w.m.longestDarkH.value<=(limits.night??getState().night)&&w.m.longestBlackoutH.value<=(limits.blackout??getState().blackout);
}
function header(title,lead){
 const x=block(title,true);x.id="screen-title";x.prepend(para("BRASPACE · MOONPROOF","mp-subhead"));
 if(lead)x.append(para(lead));return x;
}
function infoCard(title,text){const c=block(title);c.append(para(text));return c;}
function layerCard(id,title,m,answer,why,extra){
 return createLayerCard({id,title,status:m?.sunPct?.status||"NO_DATA",answer,
  why:para(why),
  proof:[[pt("Série","Series"),site().series],[pt("SHA-256","SHA-256"),sourceInfo(m)],
   [pt("Estado","Status"),m?.sunPct?.status||"NO_SERIES_DATA"],["UTC",start()],[pt("Resolução","Resolution"),"1 h"],...extra],
  layer:layers.get(id)||getState().layer,onLayer:l=>layers.set(id,l)}).el;
}
function chooseControls(){
 const i=doc.sites.indexOf(site());
 dock.replaceChildren(
  action("‹",()=>setState({site:doc.sites[(i+doc.sites.length-1)%doc.sites.length].id})),
  action(pt("Local ","Site ")+site().n,()=>setState({site:doc.sites[(i+1)%doc.sites.length].id}),"is-primary"),
  action("›",()=>setState({site:doc.sites[(i+1)%doc.sites.length].id})),
  action("−",()=>terrain?.zoom(.8)),action("+",()=>terrain?.zoom(1.25)));
}
function context(){
 shell.setContext({site:site().name,date:start().slice(0,16)+" UTC",days:format(hours()/24,"",1),seal:sealFor(doc.status),online,
  action:{label:pt("Comparar","Compare"),href:hrefTo("compare.html")}});
}
async function showExplore(){
 const r=await read(site()),m=r.m;
 left.append(header(pt("Explorar o Polo Sul","Explore the South Pole"),pt("Mapa primeiro. Camadas honestas, números com fonte.","Map first. Honest layers, sourced numbers.")));
 const c=block(pt("Camadas","Layers"));
 for(const [key,label] of [["altitude","Altitude LOLA 400 m"],["natural","Natural · N/D"],["slope","Declividade · Polar Lab"],["sun","Sol médio · só local"],["earth","Terra à vista · só local"]]){
  const b=action((selectedLayer===key?"● ":"○ ")+label,()=>{selectedLayer=key;show();},selectedLayer===key?"is-primary":"");
  b.style.width="100%";c.append(b);
 }
 c.append(para(pt("Apenas altitude tem raster nesta tela. Outras métricas são de local, nunca píxeis fictícios.","Only altitude has a raster. Other metrics are site-level only."),"mp-disclaimer"));
 left.append(c,picker(),params());
 const terrain=block("DEM · 400 m");terrain.append(node("div","mp-gradient"),para(pt("Perigos menores que o pixel não são resolvidos.","Sub-pixel hazards remain unresolved."),"mp-disclaimer"));left.append(terrain);
 const v=block(site().name);v.append(sealEl("PRE"),metrics([["Sol",format(m?.sunPct?.value,"%")],["Terra",format(m?.earthPct?.value,"%")],["Maior noite",format(m?.longestDarkH?.value,"h")]]));
 v.append(para(pt("Centro da região: ","Region centre: ")+site().lat+"°, "+site().lon+"°","mp-note"));right.append(v);
 const sky=block(pt("O que se vê daqui?","What is visible here?"),true);
 sky.append(node("div","mp-horizon"),para(pt("Horizonte esquemático, não medição do céu. Consulte as amostras de origem.","Schematic horizon, not sky observation. Refer to stored source samples."),"mp-disclaimer"));
 sky.append(put(node("div","mp-toolbar"),link(pt("Comparar","Compare"),hrefTo("compare.html"),"is-primary"),link("Landing Lab","../lab.html","is-sim")));right.append(sky);
 if(selectedLayer!=="altitude")right.append(infoCard("Camada "+selectedLayer,pt("O mapa continua em altitude; esta camada não tem raster verificável disponível nesta vista.","Terrain remains shaded elevation; no verified raster is provided for this selected layer.")));
}
async function scenarios(){
 const other=doc.sites.find(s=>s.id!==site().id)||site();
 const late=new Date(Date.parse(start())+48*day).toISOString();
 return Promise.all([read(other),read(site()),read(site(),late)]);
}
async function showCompare(){
 const rr=await scenarios();const passed=rr.map(conditions),wins=passed.flatMap((v,i)=>v===true?[String.fromCharCode(65+i)]:[]);
 const msg=wins.length===1?"Cenário "+wins[0]+" atende às duas regras escolhidas.":
 wins.length>1?wins.join(", ")+" atendem às duas regras escolhidas.":
 passed.some(v=>v===null)?"N/D — faltam dados para avaliar as regras.":
 "Nenhum cenário atende às duas regras.";
 left.append(header(pt("Qual cenário é melhor?","Which scenario works?"),msg));
 const picks=block("3 cenários · 2 locais · 2 datas",true);
 for(let i=0;i<3;i++){
  const b=node("button","mp-scenario");b.type="button";b.setAttribute("aria-pressed",String(scenario===i));
  const desc=put(node("b","",rr[i].site.name),para(rr[i].start.slice(0,16)+" UTC","meta"));
  b.append(node("span","circle",String.fromCharCode(65+i)),desc,node("small","",passed[i]===null?"N/D":passed[i]?"✓":"!"));
  b.onclick=()=>{scenario=i;show();};picks.append(b);
 }
 left.append(picks,params());
 const x=block(pt("Diferenças","Differences"));
 x.append(dataTable([pt("Métrica","Metric"),"A","B","C"],[
 ["Sol visível",...rr.map(r=>format(r.m?.sunPct?.value,"%"))],
 ["Maior noite",...rr.map(r=>format(r.m?.longestDarkH?.value,"h"))],
 ["Terra visível",...rr.map(r=>format(r.m?.earthPct?.value,"%"))],
 ["Maior perda Terra",...rr.map(r=>format(r.m?.longestBlackoutH?.value,"h"))]
 ],"PRE · mesma janela · valores de séries armazenadas"));right.append(x);
 const picked=rr[scenario]||rr[0];
 right.append(layerCard("compare-proof","Resposta → Por quê → Prova",picked.m,
 "Cenário "+String.fromCharCode(65+scenario)+" · "+picked.site.name,
 pt("Os critérios dependem do relevo, época UTC e regras declaradas. Visibilidade não é potência nem link RF.","Results depend on horizon, UTC and stated thresholds. Visibility is not power or RF."),
 [[pt("Regra noite","Darkness limit"),(limits.night??getState().night)+" h"],[pt("Regra Terra","Earth gap limit"),(limits.blackout??getState().blackout)+" h"]]));
 if(picked.ok)right.append(put(block("Sol por dia · "+String.fromCharCode(65+scenario)),barEl(dailySun(picked.m.series,Date.parse(picked.start),hours()))));
 right.append(put(node("div","mp-toolbar"),link("E se B atrasar?",hrefTo("recover.html"),"is-primary"),link("Planejar",hrefTo("plan.html"))));
}
function rulesEditor(){
 const b=block(pt("Regras da missão · editáveis","Editable mission rules"),true);
 for(const [key,title] of [["night","Noite máxima (h)"],["blackout","Perda máxima da Terra (h)"]]){
  const l=node("label","",title),input=node("input");input.type="number";input.min="0";input.max="720";input.step=".5";
  input.value=String(limits[key]??getState()[key]);
  input.onchange=()=>{const n=Number(input.value);if(input.value!==""&&Number.isFinite(n)&&n>=0&&n<=720){limits[key]=n;setState({[key]:n});}else{notice.hidden=false;notice.textContent="Informe um limite entre 0 e 720 h.";}};
  l.append(input);b.append(l);
 }
 b.append(para(pt("Valores de aula editáveis; não são limites certificados da NASA.","Editable classroom assumptions, not NASA limits."),"mp-disclaimer"));
 return b;
}
async function showRecover(){
 const delays=[0,12,24,48,72,96],rr=await Promise.all(delays.map(d=>read(site(),new Date(Date.parse(start())+d*day).toISOString())));
 const chosen=Math.min(Math.max(scenario,0),delays.length-1),r=rr[chosen],base=rr[0],v=conditions(r);
 left.append(header(pt("Replanejar","Replan"),pt("Passo 1: escolha o atraso. Passo 2: veja as restrições. Passo 3: compare alternativas.","Step 1: delay. Step 2: constraint change. Step 3: alternatives.")));
 const delaysCard=block("Passo 1 · atraso",true),grid=node("div","mp-candidate-grid");
 delays.forEach((d,i)=>{const b=node("button","",(d?"+"+d:"0")+"h");b.type="button";b.setAttribute("aria-pressed",String(i===chosen));b.onclick=()=>{scenario=i;show();};grid.append(b);});
 delaysCard.append(grid);left.append(delaysCard,rulesEditor(),params());
 const card=block("Passo 2 · o que mudou?");
 card.append(metrics([["Maior noite",format(r.m?.longestDarkH?.value,"h")],["Terra",format(r.m?.longestBlackoutH?.value,"h")],["Regras",v===null?"N/D":v?"OK":"FALHA"]]));
 card.append(dataTable(["Métrica","Base","+"+delays[chosen]+"h"],[
 ["Noite",format(base.m?.longestDarkH?.value,"h"),format(r.m?.longestDarkH?.value,"h")],
 ["Perda Terra",format(base.m?.longestBlackoutH?.value,"h"),format(r.m?.longestBlackoutH?.value,"h")],
 ["Sol",format(base.m?.sunPct?.value,"%"),format(r.m?.sunPct?.value,"%")]
 ],"PRE · mesmo local e duração"));right.append(card);
 const alternatives=block("Passo 3 · escolher uma saída",true);
 const other=await Promise.all(doc.sites.filter(s=>s.id!==site().id).slice(0,3).map(s=>read(s,r.start)));
 const candidates=[r,...other].filter(x=>conditions(x)===true);
 if(!candidates.length)alternatives.append(para("N/D · não há alternativa que atenda aos limites nos dados disponíveis."));
 else for(const c of candidates)alternatives.append(action(c.site.name,()=>setState({site:c.site.id,start:c.start}),"is-white"));
 alternatives.append(link("Passo 4 · comparar",hrefTo("compare.html"),"is-primary"));right.append(alternatives);
 const backend=block("Go/Rust · API ao vivo");
 const out=para("A API ainda não foi consultada.","mp-note");
 const submit=action("Recalcular pela API",async()=>{
  submit.disabled=true;
  try{const payload={site_id:site().id,start_utc:start(),duration_hours:hours(),delays_hours:[24,48,72],include_nearby:true,max_nearby:2,
   constraints:{max_continuous_dark_hours:limits.night??getState().night,max_continuous_comm_gap_hours:limits.blackout??getState().blackout}};
   const response=await api("/api/scenarios/delay",{method:"POST",body:payload});
   out.textContent=response.ok?JSON.stringify({outcome:response.data?.outcome,options:response.data?.options?.map(o=>({kind:o.kind,site:o.site_id,delay:o.delay_hours,status:o.data_status,admissible:o.admissible}))},null,2):
    "API indisponível: "+response.error+"; nenhum resultado remoto fabricado.";
  }finally{submit.disabled=false;}
 },"is-primary");
 backend.append(submit,out);right.append(backend);
}
async function showEvidence(){
 const r=await read(site());
 left.append(header("De onde vem cada número?",pt("Relevo + efemérides + geometria são diferentes de hardware e física de pouso.","Terrain + ephemerides + geometry differ from hardware and landing physics.")));
 const b=block("Passaporte do cenário");b.append(sealEl("PRE"),para("Local: "+site().name),para("UTC: "+start()),para("Janela: "+hours()+"h"),
 dataTable(["Origem","Classe"],[["LOLA 400 m","PRE"],["NAIF / DE440","PRE"],["Horizonte geométrico","PRE"],["Bateria","SIM / N/D"],["Obstáculos menores 400 m","N/D"]],"Fonte ≠ validação independente"));
 left.append(b,picker());
 const note=block("O que assumimos",true);
 note.append(para("Sol visível = centro do Sol acima do horizonte do terreno. Não é energia garantida."),
 para("Terra visível = linha de visada geométrica. Não mede sinal RF."),
 para("Nenhum pixel de 400 m comprova segurança de touchdown."));right.append(note);
 right.append(dataTable(["Campo","Valor"],[
 ["site",site().id],["series",site().series],["science_status",r.m?.sunPct?.status||"NO_DATA"],
 ["SHA-256",sourceInfo(r.m)],["UTC",start()],["step","1h"]
 ],"Proveniência observacional"));
 right.append(action("Baixar JSON",()=>downloadJSON({site:site().id,series:site().series,utc:start(),hours:hours(),status:doc.status,
  validation:"NOT NASA CERTIFIED",source_sha256:sourceInfo(r.m),
  metrics:r.ok?{sun:r.m.sunPct.value,earth:r.m.earthPct.value,dark:r.m.longestDarkH.value,gap:r.m.longestBlackoutH.value}:null},"moonproof-evidence.json"),"is-white"));
}
function downloadJSON(payload,name){
 const u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"})),a=node("a");a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
async function showCockpit(){
 const r=await read(site());
 left.append(header("Cockpit · João Victor",pt("Números geométricos PRE; a simulação de recursos opera no cockpit existente.","PRE geometric measures; resource simulation runs in the existing cockpit.")));
 left.append(put(block("Testar um problema",true),para("Painel a 50%, bateria −20%, atraso ou perda de antena são hipóteses, não telemetria real."),
 link("Abrir computador de bordo","../onboard/cockpit.html","is-primary"),link("Replanejar",hrefTo("recover.html"))));
 right.append(dataCard(r.m,"Sol e Terra · geometria PRE"));
 right.append(put(block("Regras da missão"),para("Energia: N/D sem bateria e consumo definidos."),para("Rádio: Terra visível não garante comunicação."),para("Térmica: N/D sem modelo térmico."),sealEl("SIM")));
}
function showLanding(){
 left.append(header("Landing Lab",pt("Simulador educativo 3DOF com empuxo, combustível e zonas-alvo.","Educational 3DOF simulator with thrust, fuel and touchdown zones.")));
 left.append(put(block("Controle de descida",true),para("O motor da simulação está no Polar Lab; esta tela não inventa telemetria."),
 link("Iniciar pouso guiado","../lab.html","is-primary"),link("Pouso livre","../lab.html","is-sim")));
 right.append(put(block("Estado da tentativa"),sealEl("SIM"),metrics([["Altitude","N/D"],["Velocidade","N/D"],["Combustível","N/D"]]),
 para("Sem simulação executada nesta tela."),link("Debrief",hrefTo("debrief.html"))));
}
function showDebrief(){
 left.append(header("Debrief",pt("Análise de trajetória e regras exige uma tentativa executada de verdade no Landing Lab.","Path and rule assessment requires an actual Lab simulation run.")));
 right.append(put(block("Resultado da tentativa"),sealEl("SIM"),
 metrics([["Velocidade","N/D"],["Inclinação","N/D"],["Combustível","N/D"]]),
 para("Sem simulação não há trajetória, conclusão nem recomendação fictícia."),
 link("Tentar de novo","../lab.html","is-primary")));
}
function showLearn(){
 left.append(header("Kit Aula",pt("Uma pergunta por vez. Resposta oculta até o professor revelar.","One question at a time. Answer hidden until teacher reveals.")));
 const c=block("Pergunta "+(question+1)+" de "+questions.length,true);
 c.append(node("div","mp-teach-question",questions[question][0]));
 const ans=node("div","mp-reveal",questions[question][1]);ans.hidden=!revealed;
 c.append(ans,put(node("div","mp-toolbar"),
 action("Revelar resposta",()=>{revealed=true;ans.hidden=false;},"is-primary"),
 action("Próxima pergunta",()=>{question=(question+1)%questions.length;revealed=false;show();})));
 left.append(c);
 right.append(put(block("Atividade reproduzível"),para("Não há contas ou notas de alunos armazenadas. Compartilhe a URL com a data/local."),
 link("Explorar dados",hrefTo("explore.html"),"is-primary"),
 action("Copiar link",async()=>{try{await navigator.clipboard.writeText(location.href);notice.textContent="URL copiada";}catch{notice.textContent="Copie a URL manualmente";}notice.hidden=false;})));
}
async function showPlan(){
 const r=await read(site());
 left.append(header("Kit Planejamento",pt("Regras editáveis, mesmas fontes, unidades e N/D explícitos.","Editable limits, shared data, explicit units and missing values.")),rulesEditor(),params(),picker());
 const data={source:"MOONPROOF_V3_PRE",site:site().id,start:start(),hours:hours(),rules:{night:limits.night??getState().night,blackout:limits.blackout??getState().blackout},
  source_sha256:sourceInfo(r.m),science_status:doc.status,scientifically_validated:false,
  metrics:r.ok?{sun_pct:r.m.sunPct.value,earth_pct:r.m.earthPct.value,dark_h:r.m.longestDarkH.value,earth_gap_h:r.m.longestBlackoutH.value}:null};
 right.append(dataTable(["Métrica","Valor","Estado"],[
 ["Sol visível",format(r.m?.sunPct?.value,"%"),"PRE"],
 ["Terra visível",format(r.m?.earthPct?.value,"%"),"PRE"],
 ["Maior noite",format(r.m?.longestDarkH?.value,"h"),"PRE"],
 ["Gap Terra",format(r.m?.longestBlackoutH?.value,"h"),"PRE"],
 ["Bateria H1","N/D","SIM"],["Obstáculos subpixel","N/D","N/D"]
 ],"PROVA · sem dados inventados"));
 const b=block("Exportar e reproduzir");
 b.append(put(node("div","mp-toolbar"),
 action("JSON",()=>downloadJSON(data,"moonproof-planning.json"),"is-white"),
 action("CSV",()=>{const csv=[["site","start","hours","science_status","sun_pct","earth_pct","dark_h","earth_gap_h","sha256"],[
  data.site,data.start,data.hours,data.science_status,data.metrics?.sun_pct??"",data.metrics?.earth_pct??"",data.metrics?.dark_h??"",data.metrics?.earth_gap_h??"",data.source_sha256]];
  downloadFile(csv.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n"),"text/csv","moonproof-planning.csv");
 },"is-white"),action("Copiar URL",async()=>{try{await navigator.clipboard.writeText(location.href);notice.textContent="Link copiado";}catch{notice.textContent="Copie URL do navegador";}notice.hidden=false;})));
 right.append(b);
}
function downloadFile(data,type,name){
 const url=URL.createObjectURL(new Blob([data],{type})),a=node("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function show(){
 if(!ready)return;
 const n=++phase;left.replaceChildren();right.replaceChildren();context();chooseControls();
 try{
  if(screen==="explore")await showExplore();
  else if(screen==="compare")await showCompare();
  else if(screen==="recover")await showRecover();
  else if(screen==="evidence")await showEvidence();
  else if(screen==="cockpit")await showCockpit();
  else if(screen==="landing")showLanding();
  else if(screen==="debrief")showDebrief();
  else if(screen==="learn")showLearn();
  else if(screen==="plan")await showPlan();
  if(n===phase)notice.hidden=true;
 }catch(e){if(n!==phase)return;left.replaceChildren(header("Dados indisponíveis",String(e?.message||e)));right.replaceChildren(put(block("Sem série"),sealEl("N/D"),para("Nenhum valor foi inventado.")));notice.hidden=false;notice.textContent="Falha da série; não foi criado fallback sintético.";}
}
const shell=mountShell({screen,context:null,onLang:()=>show()});
async function boot(){
 try{
  doc=await loadSites();if(!Array.isArray(doc.sites)||!doc.sites.length)throw new Error("Empty source catalog");
  const s=getState();
  if(!doc.sites.some(x=>x.id===s.site))setState({site:doc.sites.find(x=>x.id==="connecting-ridge")?.id||doc.sites[0].id});
  if(!s.start)setState({start:DEFAULT_UTC});
  if(!s.hours)setState({hours:336});
  try{
   terrain=await mountTerrain(document.getElementById("terrain"),{sites:doc.sites,selected:site().id,route:doc.sites.map(s=>s.id),onSelect:id=>setState({site:id})});
   terrain.select(site().id);
  }catch(e){document.getElementById("terrain").replaceChildren(para("LOLA DEM unavailable; no false map substituted."));}
  online=(await api("/readyz",{timeoutMs:3000})).ok;
  ready=true;let last=site().id;
  onState(s=>{if(s.site!==last){last=s.site;terrain?.select(last);}show();});
  await show();
 }catch(e){notice.textContent="NASA source unavailable: "+String(e?.message||e);left.replaceChildren(put(block("Falha de dados"),sealEl("N/D")));}
}
boot();
