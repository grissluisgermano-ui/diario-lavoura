/* Diário da Lavoura — Mapa (Painel → Mapa) e editor de contornos/pontos em tela cheia.
   Imagem de satélite (Esri World Imagery) com Leaflet, carregado só quando precisa.
   Coleções: talhoes_geo/{talhaoId} {coords:[{lat,lng}], areaHa, atualizadoEm}   (id do talhão de config/propriedade, não muda ao renomear)
             pontos {tipo, obs, lat, lng, criadoEm}   (o talhão do ponto é calculado pelo contorno)
   Editor (#mp-ed, tela cheia, abre de Painel → Mapa ou de Configurações → Talhões):
     contorno: tocar no mapa põe um canto; arrastar um canto ajusta; tocar no "+" entre dois cantos cria outro; tocar num canto
               seleciona ("Remover canto"); "Canto aqui" usa o GPS; Desfazer volta qualquer passo.
     ponto: tocar no mapa (ou "Estou aqui") põe o alfinete, que pode ser arrastado; escolhe tipo e observação. */
(function(){
"use strict";
const LEAF="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
const TILES="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATRIB="Imagens © Esri, Maxar, Earthstar Geographics";
const TIPOS_P={pedra:["🪨","Pedra"],buraco:["🕳️","Buraco"],toco:["🪵","Toco"],agua:["💧","Água / brejo"],erosao:["〰️","Erosão"],cupim:["⛰️","Cupinzeiro"],cerca:["🚧","Cerca / divisa"],outro:["📍","Outro"]};
const CORES=["#f2c94c","#56ccf2","#f2994a","#bb6bd9","#6fcf97","#eb5757","#2d9cdb","#f2f2f2"];
const VISTA="mp-vista";
let geo={}, pontos=[], L=null, mapa=null, camT=null, camP=null, camX=null, filtro="", iniciou=false, ajustou=false;
let ed=null; // editor aberto: {tipo, mapa, ...}

/* ---------- utilidades ---------- */
const talhoes=()=>(typeof propCfg!=="undefined"?propCfg.talhoes:[]);
const talhaoInfo=id=>talhoes().find(t=>t.id===id)||(typeof cfgEdit!=="undefined"?cfgEdit.find(t=>t.id===id):null);
function areaHa(cs){ // área na superfície da Terra (fórmula esférica), em hectares
  if(cs.length<3) return 0; const R=6378137, rad=Math.PI/180; let s=0;
  for(let i=0;i<cs.length;i++){const a=cs[i], b=cs[(i+1)%cs.length]; s+=(b.lng-a.lng)*rad*(2+Math.sin(a.lat*rad)+Math.sin(b.lat*rad))}
  return Math.abs(s*R*R/2)/10000;
}
function dentro(p,cs){let d=false; for(let i=0,j=cs.length-1;i<cs.length;j=i++){const a=cs[i],b=cs[j]; if((a.lat>p.lat)!==(b.lat>p.lat)&&p.lng<(b.lng-a.lng)*(p.lat-a.lat)/(b.lat-a.lat)+a.lng) d=!d} return d}
const talhaoDo=p=>{for(const t of talhoes()){const g=geo[t.id]; if(g?.coords?.length>2&&dentro(p,g.coords)) return t.n} return ""};
const ha=v=>Number(v).toLocaleString("pt-BR",{maximumFractionDigits:1});
const cor=id=>{const ts=talhoes(); let i=ts.findIndex(t=>t.id===id); if(i<0&&typeof cfgEdit!=="undefined") i=cfgEdit.findIndex(t=>t.id===id); return CORES[Math.max(0,i)%CORES.length]};
const arred=ll=>({lat:+ll.lat.toFixed(7),lng:+ll.lng.toFixed(7)});
function gps(){return new Promise((ok,erro)=>{
  if(!navigator.geolocation) return erro(new Error("Este aparelho não informa a localização."));
  navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lng:p.coords.longitude,prec:p.coords.accuracy}),
    e=>erro(new Error(e.code===1?"Permita a localização para o app (Ajustes do iPhone → Privacidade → Localização).":"Não consegui pegar a localização. Tente de novo ao ar livre.")),
    {enableHighAccuracy:true,timeout:20000,maximumAge:5000})})}
