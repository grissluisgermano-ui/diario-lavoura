/* Diário da Lavoura — Regulagens (Estrutura → Regulagens).
   - Plantadeiras: config/plantio {plantadeiras:[{id, nome, linhas, esp (m), culturas:[...], dose:"sem/m"|"sem/ha"|"kg/ha"}]}
     (sem documento, vale PLANTADEIRAS_PAD do index.html). plantadeiras() do index lê daqui (window.rgPlantadeiras).
   - Calculadora de semente: sem/m ↔ sem/ha ↔ kg/ha (PMS) ↔ plantas/ha (germinação); rendimento das embalagens do estoque.
   - Calculadora de adubo: kg/ha → gramas por linha numa distância de teste; coletado → kg/ha real e quanto abrir/fechar.
   - Regulagens salvas: coleção regulagens {nome, plantadeira, esp, cultura, cultivar, semente, dose, unidade, pms, germ,
     adubo, aduboKgHa, disco, engrenagens, obs, data, criadoEm}; o plantio tem "Usar regulagem salva" (preenche tudo).
   - Estande: conta de plantas em pontos da linha → registro.campos.estande {data, metros, contagens:[], esp, plantasHa,
     semHa, esperadoHa, germ, pct}; aparece nos lançamentos (linhaCampos). */
