/* Diário da Lavoura — Mapa (Painel → Mapa).
   Imagem de satélite (Esri World Imagery) com Leaflet, carregado só quando a tela abre.
   Coleções: talhoes_geo/{talhaoId} {coords:[{lat,lng}], areaHa, atualizadoEm}   (id do talhão de config/propriedade, não muda ao renomear)
             pontos {tipo, obs, lat, lng, criadoEm}   (o talhão do ponto é calculado pelo contorno)
   Desenhar: escolhe o talhão, toca nos cantos (ou "Adicionar onde estou" com GPS), salva. Ponto: tipo + observação, toca no mapa ou GPS. */
(function(){
"use strict";
const LEAF="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
const TILES="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TIPOS_P={pedra:["🪨","Pedra"],buraco:["🕳️","Buraco"],toco:["🪵","Toco"],agua:["💧","Água / brejo"],erosao:["〰️","Erosão"],cupim:["⛰️","Cupinzeiro"],cerca:["🚧","Cerca / divisa"],outro:["📍","Outro"]};
const CORES=["#f2c94c","#56ccf2","#f2994a","#bb6bd9","#6fcf97","#eb5757","#2d9cdb","#f2f2f2"];
let geo={}, pontos=[], L=null, mapa=null, camT=null, camP=null, camD=null, modo=null, filtro="", iniciou=false, ajustou=false;

/* ---------- utilidades ---------- */
const talhoes=()=>(typeof propCfg!=="undefined"?propCfg.talhoes:[]);
const nomeT=id=>talhoes().find(t=>t.id===id)?.n||"(talhão removido)";
function areaHa(cs){ // área na superfície da Terra (fórmula esférica), em hectares
  if(cs.length<3) return 0; const R=6378137, rad=Math.PI/180; let s=0;
  for(let i=0;i<cs.length;i++){const a=cs[i], b=cs[(i+1)%cs.length]; s+=(b.lng-a.lng)*rad*(2+Math.sin(a.lat*rad)+Math.sin(b.lat*rad))}
  return Math.abs(s*R*R/2)/10000;
}
function dentro(p,cs){let d=false; for(let i=0,j=cs.length-1;i<cs.length;j=i++){const a=cs[i],b=cs[j]; if((a.lat>p.lat)!==(b.lat>p.lat)&&p.lng<(b.lng-a.lng)*(p.lat-a.lat)/(b.lat-a.lat)+a.lng) d=!d} return d}
const talhaoDo=p=>{for(const t of talhoes()){const g=geo[t.id]; if(g?.coords?.length>2&&dentro(p,g.coords)) return t.n} return ""};
const ha=v=>Number(v).toLocaleString("pt-BR",{maximumFractionDigits:1});
const cor=id=>CORES[Math.max(0,talhoes().findIndex(t=>t.id===id))%CORES.length];
function gps(){return new Promise((ok,erro)=>{
  if(!navigator.geolocation) return erro(new Error("Este aparelho não informa a localização."));
  navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lng:p.coords.longitude,prec:p.coords.accuracy}),
    e=>erro(new Error(e.code===1?"Permita a localização para o app (Ajustes do iPhone → Safari → Localização).":"Não consegui pegar a localização. Tente de novo ao ar livre.")),
    {enableHighAccuracy:true,timeout:20000,maximumAge:5000})})}
function aviso(t,erro){const m=$("#mp-modo"); if(!modo){m.hidden=false; m.className="mp-modo"+(erro?" erro":""); m.innerHTML=`<span>${esc(t)}</span>`; clearTimeout(aviso.t); aviso.t=setTimeout(()=>{if(!modo) m.hidden=true},5000)} else {const s=m.querySelector(".mp-st"); if(s) s.textContent=t}}