function aviso(t,erro){const m=$("#mp-modo"); if(!m) return; m.hidden=false; m.className="mp-modo"+(erro?" erro":""); m.innerHTML=`<span>${esc(t)}</span>`; clearTimeout(aviso.t); aviso.t=setTimeout(()=>m.hidden=true,5000)}
const lerVista=()=>{try{return JSON.parse(localStorage.getItem(VISTA)||"null")}catch{return null}};
const guardaVista=m=>{try{const c=m.getCenter(); localStorage.setItem(VISTA,JSON.stringify({lat:c.lat,lng:c.lng,z:m.getZoom()}))}catch{}};
function todosPontos(){return [...Object.values(geo).flatMap(g=>g.coords||[]),...pontos].map(p=>[p.lat,p.lng])}
function enquadraEm(m,extra){
  const ps=extra?.length?extra:todosPontos();
  if(ps.length){m.fitBounds(ps,{padding:[30,30],maxZoom:17}); return true}
  const v=lerVista(); if(v){m.setView([v.lat,v.lng],v.z); return true}
  m.setView([-24.6,-52.5],7); return false;
}

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
/* Configurações → Talhões: miniatura que é botão para desenhar/editar */
function minisCfg(){
  const box=document.getElementById("cfg-tal"); if(!box||typeof cfgEdit==="undefined") return;
  box.classList.add("com-mini");
  box.querySelectorAll(".cfg-row").forEach(r=>{
    const t=cfgEdit[+r.dataset.i];
    let m=r.querySelector(".cfg-mini");
    if(!m){m=document.createElement("button"); m.type="button"; m.className="cfg-mini"; r.prepend(m)}
    const svg=t?.id?mini(t.id,40):"";
    m.innerHTML=svg||`<span aria-hidden="true">✏️</span>`; m.classList.toggle("vazio",!svg);
    m.setAttribute("aria-label",svg?`Editar o contorno do ${t?.n||"talhão"} no mapa`:`Desenhar o ${t?.n||"talhão"} no mapa`);
    m.onclick=()=>{ if(!t) return; if(typeof cfgLe==="function") cfgLe(); abreEditorTalhao(t.id) };
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
const novoMapa=el=>{const m=L.map(el,{zoomControl:true,attributionControl:true,maxZoom:19}); L.tileLayer(TILES,{maxZoom:19,maxNativeZoom:18,attribution:ATRIB}).addTo(m); m.attributionControl.setPrefix(false); return m};
const pinIcon=(tipo,novo)=>L.divIcon({className:"mp-pin"+(novo?" novo":""),html:`<span>${(TIPOS_P[tipo]||TIPOS_P.outro)[0]}</span>`,iconSize:novo?[40,40]:[34,34],iconAnchor:novo?[20,46]:[17,40]});

/* ---------- mapa da tela (só visualização) ---------- */
async function abreMapa(){
  if(mapa){setTimeout(()=>{mapa.invalidateSize(); if(!ajustou) ajustou=enquadraEm(mapa)},60); return}
  try{L=await carregaLeaflet()}catch{$("#mp-carr").textContent="O mapa precisa de internet na primeira vez que abre. Tente de novo com sinal.";return}
  $("#mp-carr").hidden=true;
  mapa=novoMapa("mp-mapa");
  camT=L.layerGroup().addTo(mapa); camP=L.layerGroup().addTo(mapa); camX=L.layerGroup().addTo(mapa);
  const perto=()=>$("#mp-mapa").classList.toggle("longe",mapa.getZoom()<14);
  mapa.on("zoomend",perto); mapa.on("moveend",()=>guardaVista(mapa));
  desenhaTudo(); setTimeout(()=>{mapa.invalidateSize(); ajustou=enquadraEm(mapa); perto()},60);
}
function desenhaTudo(){
  if(!mapa) return;
  camT.clearLayers(); camP.clearLayers();
  for(const t of talhoes()){const g=geo[t.id]; if(!(g?.coords?.length>2)) continue;
    const pg=L.polygon(g.coords.map(c=>[c.lat,c.lng]),{color:cor(t.id),weight:3,fillOpacity:.12}).addTo(camT);
    pg.bindTooltip(t.n,{permanent:true,direction:"center",className:"mp-rot"});
    pg.bindPopup(()=>{const d=document.createElement("div"); d.className="mp-pop";
      d.innerHTML=`<b>${esc(t.n)}</b><br>${ha(t.ha)} ha cadastrado · ${ha(areaHa(g.coords))} ha no desenho<br><button type="button" class="link">Editar contorno</button>`;
      d.querySelector("button").onclick=()=>{mapa.closePopup(); abreEditorTalhao(t.id)}; return d});
  }
  for(const p of pontos){ if(filtro&&p.tipo!==filtro) continue;
    const [,nm]=TIPOS_P[p.tipo]||TIPOS_P.outro;
    L.marker([p.lat,p.lng],{icon:pinIcon(p.tipo)}).addTo(camP).bindPopup(()=>{const d=document.createElement("div"); d.className="mp-pop";
      d.innerHTML=`<b>${esc(nm)}</b>${p.obs?`<br>${esc(p.obs)}`:""}<br><small>${esc(talhaoDo(p)||"fora dos talhões")}${p.criadoEm?" · "+brDate(p.criadoEm.slice(0,10)):""}</small><br><button type="button" class="link">Editar</button>`;
      d.querySelector("button").onclick=()=>{mapa.closePopup(); abreEditorPonto(p)}; return d});
  }
}

/* ---------- editor em tela cheia ---------- */
function montaEditor(){
  let ov=document.getElementById("mp-ed"); if(ov) return ov;
  ov=document.createElement("div"); ov.id="mp-ed"; ov.className="mp-ed"; ov.hidden=true; ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true");
  ov.innerHTML=`<div class="mp-ed-topo"><b id="mp-ed-tit"></b><button type="button" class="mp-ed-x" id="mp-ed-x" aria-label="Fechar sem salvar">✕</button></div>
    <div class="mp-ed-mapa" id="mp-ed-mapa"></div><p class="mp-ed-dica" id="mp-ed-dica"></p>
    <div class="mp-ed-painel" id="mp-ed-painel"></div>`;
  document.body.append(ov);
  ov.querySelector("#mp-ed-x").onclick=fechaEditor;
  return ov;
}
async function abreEditor(tipo,titulo){
  try{L=await carregaLeaflet()}catch{alertaSemNet();return false}
  const ov=montaEditor(); ov.hidden=false; document.documentElement.classList.add("mp-ed-aberto");
  $("#mp-ed-tit").textContent=titulo;
  if(ed?.mapa){ed.mapa.remove()}
  const m=novoMapa("mp-ed-mapa");
  ed={tipo,mapa:m,fundo:L.layerGroup().addTo(m),camada:L.layerGroup().addTo(m)};
  // contornos e pontos dos outros só como referência (não pegam o toque)
  for(const t of talhoes()){const g=geo[t.id]; if(!(g?.coords?.length>2)) continue;
    L.polygon(g.coords.map(c=>[c.lat,c.lng]),{color:cor(t.id),weight:2,opacity:.55,fillOpacity:.06,interactive:false,dashArray:"4 4"}).addTo(ed.fundo)
      .bindTooltip(t.n,{permanent:true,direction:"center",className:"mp-rot fraco",interactive:false})}
  m.on("moveend",()=>guardaVista(m));
  setTimeout(()=>m.invalidateSize(),50);
  return true;
}
function alertaSemNet(){
  const ov=montaEditor(); ov.hidden=false; document.documentElement.classList.add("mp-ed-aberto");
  $("#mp-ed-tit").textContent="Mapa"; $("#mp-ed-mapa").innerHTML=`<p class="mp-carr">O mapa precisa de internet na primeira vez que abre. Tente de novo com sinal.</p>`; $("#mp-ed-painel").innerHTML=""; $("#mp-ed-dica").textContent="";
}
function fechaEditor(){
  if(ed?.mapa){ed.mapa.remove()} ed=null;
  const ov=document.getElementById("mp-ed"); if(ov){ov.hidden=true; $("#mp-ed-mapa").innerHTML=""}
  document.documentElement.classList.remove("mp-ed-aberto");
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&ed) fechaEditor()});

/* --- contorno do talhão --- */
async function abreEditorTalhao(id){
  if(!id){const ts=talhoes(); if(!ts.length){aviso("Cadastre os talhões em Configurações primeiro.",true);return} id=ts.find(t=>!geo[t.id])?.id||ts[0].id}
  const t=talhaoInfo(id);
  if(!await abreEditor("talhao",`Contorno · ${t?.n||"talhão"}`)) return;
  Object.assign(ed,{id,cs:(geo[id]?.coords||[]).map(c=>({...c})),hist:[],sel:-1});
  const proprio=geo[id]?.coords; if(proprio?.length>2) enquadraEm(ed.mapa,proprio.map(c=>[c.lat,c.lng])); else enquadraEm(ed.mapa);
  ed.mapa.on("click",e=>{passo(); ed.cs.push(arred(e.latlng)); ed.sel=-1; redesenha()});
  redesenha();
}
const passo=()=>{ed.hist.push(ed.cs.map(c=>({...c}))); if(ed.hist.length>60) ed.hist.shift()};
function redesenha(){
  if(!ed||ed.tipo!=="talhao") return;
  const m=ed.mapa, c=cor(ed.id); ed.camada.clearLayers();
  const ll=ed.cs.map(p=>[p.lat,p.lng]);
  if(ll.length>2) L.polygon(ll,{color:c,weight:3,fillOpacity:.2,interactive:false}).addTo(ed.camada);
  else if(ll.length===2) L.polyline(ll,{color:c,weight:3,interactive:false}).addTo(ed.camada);
  // "+" no meio de cada lado: toca para criar um canto ali
  if(ll.length>1) for(let i=0;i<ll.length;i++){ if(ll.length===2&&i===1) break;
    const a=ed.cs[i], b=ed.cs[(i+1)%ed.cs.length], meio={lat:(a.lat+b.lat)/2,lng:(a.lng+b.lng)/2};
    const mk=L.marker([meio.lat,meio.lng],{icon:L.divIcon({className:"mp-meio",html:"<span>+</span>",iconSize:[26,26],iconAnchor:[13,13]}),draggable:true,keyboard:false,zIndexOffset:500}).addTo(ed.camada);
    mk.on("click",ev=>{L.DomEvent.stop(ev); passo(); ed.cs.splice(i+1,0,arred(meio)); ed.sel=i+1; redesenha()});
    mk.on("dragstart",()=>{passo(); ed.cs.splice(i+1,0,arred(meio)); ed.sel=i+1; ed.arrMeio=i+1});
    mk.on("drag",ev=>{ed.cs[ed.arrMeio]=arred(ev.target.getLatLng()); provisorio()});
    mk.on("dragend",()=>{ed.arrMeio=null; redesenha()});
  }
  // cantos: arrastar para ajustar, tocar para selecionar
  ed.cs.forEach((p,i)=>{
    const mk=L.marker([p.lat,p.lng],{icon:L.divIcon({className:"mp-canto"+(i===ed.sel?" sel":""),html:`<span style="--c:${c}"></span>`,iconSize:[30,30],iconAnchor:[15,15]}),draggable:true,keyboard:false,zIndexOffset:1000}).addTo(ed.camada);
    mk.on("click",ev=>{L.DomEvent.stop(ev); ed.sel=ed.sel===i?-1:i; redesenha()});
    mk.on("dragstart",()=>{passo(); ed.sel=i});
    mk.on("drag",ev=>{ed.cs[i]=arred(ev.target.getLatLng()); provisorio()});
    mk.on("dragend",()=>redesenha());
  });
  painelTalhao();
}
function provisorio(){ // durante o arrasto: só a linha e a área
  const ll=ed.cs.map(p=>[p.lat,p.lng]);
  ed.camada.eachLayer(l=>{if(l instanceof L.Polygon||l instanceof L.Polyline) l.setLatLngs(ll)});
  const a=$("#mp-ed-area"); if(a) a.textContent=ed.cs.length>2?`${ha(areaHa(ed.cs))} ha`:"";
}
function painelTalhao(){
  const t=talhaoInfo(ed.id), a=areaHa(ed.cs), n=ed.cs.length;
  $("#mp-ed-dica").textContent=n===0?"Toque no mapa em cada canto do talhão, dando a volta.":n<3?"Continue tocando nos cantos do talhão.":
    ed.sel>=0?"Canto selecionado: arraste para mudar de lugar, ou remova.":"Arraste um canto para ajustar · toque no + para criar um canto no meio do lado.";
  const ts=talhoes().length?talhoes():(typeof cfgEdit!=="undefined"?cfgEdit:[]);
  $("#mp-ed-painel").innerHTML=`<div class="mp-ed-l1">
      <select id="mp-ed-t" aria-label="Talhão">${ts.map(x=>`<option value="${x.id}"${x.id===ed.id?" selected":""}>${esc(x.n||"(sem nome)")}</option>`).join("")}</select>
      <span class="mp-ed-ar"><b id="mp-ed-area">${n>2?ha(a)+" ha":""}</b><small>${n>2?`cadastrado: ${ha(t?.ha||0)} ha`:`${n} canto${n===1?"":"s"}`}</small></span></div>
    <div class="mp-ed-bts">
      <button type="button" class="mp-bt" id="mp-ed-desf"${ed.hist.length?"":" disabled"}><span>↶</span>Desfazer</button>
      <button type="button" class="mp-bt" id="mp-ed-gps"><span>◎</span>Canto aqui</button>
      ${ed.sel>=0?`<button type="button" class="mp-bt perigo" id="mp-ed-rm"><span>✕</span>Remover canto</button>`:`<button type="button" class="mp-bt" id="mp-ed-limpa"${n?"":" disabled"}><span>⌫</span>Apagar tudo</button>`}
    </div>
    <div class="mp-ed-fim"><button type="button" class="btn" id="mp-ed-ok"${n>2||(n===0&&geo[ed.id])?"":" disabled"}>${n===0&&geo[ed.id]?"Salvar (sem contorno)":"Salvar contorno"}</button><button type="button" class="link" id="mp-ed-cancel">Cancelar</button><span class="note" id="mp-ed-st" role="status"></span></div>`;
  $("#mp-ed-t").onchange=e=>{fechaEditor(); abreEditorTalhao(e.target.value)};
  $("#mp-ed-desf").onclick=()=>{if(!ed.hist.length) return; ed.cs=ed.hist.pop(); ed.sel=-1; redesenha()};
  $("#mp-ed-rm")&&($("#mp-ed-rm").onclick=()=>{passo(); ed.cs.splice(ed.sel,1); ed.sel=-1; redesenha()});
  $("#mp-ed-limpa")&&($("#mp-ed-limpa").onclick=()=>{passo(); ed.cs=[]; ed.sel=-1; redesenha()});
  $("#mp-ed-cancel").onclick=fechaEditor;
  $("#mp-ed-gps").onclick=async e=>{const b=e.currentTarget; b.disabled=true; $("#mp-ed-st").textContent="Pegando a localização…";
    try{const p=await gps(); if(!ed) return; passo(); ed.cs.push(arred(p)); ed.sel=-1; ed.mapa.setView([p.lat,p.lng],Math.max(ed.mapa.getZoom(),17)); redesenha(); $("#mp-ed-st").textContent=`Canto marcado (precisão de ${Math.round(p.prec)} m).`}
    catch(er){const s=$("#mp-ed-st"); if(s) s.textContent=er.message} finally{const x=$("#mp-ed-gps"); if(x) x.disabled=false}};
  $("#mp-ed-ok").onclick=async()=>{
    const b=$("#mp-ed-ok"); b.disabled=true;
    try{
      if(!ed.cs.length) await db.collection("talhoes_geo").doc(ed.id).delete();
      else await db.collection("talhoes_geo").doc(ed.id).set({coords:ed.cs,areaHa:+areaHa(ed.cs).toFixed(2),atualizadoEm:new Date().toISOString()});
      const nm=talhaoInfo(ed.id)?.n||"talhão"; fechaEditor(); aviso(`Contorno do ${nm} salvo.`); try{flashCfg(`Contorno do ${nm} salvo.`)}catch{}
    }catch{$("#mp-ed-st").textContent="Não foi possível salvar. Tente de novo."; b.disabled=false}
  };
}
function flashCfg(t){const c=document.getElementById("cfg-toast"); if(c&&!$("#view-config").hidden) c.textContent=t}

/* --- ponto --- */
async function abreEditorPonto(p){
  if(!await abreEditor("ponto",p?"Editar ponto":"Marcar ponto")) return;
  Object.assign(ed,{id:p?.id||null,t:p?.tipo||"pedra",obs:p?.obs||"",pos:p?{lat:p.lat,lng:p.lng}:null});
  for(const x of pontos) if(x.id!==ed.id) L.marker([x.lat,x.lng],{icon:pinIcon(x.tipo),interactive:false,opacity:.6}).addTo(ed.fundo);
  if(ed.pos) ed.mapa.setView([ed.pos.lat,ed.pos.lng],18); else enquadraEm(ed.mapa);
  ed.mapa.on("click",e=>{ed.pos=arred(e.latlng); alfinete(); painelPonto()});
  alfinete(); painelPonto();
}
function alfinete(){
  ed.camada.clearLayers(); if(!ed.pos) return;
  const mk=L.marker([ed.pos.lat,ed.pos.lng],{icon:pinIcon(ed.t,true),draggable:true,zIndexOffset:1000}).addTo(ed.camada);
  mk.on("dragend",ev=>{ed.pos=arred(ev.target.getLatLng()); painelPonto()});
}
function painelPonto(){
  const tal=ed.pos?talhaoDo(ed.pos):"";
  $("#mp-ed-dica").textContent=ed.pos?`${tal?`No ${tal}. `:""}Arraste o alfinete para ajustar, ou toque em outro lugar.`:"Toque no mapa onde fica, ou use “Estou aqui”.";
  const obs=document.getElementById("mp-p-obs")?.value??ed.obs;
  $("#mp-ed-painel").innerHTML=`<div class="mp-ed-tipos" role="radiogroup" aria-label="Tipo">${Object.entries(TIPOS_P).map(([k,[ic,nm]])=>`<button type="button" class="chip" role="radio" aria-checked="${k===ed.t}" aria-pressed="${k===ed.t}" data-t="${k}">${ic} ${nm}</button>`).join("")}</div>
    <input id="mp-p-obs" value="${esc(obs)}" placeholder="Observação (ex.: pedra grande, cuidado com a plantadeira)" aria-label="Observação">
    <div class="mp-ed-fim"><button type="button" class="mp-bt" id="mp-p-gps"><span>◎</span>Estou aqui</button><button type="button" class="btn" id="mp-p-ok"${ed.pos?"":" disabled"}>Salvar ponto</button>${ed.id?`<button type="button" class="link danger" id="mp-p-del">Excluir</button>`:""}<button type="button" class="link" id="mp-p-x">Cancelar</button><span class="note" id="mp-ed-st" role="status"></span></div>`;
  $("#mp-ed-painel").querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{ed.obs=$("#mp-p-obs").value; ed.t=b.dataset.t; alfinete(); painelPonto()});
  $("#mp-p-obs").oninput=e=>ed.obs=e.target.value;
  $("#mp-p-x").onclick=fechaEditor;
  $("#mp-p-del")&&($("#mp-p-del").onclick=e=>confirmar(e.currentTarget,"Confirmar exclusão",async()=>{await db.collection("pontos").doc(ed.id).delete(); fechaEditor(); aviso("Ponto excluído.")}));
  $("#mp-p-gps").onclick=async e=>{const b=e.currentTarget; b.disabled=true; $("#mp-ed-st").textContent="Pegando a localização…";
    try{const p=await gps(); if(!ed) return; ed.obs=$("#mp-p-obs").value; ed.pos=arred(p); ed.mapa.setView([p.lat,p.lng],18); alfinete(); painelPonto(); $("#mp-ed-st").textContent=`Precisão de ${Math.round(p.prec)} m.`}
    catch(er){const s=$("#mp-ed-st"); if(s) s.textContent=er.message} finally{const x=$("#mp-p-gps"); if(x) x.disabled=false}};
  $("#mp-p-ok").onclick=async()=>{
    const b=$("#mp-p-ok"); b.disabled=true;
    const body={tipo:ed.t,obs:$("#mp-p-obs").value.trim(),lat:ed.pos.lat,lng:ed.pos.lng};
    try{ if(ed.id){const o=pontos.find(x=>x.id===ed.id); await db.collection("pontos").doc(ed.id).set({...body,criadoEm:o?.criadoEm||new Date().toISOString()})}
         else await db.collection("pontos").add({...body,criadoEm:new Date().toISOString()});
         fechaEditor(); aviso("Ponto salvo.")}
    catch{$("#mp-ed-st").textContent="Não foi possível salvar. Tente de novo."; b.disabled=false}
  };
}