(function(){
"use strict";
let plts=null, regs=[], iniciou=false, rgEdit=null, pltEdit=null;
const ABERTOS_K="rg-abertos";
let abertos=new Set(["semente"]);
try{const a=JSON.parse(localStorage.getItem(ABERTOS_K)||"null"); if(Array.isArray(a)) abertos=new Set(a)}catch{}
const guardaAbertos=()=>{try{localStorage.setItem(ABERTOS_K,JSON.stringify([...abertos]))}catch{}};

window.rgPlantadeiras=()=>plts&&plts.length?plts:null;
const plList=()=>plantadeiras();
const pltPorNome=n=>plList().find(p=>p.nome===n);
const n2=(v,d=2)=>Number.isFinite(+v)?Number(v).toLocaleString("pt-BR",{maximumFractionDigits:d}):"";
const nInt=v=>Number.isFinite(+v)?Math.round(+v).toLocaleString("pt-BR"):"";
const pn=v=>{const s=String(v??"").trim(); return s===""?NaN:parseNum(s)};
const pm=v=>qMil(v);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const box=()=>document.getElementById("rg-box");
const optPlt=(sel)=>plList().map(p=>`<option value="${esc(p.nome)}" ${p.nome===sel?"selected":""}>${esc(pltTxt(p))}</option>`).join("")+`<option value="" ${!sel?"":""}>Outra (informe o espaçamento)</option>`;
const sementes=()=>estoque.filter(e=>e.classe==="Semente"||ehEmb(e));
const adubos=()=>estoque.filter(e=>/Fertilizante|Corretivo/.test(e.classe||""));
const espTxt=v=>String(v).replace(".",",");

/* ---------- tela ---------- */
function sec(k,tit,sub,corpo){
  return `<details class="rg-sec" data-k="${k}" ${abertos.has(k)?"open":""}><summary><b>${tit}</b><span>${sub}</span></summary><div class="rg-corpo">${corpo}</div></details>`;
}
function render(){
  const b=box(); if(!b) return;
  // não redesenha enquanto alguém digita na tela (a nuvem pode mandar novidade a qualquer hora)
  if(b.contains(document.activeElement)&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){render.pend=true; return}
  const p0=plList()[0];
  b.innerHTML=
    sec("semente","🌱 Calculadora de semente","sementes por metro, por hectare, kg/ha e população",`
      <div class="grid2">
        <div class="field"><label for="rs-plt">Plantadeira</label><select id="rs-plt">${optPlt(p0?.nome)}</select></div>
        <div class="field"><label for="rs-esp">Espaçamento (m)</label><input id="rs-esp" inputmode="decimal" value="${p0?espTxt(p0.esp):""}"></div>
        <div class="field"><label for="rs-semm">Sementes por metro</label><input id="rs-semm" inputmode="decimal" placeholder="Ex.: 14"></div>
        <div class="field"><label for="rs-semha">Sementes por hectare</label><input id="rs-semha" inputmode="numeric" placeholder="Ex.: 311.111"></div>
        <div class="field"><label for="rs-pms">PMS — peso de mil sementes (g)</label><input id="rs-pms" inputmode="decimal" placeholder="Ex.: 165"></div>
        <div class="field"><label for="rs-kgha">Kg de semente por hectare</label><input id="rs-kgha" inputmode="decimal" placeholder="Precisa do PMS"></div>
        <div class="field"><label for="rs-germ">Germinação / emergência esperada (%)</label><input id="rs-germ" inputmode="decimal" value="90"></div>
        <div class="field"><label for="rs-pop">População desejada (plantas/ha)</label><input id="rs-pop" inputmode="numeric" placeholder="Ex.: 280.000"></div>
      </div>
      <p class="note">Preencha <b>um</b> dos campos de semente (por metro, por hectare, kg/ha ou população) e o app calcula os outros.</p>
      <div class="rg-res" id="rs-res"></div>
      <h4 class="rg-h4">Quanto rende cada embalagem</h4>
      <div class="grid2">
        <div class="field"><label for="rs-sem">Semente do estoque</label><select id="rs-sem"><option value="">—</option>${sementes().map(e=>`<option value="${esc(e.id)}">${esc(e.comercial)}</option>`).join("")}</select></div>
        <div class="field"><label for="rs-tal">Talhão (opcional)</label><select id="rs-tal"><option value="">—</option>${TALHOES.map(t=>`<option value="${esc(t.n)}">${esc(t.n)} (${num(t.ha)} ha)</option>`).join("")}</select></div>
      </div>
      <div class="rg-res" id="rs-emb"></div>
      <div class="row"><button type="button" class="btn ghost" id="rs-salvar">Salvar como regulagem</button></div>`)+
    sec("adubo","🧪 Calculadora de adubo","teste de coleta: quantos gramas por linha",`
      <div class="grid2">
        <div class="field"><label for="ra-plt">Plantadeira / semeadeira</label><select id="ra-plt">${optPlt(p0?.nome)}</select></div>
        <div class="field"><label for="ra-esp">Espaçamento (m)</label><input id="ra-esp" inputmode="decimal" value="${p0?espTxt(p0.esp):""}"></div>
        <div class="field"><label for="ra-kg">Adubo desejado (kg/ha)</label><input id="ra-kg" inputmode="decimal" placeholder="Ex.: 300"></div>
        <div class="field"><label for="ra-dist">Distância do teste (m)</label><input id="ra-dist" inputmode="decimal" value="10"></div>
        <div class="field"><label for="ra-lin">Linhas coletadas</label><input id="ra-lin" inputmode="numeric" value="1"></div>
        <div class="field"><label for="ra-col">Quanto você coletou (g, opcional)</label><input id="ra-col" inputmode="decimal" placeholder="Peso do teste"></div>
      </div>
      <div class="rg-res" id="ra-res"></div>`)+
    sec("salvas","📋 Regulagens salvas",`${regs.length?regs.length+" salva"+(regs.length>1?"s":""):"nenhuma ainda"} · usadas no lançamento do plantio`,`
      <div class="row"><button type="button" class="btn ghost" id="rg-novo">+ Nova regulagem</button></div>
      <div id="rg-form"></div>
      <div class="rg-lista">${regs.length?[...regs].sort((a,b)=>String(b.data||"").localeCompare(String(a.data||""))).map(linhaReg).join(""):`<p class="note">Salve a regulagem de cada plantadeira, cultura e variedade (disco, engrenagens, dose e adubo). No lançamento do plantio, escolha a regulagem e tudo vem preenchido.</p>`}</div>`)+
    sec("estande","🌿 Conferir estande","contagem de plantas depois da emergência",estandeHtml())+
    sec("plantadeiras","🚜 Plantadeiras",plList().map(p=>`${p.nome}`).join(" · "),pltHtml());
  liga();
  if(rgEdit) formReg(rgEdit==="__novo"?null:regs.find(r=>r.id===rgEdit));
}
function linhaReg(r){
  const pl=pltPorNome(r.plantadeira), esp=Number(r.esp)||pl?.esp, q=qtdDose(r.unidade,Number(r.dose),1,esp), sha=q?.med==="sem"?q.q:null;
  const det=[r.plantadeira,`${n2(r.dose,3)} ${r.unidade}${sha&&r.unidade!=="sem/ha"?` (${fmtSem(sha)}/ha)`:""}`,r.aduboKgHa?`adubo ${n2(r.aduboKgHa)} kg/ha${r.adubo?" "+r.adubo:""}`:"",r.disco?`disco ${r.disco}`:"",r.engrenagens?`engrenagens ${r.engrenagens}`:"",r.pms?`PMS ${n2(r.pms)} g`:""].filter(Boolean).join(" · ");
  return `<article class="rg-reg"><div class="rg-reg-t"><b>${esc(r.nome||[r.cultura,r.cultivar].filter(Boolean).join(" "))}</b><small>${esc(det)}</small>${r.obs?`<small class="rg-obs">${esc(r.obs)}</small>`:""}</div>
    <div class="rec-actions"><button type="button" class="link" data-rgusar="${esc(r.id)}">Usar no plantio</button><button type="button" class="link" data-rged="${esc(r.id)}">Editar</button><button type="button" class="link danger" data-rgdel="${esc(r.id)}">Excluir</button></div></article>`;
}

/* ---------- calculadora de semente ---------- */
let rsUlt="semm";
function rsCalc(){
  const esp=pn($("#rs-esp").value), M=esp>0?10000/esp:NaN, pms=pn($("#rs-pms").value), germ=pn($("#rs-germ").value);
  const g=germ>0?germ/100:NaN;
  let semha=NaN;
  if(rsUlt==="semm"){const v=pn($("#rs-semm").value); if(v>0&&M>0) semha=v*M}
  else if(rsUlt==="semha"){semha=pm($("#rs-semha").value)}
  else if(rsUlt==="kgha"){const v=pn($("#rs-kgha").value); if(v>0&&pms>0) semha=v*1e6/pms}
  else if(rsUlt==="pop"){const v=pm($("#rs-pop").value); if(v>0&&g>0) semha=v/g}
  const set=(id,v)=>{if(id!=="rs-"+rsUlt) $("#"+id).value=v};
  if(semha>0){
    if(M>0) set("rs-semm",n2(semha/M,1)); set("rs-semha",nInt(semha));
    set("rs-kgha",pms>0?n2(semha*pms/1e6,1):""); set("rs-pop",g>0?nInt(semha*g):"");
  }
  const r=$("#rs-res");
  if(!(semha>0)){r.innerHTML=""; rsEmb(); return}
  const pop=g>0?semha*g:null;
  r.innerHTML=`<div class="rg-kpis">
    <div><span>Sementes por metro</span><b>${M>0?n2(semha/M,1):"–"}</b></div>
    <div><span>Sementes por hectare</span><b>${nInt(semha)}</b></div>
    <div><span>Kg de semente por ha</span><b>${pms>0?n2(semha*pms/1e6,1)+" kg":"–"}</b>${pms>0?"":`<small>informe o PMS</small>`}</div>
    <div><span>Plantas esperadas por ha</span><b>${pop?nInt(pop):"–"}</b>${pop&&M>0?`<small>${n2(pop/M,1)} plantas por metro · ${n2(pop/10000,1)} por m²</small>`:""}</div>
  </div>${M>0?`<p class="note">Com ${espTxt(esp)} m entre linhas, 1 ha tem ${nInt(M)} metros de linha.</p>`:""}`;
  rsEmb();
}
function rsDose(){ // dose da calculadora para usar no estoque: sementes/ha e kg/ha
  return {semha:pm($("#rs-semha").value)||null, kgha:pn($("#rs-kgha").value)||null};
}
function rsEmb(){
  const out=$("#rs-emb"); if(!out) return;
  const e=estoque.find(x=>x.id===$("#rs-sem").value); if(!e){out.innerHTML=""; return}
  if(!ehEmb(e)){out.innerHTML=`<p class="note">${esc(e.comercial)} ainda não está por embalagem. Em Estoque → Editar produto, escolha "semente por embalagem".</p>`; return}
  const d=rsDose(), gs=resumoProd(e).grupos.filter(g=>g.entrou>0), t=TALHOES.find(x=>x.n===$("#rs-tal").value);
  if(!d.semha&&!d.kgha){out.innerHTML=`<p class="note">Preencha a dose acima para ver quantos hectares planta cada embalagem.</p>`; return}
  const linhas=gs.map(g=>{const med=embMed(g.m), por=embPor(g.m), dose=med==="sem"?d.semha:d.kgha;
    if(!dose||!(por>0)) return `<div class="emb-l"><span>${esc(embRot(g.m,1))}</span><span>${med==="kg"?"informe o PMS ou o kg/ha":"sem dose"}</span><span></span></div>`;
    const haPor=por/dose; return `<div class="emb-l"><span>1 ${esc(embRot(g.m,1))}</span><span>planta ${n2(haPor,2)} ha</span><span>${num(Math.max(g.saldo,0))} no estoque = ${n2(Math.max(g.saldo,0)*haPor,1)} ha</span></div>`}).join("");
  let tal="";
  if(t){const pS=d.semha?d.semha*t.ha:null, pK=d.kgha?d.kgha*t.ha:null;
    const dispS=gs.filter(g=>embMed(g.m)==="sem").reduce((s,g)=>s+Math.max(g.saldo,0)*embPor(g.m),0), dispK=gs.filter(g=>embMed(g.m)==="kg").reduce((s,g)=>s+Math.max(g.saldo,0)*embPor(g.m),0);
    const precisa=pS&&dispS>0?{q:pS,disp:dispS,txt:semTxt(pS),med:"sem"}:pK?{q:pK,disp:dispK,txt:n2(pK,0)+" kg",med:"kg"}:pS?{q:pS,disp:dispS,txt:semTxt(pS),med:"sem"}:null;
    if(precisa){const emb=gs.filter(g=>embMed(g.m)===precisa.med&&embPor(g.m)>0).map(g=>`${n2(precisa.q/embPor(g.m),1)} ${g.m.tipo==="bag"?"bags":g.m.tipo==="saco"?"sacos":"kg"}${g.m.tipo==="kg"?"":" de "+(g.m.med==="kg"?num(g.m.cont)+" kg":fmtSem(g.m.cont))}`).join(" ou ");
      const ok=precisa.disp>=precisa.q; tal=`<p class="rg-tal ${ok?"ok":"falta"}"><b>${esc(t.n)} (${num(t.ha)} ha)</b> precisa de ${precisa.txt}${emb?` ≈ ${emb}`:""}. ${ok?"O estoque cobre.":`Faltam ${precisa.med==="sem"?semTxt(precisa.q-precisa.disp):n2(precisa.q-precisa.disp,0)+" kg"}.`}</p>`}}
  out.innerHTML=`<div class="emb-tab">${linhas}</div>${tal}`;
}

/* ---------- calculadora de adubo ---------- */
function raCalc(){
  const esp=pn($("#ra-esp").value), kg=pn($("#ra-kg").value), dist=pn($("#ra-dist").value), lin=Math.max(1,Math.round(pn($("#ra-lin").value)||1)), col=pn($("#ra-col").value);
  const r=$("#ra-res");
  if(!(esp>0)||!(dist>0)){r.innerHTML=""; return}
  const gLinha=kg>0?kg*esp*dist/10:null; // kg/ha × (esp × dist m²) ÷ 10.000 m² × 1000 g
  const plt=pltPorNome($("#ra-plt")?.value), nl=plt?.linhas||0;
  let h=gLinha?`<p class="ra-frase">Para <b>${n2(kg,0)} kg/ha</b>, em <b>${n2(dist,dist%1?1:0)} m</b> tem que cair <b>${n2(gLinha,gLinha<100?1:0)} g</b> de adubo em cada linha${nl>1?` (<b>${n2(gLinha*nl/1000,2)} kg</b> somando as ${nl} linhas da ${esc(plt.nome.toLowerCase())})`:""}.</p>
    <table class="ra-tab"><thead><tr><th>Distância</th><th>Cada linha</th>${nl>1?`<th>${nl} linhas</th>`:""}</tr></thead><tbody>${[...new Set([10,20,50,100,dist])].sort((a,b)=>a-b).map(d=>{const g=kg*esp*d/10; return `<tr${d===dist?' class="sel"':""}><td>${n2(d,d%1?1:0)} m</td><td>${n2(g,g<100?1:0)} g</td>${nl>1?`<td>${g*nl>=1000?n2(g*nl/1000,2)+" kg":n2(g*nl,0)+" g"}</td>`:""}</tr>`}).join("")}</tbody></table>
    <div class="rg-kpis">
    <div><span>Por metro de linha</span><b>${n2(gLinha/dist,1)} g</b></div>
    ${lin>1?`<div><span>Nas ${lin} linhas coletadas, em ${n2(dist,dist%1?1:0)} m</span><b>${n2(gLinha*lin,0)} g</b></div>`:""}</div>`:`<p class="note">Informe o adubo desejado (kg/ha).</p>`;
  if(col>0){const real=col*10/(esp*dist*lin); h+=`<p class="rg-tal ${gLinha&&Math.abs(real-kg)/kg<=0.03?"ok":"falta"}">Você coletou ${n2(col,0)} g → está caindo <b>${n2(real,0)} kg/ha</b>.${gLinha?` ${Math.abs(real-kg)/kg<=0.03?"Dentro do esperado (até 3%).":real>kg?`${n2((real/kg-1)*100,1)}% a mais: <b>feche</b> a dosagem.`:`${n2((1-real/kg)*100,1)}% a menos: <b>abra</b> a dosagem.`}`:""}</p>`}
  r.innerHTML=h;
}

/* ---------- regulagens salvas ---------- */
function formReg(r){
  const f=$("#rg-form"); if(!f) return; r=r||{}; const pl=pltPorNome(r.plantadeira)||plList()[0];
  f.innerHTML=`<div class="rg-fbox">
    <div class="grid2">
      <div class="field" style="grid-column:1/-1"><label for="rf-nome">Nome da regulagem <small class="note">(opcional)</small></label><input id="rf-nome" value="${esc(r.nome||"")}" placeholder="Ex.: Soja Titanium 14 sem/m"></div>
      <div class="field"><label for="rf-plt">Plantadeira</label><select id="rf-plt">${optPlt(r.plantadeira??pl?.nome)}</select></div>
      <div class="field"><label for="rf-esp">Espaçamento (m)</label><input id="rf-esp" inputmode="decimal" value="${esc(espTxt(r.esp||pl?.esp||""))}"></div>
      <div class="field"><label for="rf-cul">Cultura</label><input id="rf-cul" list="dl-rf-cul" value="${esc(r.cultura||"")}"><datalist id="dl-rf-cul">${CAMPOS.cultura.opts.map(o=>`<option value="${esc(o)}">`).join("")}</datalist></div>
      <div class="field"><label for="rf-cv">Cultivar / híbrido</label><input id="rf-cv" value="${esc(r.cultivar||"")}"></div>
      <div class="field" style="grid-column:1/-1"><label for="rf-sem">Semente (do estoque)</label><input id="rf-sem" list="dl-rf-sem" value="${esc(r.semente||"")}"><datalist id="dl-rf-sem">${sementes().map(e=>`<option value="${esc(e.comercial)}">`).join("")}</datalist></div>
      <div class="field"><label for="rf-dose">Dose da semente</label><div class="nf-cont"><input id="rf-dose" inputmode="decimal" value="${r.dose!=null?esc(r.unidade==="sem/ha"?nInt(r.dose):String(r.dose).replace(".",",")):""}"><select id="rf-un">${["sem/m","sem/ha","mil sem/ha","kg/ha"].map(u=>`<option ${u===(r.unidade||pl?.dose||"sem/m")?"selected":""}>${u}</option>`).join("")}</select></div></div>
      <div class="field"><label for="rf-pms">PMS (g)</label><input id="rf-pms" inputmode="decimal" value="${r.pms?esc(String(r.pms).replace(".",",")):""}"></div>
      <div class="field"><label for="rf-germ">Germinação (%)</label><input id="rf-germ" inputmode="decimal" value="${esc(String(r.germ??"").replace(".",","))}" placeholder="Ex.: 90"></div>
      <div class="field"><label for="rf-disco">Disco / anel</label><input id="rf-disco" value="${esc(r.disco||"")}" placeholder="Ex.: 45 furos"></div>
      <div class="field"><label for="rf-eng">Engrenagens / caixa</label><input id="rf-eng" value="${esc(r.engrenagens||"")}" placeholder="Ex.: motora 18 / movida 24"></div>
      <div class="field"><label for="rf-adu">Adubo (do estoque)</label><input id="rf-adu" list="dl-rf-adu" value="${esc(r.adubo||"")}"><datalist id="dl-rf-adu">${adubos().map(e=>`<option value="${esc(e.comercial)}">`).join("")}</datalist></div>
      <div class="field"><label for="rf-akg">Adubo (kg/ha)</label><input id="rf-akg" inputmode="decimal" value="${r.aduboKgHa?esc(String(r.aduboKgHa).replace(".",",")):""}"></div>
      <div class="field" style="grid-column:1/-1"><label for="rf-obs">Observação</label><input id="rf-obs" value="${esc(r.obs||"")}" placeholder="Ex.: velocidade 6 km/h, pressão do pneu…"></div>
    </div>
    <div class="row"><button type="button" class="btn" id="rf-ok">${r.id?"Salvar alterações":"Salvar regulagem"}</button><button type="button" class="btn ghost" id="rf-x">Cancelar</button><span class="note" id="rf-st" role="status"></span></div>
  </div>`;
  $("#rf-plt").onchange=()=>{const p=pltPorNome($("#rf-plt").value); if(p){$("#rf-esp").value=espTxt(p.esp); if(!$("#rf-dose").value) $("#rf-un").value=p.dose||"sem/m"}};
  $("#rf-cul").onchange=()=>{const p=pltDaCultura($("#rf-cul").value); if(p&&!r.id){$("#rf-plt").value=p.nome; $("#rf-plt").onchange()}};
  $("#rf-sem").onchange=()=>{const e=prodEstoque($("#rf-sem").value); if(e&&!$("#rf-cv").value&&e.generico) $("#rf-cv").value=e.generico};
  $("#rf-x").onclick=()=>{rgEdit=null; f.innerHTML=""};
  $("#rf-ok").onclick=async ev=>{
    const st=t=>$("#rf-st").textContent=t, un=$("#rf-un").value;
    const dose=un==="sem/ha"?pm($("#rf-dose").value):pn($("#rf-dose").value);
    if(!$("#rf-cul").value.trim()&&!$("#rf-sem").value.trim()){st("Informe a cultura ou a semente.");return}
    const d={nome:$("#rf-nome").value.trim(),plantadeira:$("#rf-plt").value,esp:pn($("#rf-esp").value)||null,cultura:$("#rf-cul").value.trim(),cultivar:$("#rf-cv").value.trim(),
      semente:$("#rf-sem").value.trim(),dose:dose>0?dose:null,unidade:un,pms:pn($("#rf-pms").value)||null,germ:pn($("#rf-germ").value)||null,
      disco:$("#rf-disco").value.trim(),engrenagens:$("#rf-eng").value.trim(),adubo:$("#rf-adu").value.trim(),aduboKgHa:pn($("#rf-akg").value)||null,obs:$("#rf-obs").value.trim(),data:todayISO()};
    if(!d.nome) d.nome=[d.cultura,d.cultivar||d.semente,d.dose?`${n2(d.dose,2)} ${d.unidade}`:""].filter(Boolean).join(" · ");
    ev.target.disabled=true;
    try{ if(r.id) await db.collection("regulagens").doc(r.id).set(limpa({...r,...d,criadoEm:r.criadoEm||new Date().toISOString()})); else await db.collection("regulagens").add({...d,criadoEm:new Date().toISOString()});
      rgEdit=null; window.ponte?.aviso?.("Regulagem salva.",true); f.innerHTML=""}
    catch{ev.target.disabled=false; st("Não foi possível salvar. Tente de novo.")}
  };
  f.scrollIntoView({block:"nearest"});
}
const limpa=o=>{const c={...o}; delete c.id; for(const k of Object.keys(c)) if(c[k]===undefined) delete c[k]; return c};

/* usar uma regulagem no lançamento do plantio */
function aplicaNoPlantio(r){
  if(!r) return;
  if($("#c-cultura")&&r.cultura){$("#c-cultura").value=r.cultura}
  if($("#c-cultivar")&&r.cultivar){$("#c-cultivar").value=r.cultivar}
  if($("#c-plantadeira")){$("#c-plantadeira").value=pltPorNome(r.plantadeira)?r.plantadeira:"Outra"}
  if($("#c-espacamento")&&(r.esp||pltPorNome(r.plantadeira)?.esp)) $("#c-espacamento").value=r.esp||pltPorNome(r.plantadeira).esp;
  const ps=[]; if(r.semente) ps.push({nome:r.semente,dose:r.dose,unidade:r.unidade});
  if(r.adubo||r.aduboKgHa) ps.push({nome:r.adubo||"",dose:r.aduboKgHa,unidade:"kg/ha"});
  if(ps.length) renderProds(ps);
  prodTotais(); atualizaSaldos();
}
window.rgUsar=id=>{const r=regs.find(x=>x.id===id); if(!r) return; show("lancar"); setTipo("plantio"); setTimeout(()=>{const s=$("#c-rg"); if(s){s.value=id} aplicaNoPlantio(r); $("#c-rg")?.scrollIntoView({block:"center"})},50)};
function seletorPlantio(){ // "Usar regulagem salva" no topo do lançamento do plantio
  const c=$("#campos"); if(!c) return; const atual=$("#c-rg")?.value||""; c.querySelector(".rg-usa")?.remove();
  if(tipo!=="plantio"||!regs.length) return;
  c.insertAdjacentHTML("afterbegin",`<div class="field rg-usa" style="grid-column:1/-1"><label for="c-rg">Usar regulagem salva <small class="note">(opcional — preenche cultura, plantadeira, semente e adubo)</small></label><select id="c-rg"><option value="">—</option>${regs.map(r=>`<option value="${esc(r.id)}" ${r.id===atual?"selected":""}>${esc(r.nome||r.cultura)}</option>`).join("")}</select></div>`);
  $("#c-rg").onchange=e=>aplicaNoPlantio(regs.find(r=>r.id===e.target.value));
}
const origCampos=renderCampos;
renderCampos=function(vals){
  const out=origCampos.apply(this,arguments);
  try{seletorPlantio()}catch(e){console.error(e)}
  return out;
};

/* ---------- estande ---------- */
const plantiosRecentes=()=>registros.filter(r=>r.tipo==="plantio"&&!ehProg(r)).sort((a,b)=>b.data.localeCompare(a.data)).slice(0,40);
function semHaDo(r){ // sementes por ha distribuídas no plantio (linha de semente)
  for(const p of r.campos?.produtos||[]){const e=p.produtoId?estoque.find(x=>x.id===p.produtoId):prodEstoque(p.nome);
    const d=typeof p.dose==="number"?p.dose:parseNum(p.dose), q=qtdDose(p.unidade,d,1,espDe(r));
    if(q&&q.med==="sem") return q.q;
    if(q&&q.med==="kg"&&(e?.classe==="Semente"||ehEmb(e))){const rg=regs.find(x=>x.pms&&(x.semente===p.nome||x.cultivar&&x.cultivar===r.campos?.cultivar)); if(rg) return q.q*1e6/rg.pms}}
  return null;
}
let estSel=null, estPts=null;
function estandeHtml(){
  const ps=plantiosRecentes();
  if(!ps.length) return `<p class="note">Nenhum plantio executado lançado ainda.</p>`;
  const r=ps.find(x=>x.id===estSel)||ps[0]; estSel=r.id;
  const esp=espDe(r), inv=esp&&esp<0.3, met=r.campos?.estande?.metros||(inv?1:10);
  if(!estPts) estPts=r.campos?.estande?.contagens?.slice()||["","",""];
  const rg=regs.find(x=>x.cultivar&&x.cultivar===r.campos?.cultivar)||regs.find(x=>x.semente&&(r.campos?.produtos||[]).some(p=>p.nome===x.semente));
  const germ=r.campos?.estande?.germ||rg?.germ||90;
  return `<div class="grid2">
    <div class="field" style="grid-column:1/-1"><label for="re-pl">Plantio</label><select id="re-pl">${ps.map(x=>`<option value="${esc(x.id)}" ${x.id===r.id?"selected":""}>${esc(brDate(x.data))} · ${esc((x.talhoes||[]).join(", "))} · ${esc([x.campos?.cultura,x.campos?.cultivar].filter(Boolean).join(" "))}${x.campos?.estande?" ✓":""}</option>`).join("")}</select></div>
    <div class="field"><label for="re-m">Metros contados em cada ponto</label><input id="re-m" inputmode="decimal" value="${esc(String(met).replace(".",","))}"></div>
    <div class="field"><label for="re-g">Germinação esperada (%)</label><input id="re-g" inputmode="decimal" value="${esc(String(germ).replace(".",","))}"></div>
  </div>
  <p class="note">${esp?`Espaçamento do plantio: ${espTxt(esp)} m.`:"Este plantio não tem espaçamento: edite o plantio e escolha a plantadeira."} Conte as plantas na linha em vários pontos do talhão.</p>
  <div class="re-pts">${estPts.map((v,i)=>`<label>Ponto ${i+1}<input class="re-p" inputmode="numeric" value="${esc(v)}" data-i="${i}" placeholder="plantas"></label>`).join("")}<button type="button" class="link" id="re-add">+ ponto</button></div>
  <div class="rg-res" id="re-res"></div>
  <div class="row"><button type="button" class="btn" id="re-ok">Guardar no plantio</button><span class="note" id="re-st" role="status"></span></div>`;
}
function estCalc(){
  const r=registros.find(x=>x.id===estSel); const out=$("#re-res"); if(!r||!out) return null;
  const esp=espDe(r), m=pn($("#re-m").value), germ=pn($("#re-g").value), cs=$$(".re-p").map(i=>pn(i.value)).filter(v=>v>=0);
  if(!(esp>0)||!(m>0)||!cs.length){out.innerHTML=""; return null}
  const porM=cs.reduce((s,v)=>s+v,0)/cs.length/m, ha=porM*10000/esp, sem=semHaDo(r), esperado=sem&&germ>0?sem*germ/100:null, pct=esperado?ha/esperado*100:null;
  out.innerHTML=`<div class="rg-kpis">
    <div><span>Plantas por metro</span><b>${n2(porM,1)}</b><small>média de ${cs.length} ponto${cs.length>1?"s":""}</small></div>
    <div><span>Estande (plantas/ha)</span><b>${nInt(ha)}</b></div>
    <div><span>Esperado (plantas/ha)</span><b>${esperado?nInt(esperado):"–"}</b>${sem?`<small>${nInt(sem)} sementes/ha × ${n2(germ,0)}%</small>`:"<small>plantio sem dose em sementes</small>"}</div>
    <div class="${pct==null?"":pct>=90?"ok":pct>=80?"atn":"ruim"}"><span>Do esperado</span><b>${pct!=null?n2(pct,0)+"%":"–"}</b></div>
  </div>`;
  return {data:todayISO(),metros:m,contagens:$$(".re-p").map(i=>i.value.trim()).filter(Boolean).map(v=>pn(v)),esp,plantasHa:Math.round(ha),semHa:sem?Math.round(sem):null,esperadoHa:esperado?Math.round(esperado):null,germ:germ||null,pct:pct!=null?+pct.toFixed(1):null};
}
const origLinha=linhaCampos;
linhaCampos=function(r){
  const out=origLinha.apply(this,arguments);
  const e=r?.campos?.estande; if(e&&e.plantasHa) out.push({k:"Estande",v:`${nInt(e.plantasHa)} plantas/ha${e.pct!=null?` (${n2(e.pct,0)}% do esperado)`:""} — contado em ${brDate(e.data)}`});
  return out;
};

/* ---------- plantadeiras ---------- */
function pltHtml(){
  const ls=pltEdit||plList().map((p,i)=>({id:p.id||"p"+(i+1),...p}));
  return `<p class="note">Usadas no lançamento do plantio (a cultura escolhe a plantadeira e a plantadeira o espaçamento) e nas calculadoras.</p>
  <div class="rg-plts">${ls.map((p,i)=>`<div class="rg-plt" data-i="${i}">
    <div class="grid2">
      <div class="field" style="grid-column:1/-1"><label>Nome</label><input class="rp-n" value="${esc(p.nome||"")}"></div>
      <div class="field"><label>Linhas</label><input class="rp-l" inputmode="numeric" value="${esc(p.linhas??"")}"></div>
      <div class="field"><label>Espaçamento (m)</label><input class="rp-e" inputmode="decimal" value="${esc(p.esp!=null?espTxt(p.esp):"")}"></div>
      <div class="field"><label>Culturas <small class="note">(separe por vírgula)</small></label><input class="rp-c" value="${esc((p.culturas||[]).join(", "))}"></div>
      <div class="field"><label>Dose da semente</label><select class="rp-d">${["sem/m","sem/ha","kg/ha"].map(u=>`<option ${u===(p.dose||"sem/m")?"selected":""}>${u}</option>`).join("")}</select></div>
    </div>
    <div class="row" style="justify-content:space-between"><small class="note rp-info">${p.linhas&&p.esp?`Largura de trabalho ${n2(p.linhas*p.esp,2)} m · ${nInt(10000/p.esp)} m de linha por ha`:""}</small><button type="button" class="link danger rp-rm">Remover</button></div>
  </div>`).join("")}</div>
  <div class="row"><button type="button" class="btn ghost" id="rp-add">+ Plantadeira</button><button type="button" class="btn" id="rp-ok">Salvar plantadeiras</button><span class="note" id="rp-st" role="status"></span></div>`;
}
const pltLe=()=>$$(".rg-plt").map((b,i)=>({id:(pltEdit||plList())[i]?.id||"p"+Date.now().toString(36)+i,nome:b.querySelector(".rp-n").value.trim(),linhas:Math.round(pn(b.querySelector(".rp-l").value))||null,esp:pn(b.querySelector(".rp-e").value)||null,
  culturas:b.querySelector(".rp-c").value.split(/[,;]/).map(x=>x.trim()).filter(Boolean),dose:b.querySelector(".rp-d").value}));

/* ---------- ligações ---------- */
function liga(){
  $$(".rg-sec").forEach(d=>d.ontoggle=()=>{d.open?abertos.add(d.dataset.k):abertos.delete(d.dataset.k); guardaAbertos()});
  const espDaPlt=(s,e)=>{$(s).onchange=()=>{const p=pltPorNome($(s).value); if(p) $(e).value=espTxt(p.esp); rsCalc(); raCalc()}};
  espDaPlt("#rs-plt","#rs-esp"); espDaPlt("#ra-plt","#ra-esp");
  for(const k of ["semm","semha","kgha","pop"]) $("#rs-"+k).addEventListener("input",()=>{rsUlt=k; rsCalc()});
  for(const k of ["esp","pms","germ"]) $("#rs-"+k).addEventListener("input",rsCalc);
  ["#rs-semha","#rs-pop"].forEach(s=>$(s).addEventListener("change",()=>{const v=pm($(s).value); if(v>0) $(s).value=nInt(v)}));
  $("#rs-sem").onchange=rsEmb; $("#rs-tal").onchange=rsEmb;
  $("#rs-salvar").onclick=()=>{rgEdit="__novo"; abertos.add("salvas"); guardaAbertos(); $('.rg-sec[data-k="salvas"]').open=true;
    const e=estoque.find(x=>x.id===$("#rs-sem").value), semm=pn($("#rs-semm").value), kg=pn($("#rs-kgha").value), p=pltPorNome($("#rs-plt").value);
    const usaKg=p?.dose==="kg/ha"&&kg>0;
    formReg({plantadeira:$("#rs-plt").value,esp:pn($("#rs-esp").value)||null,semente:e?.comercial||"",dose:usaKg?kg:semm>0?semm:pm($("#rs-semha").value)||null,unidade:usaKg?"kg/ha":semm>0?"sem/m":"sem/ha",pms:pn($("#rs-pms").value)||null,germ:pn($("#rs-germ").value)||null})};
  $$("#ra-esp,#ra-kg,#ra-dist,#ra-lin,#ra-col").forEach(i=>i.addEventListener("input",raCalc));
  $("#rg-novo").onclick=()=>{rgEdit="__novo"; formReg(null)};
  $$("[data-rged]").forEach(b=>b.onclick=()=>{rgEdit=b.dataset.rged; formReg(regs.find(r=>r.id===rgEdit))});
  $$("[data-rgdel]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar",async()=>{await db.collection("regulagens").doc(b.dataset.rgdel).delete()}));
  $$("[data-rgusar]").forEach(b=>b.onclick=()=>window.rgUsar(b.dataset.rgusar));
  // estande
  if($("#re-pl")){
    $("#re-pl").onchange=()=>{estSel=$("#re-pl").value; estPts=null; const d=$('.rg-sec[data-k="estande"] .rg-corpo'); d.innerHTML=estandeHtml(); ligaEstande()};
    ligaEstande();
  }
  // plantadeiras
  $("#rp-add").onclick=()=>{pltEdit=pltLe(); pltEdit.push({id:"p"+Date.now().toString(36),nome:"",linhas:null,esp:null,culturas:[],dose:"sem/m"}); $('.rg-sec[data-k="plantadeiras"] .rg-corpo').innerHTML=pltHtml(); liga()};
  $$(".rp-rm").forEach(b=>b.onclick=()=>{pltEdit=pltLe(); pltEdit.splice(+b.closest(".rg-plt").dataset.i,1); $('.rg-sec[data-k="plantadeiras"] .rg-corpo').innerHTML=pltHtml(); liga()});
  $("#rp-ok").onclick=async ev=>{
    const st=t=>$("#rp-st").textContent=t, ls=pltLe();
    if(!ls.length){st("Cadastre ao menos uma plantadeira.");return}
    for(const p of ls){ if(!p.nome){st("Há plantadeira sem nome.");return} if(!(p.esp>0)){st(`Informe o espaçamento de ${p.nome}.`);return} }
    ev.target.disabled=true;
    try{await db.collection("config").doc("plantio").set({plantadeiras:ls}); pltEdit=null; window.ponte?.aviso?.("Plantadeiras salvas.",true)}
    catch{ev.target.disabled=false; st("Não foi possível salvar.")}
  };
  rsCalc(); raCalc();
}
function ligaEstande(){
  $$(".re-p,#re-m,#re-g").forEach(i=>i.addEventListener("input",()=>{estPts=$$(".re-p").map(x=>x.value); estCalc()}));
  $("#re-add").onclick=()=>{estPts=$$(".re-p").map(x=>x.value); estPts.push(""); const d=$('.rg-sec[data-k="estande"] .rg-corpo'); d.innerHTML=estandeHtml(); ligaEstande(); $$(".re-p").pop()?.focus()};
  $("#re-ok").onclick=async ev=>{
    const st=t=>$("#re-st").textContent=t, e=estCalc(), r=registros.find(x=>x.id===estSel);
    if(!e||!r){st("Informe o espaçamento, os metros e as contagens.");return}
    ev.target.disabled=true;
    try{const {id,...d}=r; d.campos={...d.campos,estande:e}; await db.collection("registros").doc(id).set(d); st(""); window.ponte?.aviso?.(`Estande guardado no plantio: ${nInt(e.plantasHa)} plantas/ha.`,true); estPts=null}
    catch{st("Não foi possível guardar.")} finally{ev.target.disabled=false}
  };
  estCalc();
}

/* ---------- dados ---------- */
const agenda=()=>{clearTimeout(agenda.t); agenda.t=setTimeout(()=>{try{render()}catch(e){console.error(e)}},120)};
document.addEventListener("focusout",()=>{if(render.pend){render.pend=false; setTimeout(()=>{if(!box()?.contains(document.activeElement)) agenda(); else render.pend=true},50)}});
window.rgColecao=()=>regs.map(r=>({...r}));
window.rgConfig=()=>plts?{plantadeiras:plts}:null;
window.rgPlanilha=add=>add("Regulagens",regs.map(r=>({"Nome":r.nome||"","Plantadeira":r.plantadeira||"","Espaçamento (m)":r.esp||"","Cultura":r.cultura||"","Cultivar":r.cultivar||"","Semente":r.semente||"","Dose":r.dose??"","Unidade":r.unidade||"","PMS (g)":r.pms||"","Germinação (%)":r.germ||"","Disco":r.disco||"","Engrenagens":r.engrenagens||"","Adubo":r.adubo||"","Adubo (kg/ha)":r.aduboKgHa||"","Observação":r.obs||"","Data":r.data?brDate(r.data):""})));
window.rgTexto=()=>(regs.length?"\n\nRegulagens salvas das plantadeiras (nome | plantadeira | cultura cultivar | semente e dose | PMS | germinação | disco | engrenagens | adubo):\n"+regs.map(r=>[r.nome,r.plantadeira,[r.cultura,r.cultivar].filter(Boolean).join(" "),`${r.semente||""} ${r.dose??""} ${r.unidade||""}`.trim(),r.pms?r.pms+" g":"",r.germ?r.germ+"%":"",r.disco,r.engrenagens,r.aduboKgHa?`${r.adubo||"adubo"} ${r.aduboKgHa} kg/ha`:""].map(x=>x||"-").join(" | ")).join("\n"):"")+
  "\nPlantadeiras: "+plList().map(p=>`${p.nome} ${p.linhas||"?"} linhas × ${p.esp} m (${(p.culturas||[]).join(", ")}; semente em ${p.dose})`).join("; ");
const origShow=show;
show=function(v){const r=origShow.apply(this,arguments); if(v==="regulagens") agenda(); return r};
window.rgInicia=function(){
  if(iniciou||!db) return; iniciou=true;
  db.collection("regulagens").onSnapshot(s=>{regs=s.docs.map(d=>({id:d.id,...d.data()})); try{seletorPlantio()}catch{} if(!$("#view-regulagens").hidden) agenda()},()=>{});
  db.collection("config").doc("plantio").onSnapshot(d=>{const x=d.exists?d.data():null; plts=Array.isArray(x?.plantadeiras)&&x.plantadeiras.length?x.plantadeiras:null; if(!$("#view-regulagens").hidden) agenda()},()=>{});
};
if(typeof col!=="undefined"&&col) window.rgInicia();
})();
