// Surface inventory: MoonProof is the only product surface (legacy shell, classic, lab page, studio,
// onboard and dashboard are archived under archive/web-legacy/). Each page is exercised once per size.
export const sizes=[{width:1920,height:1080},{width:1440,height:900},{width:1280,height:800},{width:768,height:1024},{width:390,height:844},{width:320,height:640}];
export const cases=[
 {family:"root",id:"redirect",url:"/",ready:"#player"},
 ...Object.entries({index:"#player",tasks:"#cards",mission:"#dock .mp-marker, .mp-marker",explore:"#left [role=radio][data-layer], #sheet",compare:"#left",recover:"#right",cockpit:"#player",landing:"#bar",debrief:"#actions a, .deb-none",evidence:"#sources",present:"#present-question",activity:"#act-steps",plan:"#plan-table",rules:"#rules-core"}).map(([id,ready])=>({family:"multipage",id,url:"/moonproof/"+id+".html",ready})),
 {family:"moonhd",id:"globe-fallback",url:"/moon-hd.html?view=globe",ready:"#loading.error",blockMoon:true},
 {family:"moonhd",id:"pole-fallback",url:"/moon-hd.html?view=pole",ready:"#loading.error",blockMoon:true},
];