/* ---------- listas da tela ---------- */
function listas(){
  $("#mp-tal").innerHTML=talhoes().map(t=>{const g=geo[t.id], a=g?.coords?.length>2?areaHa(g.coords):0, dif=a&&t.ha?Math.abs(a-t.ha)/t.ha:0;
    return `<div class="mp-t" style="--c:${cor(t.id)}"><button type="button" class="mp-t-mini" data-mpdes="${t.id}" aria-label="${g?"Editar":"Desenhar"} ${esc(t.n)}">${g?mini(t.id,52):"<i>✏️</i>"}</button><div><b>${esc(t.n)}</b><small>${ha(t.ha)} ha cadastrado${a?` · ${ha(a)} ha no desenho${dif>.1?` <span class="mp-dif">(diferença de ${Math.round(dif*100)}%)</span>`:""}`:" · sem contorno"}</small></div>
      <div class="mp-t-bt">${g?`<button type="button" class="link" data-mpver="${t.id}">Ver</button>`:""}<button type="button" class="link" data-mpdes="${t.id}">${g?"Editar":"Desenhar"}</button></div></div>`}).join("")||`<div class="empty">Cadastre os talhões em Configurações.</div>`;
  const usados=[...new Set(pontos.map(p=>p.tipo))];
  if(filtro&&!usados.includes(filtro)) filtro="";
  $("#mp-filtro").innerHTML=usados.length>1?[["","Todos"],...usados.map(k=>[k,(TIPOS_P[k]||TIPOS_P.outro).join(" ")])].map(([k,l])=>`<button type="button" class="chip" aria-pressed="${k===filtro}" data-f="${k}">${esc(l)}</button>`).join(""):"";
  $("#mp-np").textContent=pontos.length?`${pontos.length}`:"";
  const vis=pontos.filter(p=>!filtro||p.tipo===filtro).sort((a,b)=>(talhaoDo(a)||"~").localeCompare(talhaoDo(b)||"~","pt-BR")||String(b.criadoEm).localeCompare(String(a.criadoEm)));
  $("#mp-pontos").innerHTML=vis.length?vis.map(p=>{const [ic,nm]=TIPOS_P[p.tipo]||TIPOS_P.outro; return `<div class="mp-p"><span class="mp-ic">${ic}</span><div><b>${esc(nm)}</b>${p.obs?` · ${esc(p.obs)}`:""}<small>${esc(talhaoDo(p)||"Fora dos talhões")}${p.criadoEm?" · "+brDate(p.criadoEm.slice(0,10)):""}</small></div>
      <div class="mp-t-bt"><button type="button" class="link" data-mppver="${p.id}">Ver</button><button type="button" class="link" data-mpped="${p.id}">Editar</button></div></div>`}).join("")
    :`<div class="empty">Nenhum ponto marcado.<br>Use “+ Marcar ponto” para guardar onde tem pedra, buraco, toco, água…</div>`;
  $("#mp-tal").querySelectorAll("[data-mpdes]").forEach(b=>b.onclick=()=>abreEditorTalhao(b.dataset.mpdes));
  $("#mp-tal").querySelectorAll("[data-mpver]").forEach(b=>b.onclick=()=>{const g=geo[b.dataset.mpver]; if(mapa&&g) {mapa.fitBounds(g.coords.map(c=>[c.lat,c.lng]),{padding:[30,30]}); $("#mp-mapa").scrollIntoView({block:"center",behavior:"smooth"})}});
  $("#mp-filtro").querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{filtro=b.dataset.f; listas(); desenhaTudo()});
  $("#mp-pontos").querySelectorAll("[data-mppver]").forEach(b=>b.onclick=()=>{const p=pontos.find(x=>x.id===b.dataset.mppver); if(mapa&&p){mapa.setView([p.lat,p.lng],18); $("#mp-mapa").scrollIntoView({block:"center",behavior:"smooth"})}});
  $("#mp-pontos").querySelectorAll("[data-mpped]").forEach(b=>b.onclick=()=>abreEditorPonto(pontos.find(x=>x.id===b.dataset.mpped)));
}
const atualiza=()=>{clearTimeout(atualiza.t); atualiza.t=setTimeout(()=>{try{listas(); minisCfg(); desenhaTudo(); if(mapa&&!ajustou) ajustou=enquadraEm(mapa)}catch(e){console.error(e)}},80)};

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
window.show=show=function(view){const r=orig.apply(this,arguments); if(view==="mapa") requestAnimationFrame(abreMapa); return r};
$("#mp-ponto").onclick=()=>abreEditorPonto(null);
$("#mp-desenhar").onclick=()=>abreEditorTalhao(null);
$("#mp-gps").onclick=async e=>{const b=e.currentTarget; b.disabled=true; aviso("Pegando a localização…"); try{const p=await gps(); if(mapa){mapa.setView([p.lat,p.lng],17); ajustou=true;
  const c=L.circleMarker([p.lat,p.lng],{radius:8,color:"#fff",weight:3,fillColor:"#2d9cdb",fillOpacity:1}).addTo(camX); setTimeout(()=>c.remove(),15000)} aviso(`Você está aqui (precisão de ${Math.round(p.prec)} m).`)}catch(er){aviso(er.message,true)} finally{b.disabled=false}};
window.mpDesenhar=id=>abreEditorTalhao(id);
listas();
if(typeof col!=="undefined"&&col) window.mpInicia();
})();