/* Miniatura (desenho do contorno em SVG, sem precisar de internet) */
function mini(id,tam=44){
  const g=geo[id]; if(!(g?.coords?.length>2)) return "";
  const k=Math.cos(g.coords[0].lat*Math.PI/180), xs=g.coords.map(c=>c.lng*k), ys=g.coords.map(c=>-c.lat);
  const x0=Math.min(...xs), y0=Math.min(...ys), w=Math.max(...xs)-x0||1e-9, h=Math.max(...ys)-y0||1e-9, e=Math.min((tam-6)/w,(tam-6)/h);
  const ox=(tam-w*e)/2, oy=(tam-h*e)/2;
  const pts=xs.map((x,i)=>`${((x-x0)*e+ox).toFixed(1)},${((ys[i]-y0)*e+oy).toFixed(1)}`).join(" ");
  return `<svg class="mp-mini" viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" aria-hidden="true"><polygon points="${pts}" fill="${cor(id)}" fill-opacity=".35" stroke="${cor(id)}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
window.mpMini=mini;
function minisCfg(){
  const box=document.getElementById("cfg-tal"); if(!box||typeof cfgEdit==="undefined") return;
  box.classList.add("com-mini");
  box.querySelectorAll(".cfg-row").forEach(r=>{
    let m=r.querySelector(".cfg-mini"); if(!m){m=document.createElement("span"); m.className="cfg-mini"; r.prepend(m)}
    const t=cfgEdit[+r.dataset.i]; m.innerHTML=t?.id?mini(t.id,40):""; m.title=m.innerHTML?"Contorno desenhado no mapa":"Sem contorno: desenhe em Painel → Mapa";
  });
}
if(typeof cfgTal==="function"){const o=cfgTal; cfgTal=function(){o.apply(this,arguments); minisCfg()}}

/* ---------- Leaflet sob demanda ---------- */
function carregaLeaflet(){
  if(window.L) return Promise.resolve(window.L);
  return new Promise((ok,erro)=>{
    if(!document.querySelector('link[data-leaflet]')){const c=document.createElement("link"); c.rel="stylesheet"; c.href=LEAF+"leaflet.min.css"; c.dataset.leaflet="1"; document.head.append(c)}
    const s=document.createElement("script"); s.src=LEAF+"leaflet.min.js"; s.onload=()=>ok(window.L); s.onerror=()=>erro(new Error("sem internet")); document.head.append(s);
  });
}
async function abreMapa(){
  if(mapa){setTimeout(()=>{mapa.invalidateSize(); if(!modo) enquadra()},60); return}
  try{L=await carregaLeaflet()}catch{$("#mp-carr").textContent="O mapa precisa de internet na primeira vez que abre. Tente de novo com sinal.";return}
  $("#mp-carr").hidden=true;
  mapa=L.map("mp-mapa",{zoomControl:true,attributionControl:true,maxZoom:19}).setView([-24.6,-52.5],7);
  L.tileLayer(TILES,{maxZoom:19,maxNativeZoom:18,attribution:"Imagens © Esri, Maxar, Earthstar Geographics"}).addTo(mapa);
  camT=L.layerGroup().addTo(mapa); camP=L.layerGroup().addTo(mapa); camD=L.layerGroup().addTo(mapa);
  mapa.on("click",e=>clique(e.latlng));
  mapa.on("zoomend",()=>$("#mp-mapa").classList.toggle("longe",mapa.getZoom()<14));
  desenhaTudo(); setTimeout(()=>{mapa.invalidateSize(); enquadra(); $("#mp-mapa").classList.toggle("longe",mapa.getZoom()<14)},60);
}
function enquadra(){
  if(!mapa) return;
  const ps=[...Object.values(geo).flatMap(g=>g.coords||[]),...pontos].map(p=>[p.lat,p.lng]);
  if(ps.length){mapa.fitBounds(ps,{padding:[24,24],maxZoom:17}); ajustou=true}
}

/* ---------- desenhar camadas ---------- */
function desenhaTudo(){
  if(!mapa) return;
  camT.clearLayers(); camP.clearLayers();
  for(const t of talhoes()){const g=geo[t.id]; if(!(g?.coords?.length>2)) continue;
    const pg=L.polygon(g.coords.map(c=>[c.lat,c.lng]),{color:cor(t.id),weight:3,fillOpacity:.12}).addTo(camT);
    pg.bindTooltip(`${t.n}`,{permanent:true,direction:"center",className:"mp-rot"});
    if(modo?.tipo==="desenho") pg.setStyle({opacity:.4,fillOpacity:.05});
  }
  for(const p of pontos){ if(filtro&&p.tipo!==filtro) continue;
    const [ic,nm]=TIPOS_P[p.tipo]||TIPOS_P.outro;
    L.marker([p.lat,p.lng],{icon:L.divIcon({className:"mp-pin",html:`<span>${ic}</span>`,iconSize:[34,34],iconAnchor:[17,30]})}).addTo(camP)
      .bindPopup(`<b>${esc(nm)}</b>${p.obs?`<br>${esc(p.obs)}`:""}<br><small>${esc(talhaoDo(p)||"fora dos talhões")} · ${p.criadoEm?brDate(p.criadoEm.slice(0,10)):""}</small>`);
  }
  desenhaRascunho();
}
function desenhaRascunho(){
  if(!mapa) return; camD.clearLayers();
  if(modo?.tipo==="desenho"&&modo.cs.length){
    const ll=modo.cs.map(c=>[c.lat,c.lng]);
    (ll.length>2?L.polygon(ll,{color:"#fff",weight:3,dashArray:"6 6",fillOpacity:.15}):L.polyline(ll,{color:"#fff",weight:3,dashArray:"6 6"})).addTo(camD);
    ll.forEach((c,i)=>L.circleMarker(c,{radius:i===ll.length-1?8:6,color:"#fff",weight:2,fillColor:cor(modo.id),fillOpacity:1}).addTo(camD));
  }
  if(modo?.tipo==="ponto"&&modo.pos) L.marker([modo.pos.lat,modo.pos.lng],{icon:L.divIcon({className:"mp-pin novo",html:`<span>${(TIPOS_P[modo.t]||TIPOS_P.outro)[0]}</span>`,iconSize:[38,38],iconAnchor:[19,34]})}).addTo(camD);
}

/* ---------- modos ---------- */
function clique(ll){
  if(modo?.tipo==="desenho"){modo.cs.push({lat:+ll.lat.toFixed(7),lng:+ll.lng.toFixed(7)}); barraDesenho(); desenhaRascunho()}
  else if(modo?.tipo==="ponto"){modo.pos={lat:+ll.lat.toFixed(7),lng:+ll.lng.toFixed(7)}; barraPonto(); desenhaRascunho()}
}
function sair(){modo=null; $("#mp-modo").hidden=true; $("#mp-barra").hidden=false; $("#mp-mapa").classList.remove("mira"); desenhaTudo()}
function iniciaDesenho(id){
  if(!talhoes().length){aviso("Cadastre os talhões em Configurações primeiro.",true);return}
  id=id||talhoes().find(t=>!geo[t.id])?.id||talhoes()[0].id;
  modo={tipo:"desenho",id,cs:[...(geo[id]?.coords||[]).map(c=>({...c}))]};
  $("#mp-barra").hidden=true; $("#mp-mapa").classList.add("mira"); barraDesenho(); desenhaTudo();
  if(modo.cs.length>2&&mapa) mapa.fitBounds(modo.cs.map(c=>[c.lat,c.lng]),{padding:[30,30],maxZoom:17});
  $("#mp-mapa").scrollIntoView({block:"center",behavior:"smooth"});
}
function barraDesenho(){
  const t=talhoes().find(x=>x.id===modo.id), a=areaHa(modo.cs);
  const m=$("#mp-modo"); m.hidden=false; m.className="mp-modo ativo";
  m.innerHTML=`<div class="mp-m-top"><label class="mp-sel">Talhão <select id="mp-d-t">${talhoes().map(x=>`<option value="${x.id}"${x.id===modo.id?" selected":""}>${esc(x.n)}</option>`).join("")}</select></label>
      <span class="mp-area">${modo.cs.length>2?`<b>${ha(a)} ha</b> desenhado · ${ha(t?.ha||0)} ha cadastrado`:`${modo.cs.length} ponto${modo.cs.length===1?"":"s"}`}</span></div>
    <p class="note">Toque no mapa em cada canto do talhão, em volta. Na lavoura, dá para ir até cada canto e tocar em “Canto onde estou”.</p>
    <div class="mp-m-bt"><button type="button" class="btn ghost fn-mini" id="mp-d-gps">◎ Canto onde estou</button><button type="button" class="btn ghost fn-mini" id="mp-d-desf"${modo.cs.length?"":" disabled"}>Desfazer último</button><button type="button" class="link danger" id="mp-d-limpa"${modo.cs.length?"":" disabled"}>Limpar</button></div>
    <div class="mp-m-bt"><button type="button" class="btn fn-mini" id="mp-d-ok"${modo.cs.length>2?"":" disabled"}>Salvar contorno</button><button type="button" class="link" id="mp-d-x">Cancelar</button><span class="note mp-st" role="status"></span></div>`;
  $("#mp-d-t").onchange=e=>iniciaDesenho(e.target.value);
  $("#mp-d-desf").onclick=()=>{modo.cs.pop(); barraDesenho(); desenhaRascunho()};
  $("#mp-d-limpa").onclick=()=>{modo.cs=[]; barraDesenho(); desenhaRascunho()};
  $("#mp-d-x").onclick=sair;
  $("#mp-d-gps").onclick=async e=>{e.target.disabled=true; aviso("Pegando a localização…"); try{const p=await gps(); modo.cs.push({lat:+p.lat.toFixed(7),lng:+p.lng.toFixed(7)}); barraDesenho(); desenhaRascunho(); mapa?.setView([p.lat,p.lng],Math.max(mapa.getZoom(),17)); aviso(`Canto marcado (precisão de ${Math.round(p.prec)} m).`)}catch(er){aviso(er.message,true)} finally{const b=$("#mp-d-gps"); if(b) b.disabled=false}};
  $("#mp-d-ok").onclick=async()=>{
    const b=$("#mp-d-ok"); b.disabled=true;
    try{await db.collection("talhoes_geo").doc(modo.id).set({coords:modo.cs,areaHa:+areaHa(modo.cs).toFixed(2),atualizadoEm:new Date().toISOString()});
      const n=nomeT(modo.id); sair(); aviso(`Contorno do ${n} salvo.`)}
    catch{aviso("Não foi possível salvar. Tente de novo.",true); b.disabled=false}
  };
}
function iniciaPonto(p){
  modo={tipo:"ponto",t:p?.tipo||"pedra",obs:p?.obs||"",pos:p?{lat:p.lat,lng:p.lng}:null,id:p?.id||null};
  $("#mp-barra").hidden=true; $("#mp-mapa").classList.add("mira"); barraPonto(); desenhaTudo();
  if(p&&mapa) mapa.setView([p.lat,p.lng],Math.max(mapa.getZoom(),17));
  $("#mp-modo").scrollIntoView({block:"start",behavior:"smooth"});
}
function barraPonto(){
  const m=$("#mp-modo"); m.hidden=false; m.className="mp-modo ativo";
  const tal=modo.pos?talhaoDo(modo.pos):"";
  m.innerHTML=`<b>${modo.id?"Editar ponto":"Marcar ponto"}</b>
    <div class="chips mp-tipos">${Object.entries(TIPOS_P).map(([k,[ic,nm]])=>`<button type="button" class="chip" aria-pressed="${k===modo.t}" data-t="${k}">${ic} ${nm}</button>`).join("")}</div>
    <div class="field"><label for="mp-p-obs">Observação</label><input id="mp-p-obs" value="${esc(modo.obs)}" placeholder="Ex.: pedra grande, cuidado com a plantadeira"></div>
    <p class="note">${modo.pos?`Lugar marcado${tal?` no <b>${esc(tal)}</b>`:""}. Toque em outro lugar do mapa para mudar.`:"Toque no mapa onde fica, ou use “Estou no lugar”."}</p>
    <div class="mp-m-bt"><button type="button" class="btn ghost fn-mini" id="mp-p-gps">◎ Estou no lugar</button><button type="button" class="btn fn-mini" id="mp-p-ok"${modo.pos?"":" disabled"}>Salvar ponto</button><button type="button" class="link" id="mp-p-x">Cancelar</button><span class="note mp-st" role="status"></span></div>`;
  m.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{modo.obs=$("#mp-p-obs").value; modo.t=b.dataset.t; barraPonto(); desenhaRascunho()});
  $("#mp-p-obs").oninput=e=>modo.obs=e.target.value;
  $("#mp-p-x").onclick=sair;
  $("#mp-p-gps").onclick=async e=>{e.target.disabled=true; aviso("Pegando a localização…"); try{const p=await gps(); modo.obs=$("#mp-p-obs").value; modo.pos={lat:+p.lat.toFixed(7),lng:+p.lng.toFixed(7)}; barraPonto(); desenhaRascunho(); mapa?.setView([p.lat,p.lng],Math.max(mapa.getZoom(),17)); aviso(`Precisão de ${Math.round(p.prec)} m.`)}catch(er){aviso(er.message,true)} finally{const b=$("#mp-p-gps"); if(b) b.disabled=false}};
  $("#mp-p-ok").onclick=async()=>{
    const b=$("#mp-p-ok"); b.disabled=true;
    const body={tipo:modo.t,obs:$("#mp-p-obs").value.trim(),lat:modo.pos.lat,lng:modo.pos.lng};
    try{ if(modo.id){const o=pontos.find(x=>x.id===modo.id); await db.collection("pontos").doc(modo.id).set({...body,criadoEm:o?.criadoEm||new Date().toISOString()})}
         else await db.collection("pontos").add({...body,criadoEm:new Date().toISOString()});
         sair(); aviso("Ponto salvo.")}
    catch{aviso("Não foi possível salvar. Tente de novo.",true); b.disabled=false}
  };
}

/* ---------- listas ---------- */
function listas(){
  $("#mp-tal").innerHTML=talhoes().map(t=>{const g=geo[t.id], a=g?.coords?.length>2?areaHa(g.coords):0, dif=a&&t.ha?Math.abs(a-t.ha)/t.ha:0;
    return `<div class="mp-t" style="--c:${cor(t.id)}">${g?mini(t.id,52):"<i></i>"}<div><b>${esc(t.n)}</b><small>${ha(t.ha)} ha cadastrado${a?` · ${ha(a)} ha no desenho${dif>.1?` <span class="mp-dif">(diferença de ${Math.round(dif*100)}%)</span>`:""}`:" · sem contorno"}</small></div>
      <div class="mp-t-bt">${g?`<button type="button" class="link" data-mpver="${t.id}">Ver</button>`:""}<button type="button" class="link" data-mpdes="${t.id}">${g?"Redesenhar":"Desenhar"}</button></div></div>`}).join("")||`<div class="empty">Cadastre os talhões em Configurações.</div>`;
  const usados=[...new Set(pontos.map(p=>p.tipo))];
  if(filtro&&!usados.includes(filtro)) filtro="";
  $("#mp-filtro").innerHTML=usados.length>1?[["","Todos"],...usados.map(k=>[k,(TIPOS_P[k]||TIPOS_P.outro).join(" ")])].map(([k,l])=>`<button type="button" class="chip" aria-pressed="${k===filtro}" data-f="${k}">${esc(l)}</button>`).join(""):"";
  $("#mp-np").textContent=pontos.length?`${pontos.length}`:"";
  const vis=pontos.filter(p=>!filtro||p.tipo===filtro).sort((a,b)=>(talhaoDo(a)||"~").localeCompare(talhaoDo(b)||"~","pt-BR")||String(b.criadoEm).localeCompare(String(a.criadoEm)));
  $("#mp-pontos").innerHTML=vis.length?vis.map(p=>{const [ic,nm]=TIPOS_P[p.tipo]||TIPOS_P.outro; return `<div class="mp-p"><span class="mp-ic">${ic}</span><div><b>${esc(nm)}</b>${p.obs?` · ${esc(p.obs)}`:""}<small>${esc(talhaoDo(p)||"Fora dos talhões")}${p.criadoEm?" · "+brDate(p.criadoEm.slice(0,10)):""}</small></div>
      <div class="mp-t-bt"><button type="button" class="link" data-mppver="${p.id}">Ver</button><button type="button" class="link" data-mpped="${p.id}">Editar</button><button type="button" class="link danger" data-mppdel="${p.id}">Excluir</button></div></div>`}).join("")
    :`<div class="empty">Nenhum ponto marcado.<br>Use “+ Marcar ponto” para guardar onde tem pedra, buraco, toco, água…</div>`;
  $("#mp-tal").querySelectorAll("[data-mpdes]").forEach(b=>b.onclick=()=>iniciaDesenho(b.dataset.mpdes));
  $("#mp-tal").querySelectorAll("[data-mpver]").forEach(b=>b.onclick=()=>{const g=geo[b.dataset.mpver]; if(mapa&&g) {mapa.fitBounds(g.coords.map(c=>[c.lat,c.lng]),{padding:[30,30]}); $("#mp-mapa").scrollIntoView({block:"center",behavior:"smooth"})}});
  $("#mp-filtro").querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{filtro=b.dataset.f; listas(); desenhaTudo()});
  $("#mp-pontos").querySelectorAll("[data-mppver]").forEach(b=>b.onclick=()=>{const p=pontos.find(x=>x.id===b.dataset.mppver); if(mapa&&p){mapa.setView([p.lat,p.lng],18); $("#mp-mapa").scrollIntoView({block:"center",behavior:"smooth"})}});
  $("#mp-pontos").querySelectorAll("[data-mpped]").forEach(b=>b.onclick=()=>iniciaPonto(pontos.find(x=>x.id===b.dataset.mpped)));
  $("#mp-pontos").querySelectorAll("[data-mppdel]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar exclusão",()=>db.collection("pontos").doc(b.dataset.mppdel).delete()));
}
const atualiza=()=>{clearTimeout(atualiza.t); atualiza.t=setTimeout(()=>{try{listas(); minisCfg(); if(!modo) desenhaTudo(); if(mapa&&!ajustou) enquadra()}catch(e){console.error(e)}},80)};

/* ---------- ligações ---------- */
window.mpColecoes=()=>({talhoes_geo:Object.entries(geo).map(([id,g])=>({id,...g})),pontos:pontos.map(p=>({...p}))});
window.mpPlanilha=(add,dt)=>{
  add("Pontos do mapa",pontos.map(p=>({"Tipo":(TIPOS_P[p.tipo]||TIPOS_P.outro)[1],"Observação":p.obs||"","Talhão":talhaoDo(p),"Latitude":p.lat,"Longitude":p.lng,"Google Maps":`https://maps.google.com/?q=${p.lat},${p.lng}`,"Marcado em":p.criadoEm?dt(p.criadoEm.slice(0,10)):""})));
  add("Contornos dos talhões",talhoes().filter(t=>geo[t.id]).map(t=>({"Talhão":t.n,"Área cadastrada (ha)":t.ha,"Área do desenho (ha)":+areaHa(geo[t.id].coords).toFixed(2),"Cantos":geo[t.id].coords.map(c=>`${c.lat},${c.lng}`).join(" ; ")})));
};
window.mpTexto=()=>pontos.length?"\n\nPontos marcados no mapa (tipo | observação | talhão):\n"+pontos.map(p=>`${(TIPOS_P[p.tipo]||TIPOS_P.outro)[1]} | ${p.obs||"-"} | ${talhaoDo(p)||"fora dos talhões"}`).join("\n"):"";
window.mpInicia=function(){
  if(iniciou||!db) return; iniciou=true;
  db.collection("talhoes_geo").onSnapshot(s=>{geo={}; for(const d of s.docs){const g=d.data(); if(Array.isArray(g?.coords)) geo[d.id]=g} atualiza()},()=>{});
  db.collection("pontos").onSnapshot(s=>{pontos=s.docs.map(d=>({id:d.id,...d.data()})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)); atualiza()},()=>{});
};
const orig=show;
window.show=show=function(view){const r=orig.apply(this,arguments); if(view==="mapa") requestAnimationFrame(abreMapa); else if(modo) sair(); return r};
$("#mp-ponto").onclick=()=>iniciaPonto(null);
$("#mp-desenhar").onclick=()=>iniciaDesenho(null);
$("#mp-gps").onclick=async e=>{e.target.disabled=true; aviso("Pegando a localização…"); try{const p=await gps(); mapa?.setView([p.lat,p.lng],17); ajustou=true; aviso(`Você está aqui (precisão de ${Math.round(p.prec)} m).`);
  if(mapa){const c=L.circleMarker([p.lat,p.lng],{radius:8,color:"#fff",weight:3,fillColor:"#2d9cdb",fillOpacity:1}).addTo(camD); setTimeout(()=>c.remove(),15000)}}catch(er){aviso(er.message,true)} finally{e.target.disabled=false}};
window.mpDesenhar=id=>{show("mapa"); setTimeout(()=>iniciaDesenho(id),300)};
listas();
if(typeof col!=="undefined"&&col) window.mpInicia();
})();
