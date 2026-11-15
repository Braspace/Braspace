// Surface inventory. Each mode is separately exercised; do not count URL aliases twice.
export const sizes=[{width:1920,height:1080},{width:1440,height:900},{width:1280,height:800},{width:768,height:1024},{width:390,height:844}];
const modes=(family,url,selector,ids,active,ready)=>ids.split(" ").map(id=>({family,id,url,click:selector.replace("MODE",id),active:active?.replace("MODE",id),ready:ready?.replace("MODE",id)}));
export const cases=[
 ...["/","/explorar","/comparar","/comparar/tecnico","/aula","/aula/atividade","/evidencias"].map((route,i)=>({family:"spa",id:String(i),url:"/#"+route,ready:"#view :is([data-route-title],h1)"})),
 ...modes("classic","/classic.html",'button[data-view="MODE"]',"explore compare recover science evidence",'button[data-view="MODE"][aria-current=page]',"#view-title"),
 ...modes("lab","/lab.html",'#tabs button[data-view="MODE"]',"explore compare recover landing evidence",'#tabs button[data-view="MODE"][aria-current=page]',"#panel-body"),
 ...modes("studio","/studio/",'#screens button[data-screen="MODE"]',"overview explore compare recover science evidence learn",null,'[data-view="MODE"]'),
 ...modes("cockpit","/onboard/cockpit.html",'nav.tabs button[data-tab="MODE"]',"visao entrada geometria horizonte janelas navegacao energia vida replan visual sens historico lanc status",'nav.tabs button[data-tab="MODE"][aria-pressed=true]',"#views"),
 ...Object.entries({index:"#cards",mission:"#dock .mp-marker, .mp-marker",explore:"#dock [role=radio][data-layer]",compare:"#left",recover:"#right",cockpit:"#player",landing:"#bar",debrief:"#actions",evidence:"#sources",present:"#present-question",activity:"#act-steps",plan:"#plan-table",rules:"#rules-core"}).map(([id,ready])=>({family:"multipage",id,url:"/moonproof/"+id+".html",ready})),
 {family:"moonhd",id:"globe-fallback",url:"/moon-hd.html?view=globe",ready:"#loading.error",blockMoon:true},
 {family:"moonhd",id:"pole-fallback",url:"/moon-hd.html?view=pole",ready:"#loading.error",blockMoon:true},
 {family:"polar",id:"demo",url:"/polar-map-demo.html",ready:"body"},
 {family:"dashboard",id:"default",url:"/dashboard/index.html",ready:"#nav"},
 {family:"training",id:"evaluate",url:"/onboard/index.html",click:"#run",ready:"#results-card"}
];