/* Diário da Lavoura — ciclo da cultura por talhão: DAP, DAE e DAA.
   DAP = dias após o plantio (registro de plantio executado, o mais recente do talhão que ainda não foi colhido)
   DAE = dias após a emergência (campo "Emergência" do plantio: no lançamento ou no botão "Informar emergência" do Painel)
   DAA = dias após a última aplicação executada no talhão (+ carência, se informada na aplicação)
   Aparece no Painel ("Talhões hoje") e em cada lançamento do Histórico ("Ciclo: 35 DAP · 28 DAE"). */
(function(){
"use strict";
const DIA=864e5;
const dias=(de,ate)=>Math.round((new Date(ate+"T12:00:00")-new Date(de+"T12:00:00"))/DIA);
const soma=(iso,n)=>{const d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10)};
const exec=r=>!ehProg(r);
const tem=(r,t)=>(r.talhoes||[]).includes(t);

/* Ciclo aberto do talhão numa data: último plantio até a data, sem colheita entre ele e a data */
const nk=s=>String(s||"").trim().toLowerCase();
function ciclo(t,data,cultura){
  let ps=registros.filter(r=>r.tipo==="plantio"&&exec(r)&&tem(r,t)&&r.data<=data).sort((a,b)=>b.data.localeCompare(a.data));
  if(nk(cultura)&&ps.some(p=>nk(p.campos?.cultura)===nk(cultura))) ps=ps.filter(p=>nk(p.campos?.cultura)===nk(cultura));
  const p=ps[0]; if(!p) return null;
  const col=registros.filter(r=>r.tipo==="colheita"&&exec(r)&&tem(r,t)&&r.data>=p.data&&r.data<=data&&(!nk(r.campos?.cultura)||!nk(p.campos?.cultura)||nk(r.campos.cultura)===nk(p.campos.cultura))).sort((a,b)=>a.data.localeCompare(b.data))[0];
  const em=p.campos?.emergencia&&p.campos.emergencia<=data?p.campos.emergencia:null;
  return {p,cultura:p.campos?.cultura||"",cultivar:p.campos?.cultivar||"",dap:dias(p.data,data),emergencia:p.campos?.emergencia||null,dae:em?dias(em,data):null,colheita:col||null};
}
function ultimaAplic(t,data,desde,filtro){
  return registros.filter(r=>r.tipo==="aplicacao"&&exec(r)&&tem(r,t)&&r.data<=data&&(!desde||r.data>=desde)&&(!filtro||filtro(r))).sort((a,b)=>b.data.localeCompare(a.data)||String(b.criadoEm).localeCompare(String(a.criadoEm)))[0]||null;
}
const txtCiclo=c=>[`${c.dap} DAP`,c.dae!=null?`${c.dae} DAE`:""].filter(Boolean).join(" · ");
const prods=r=>(r.campos?.produtos||[]).map(p=>p.nome).filter(Boolean);
window.cicloDe=ciclo;

/* ---------- no Histórico: "Ciclo" em cada lançamento ---------- */
const origLinha=linhaCampos;
linhaCampos=function(r){
  const out=origLinha.apply(this,arguments);
  try{
    if(!r||r.tipo==="chuva"||r.tipo==="plantio"||!(r.talhoes||[]).length) return out;
    const partes=[], vistos=new Map();
    for(const t of r.talhoes){const c=ciclo(t,r.data,r.campos?.cultura); if(!c||c.colheita&&c.colheita.id!==r.id) continue;
      const k=txtCiclo(c); vistos.set(k,[...(vistos.get(k)||[]),t])}
    if(vistos.size===1&&r.talhoes.length===[...vistos.values()][0].length) partes.push([...vistos.keys()][0]);
    else for(const [k,ts] of vistos) partes.push(`${ts.join(", ")}: ${k}`);
    if(partes.length) out.push({k:"Ciclo",v:partes.join(" · ")});
    if(r.tipo==="aplicacao"){
      const ants=r.talhoes.map(t=>{const c=ciclo(t,r.data,r.campos?.cultura); return registros.filter(x=>x.id!==r.id&&x.tipo==="aplicacao"&&exec(x)&&tem(x,t)&&x.data<=r.data&&(!c||x.data>=c.p.data)).sort((a,b)=>b.data.localeCompare(a.data))[0]}).filter(Boolean);
      if(ants.length){const d=Math.min(...ants.map(a=>dias(a.data,r.data))); out.push({k:"Desde a aplicação anterior",v:`${d} dia${d===1?"":"s"}`})}
    }
    if(r.tipo==="aplicacao"&&Number(r.campos?.carencia)>0) out.push({k:"Fim da carência",v:brDate(soma(r.data,Number(r.campos.carencia)))});
  }catch(e){console.error(e)}
  return out;
};

/* ---------- Lavouras do talhão: culturas (e variedades) plantadas ao mesmo tempo em partes do talhão ----------
   Ex.: Talhão 1 com soja em 40,5 ha e cevada em 38 ha; Talhão 2 com milho de duas variedades.
   Plantio ativo = executado até a data, sem colheita depois dele da mesma cultura (colheita sem cultura fecha tudo). */
function lavouras(t,data){
  const ps=registros.filter(r=>r.tipo==="plantio"&&exec(r)&&tem(r,t)&&r.data<=data).sort((a,b)=>a.data.localeCompare(b.data));
  const cols=registros.filter(r=>r.tipo==="colheita"&&exec(r)&&tem(r,t)&&r.data<=data);
  const ativos=ps.filter(p=>!cols.some(c=>c.data>=p.data&&(!nk(c.campos?.cultura)||!nk(p.campos?.cultura)||nk(c.campos.cultura)===nk(p.campos.cultura))));
  const ha=haDe(t), areaP=p=>Number(p.areas?.[t])||ha, gs=new Map();
  for(const p of ativos){
    const k=nk(p.campos?.cultura); let G=gs.get(k); if(!G){G={k,cultura:p.campos?.cultura||"Cultura",vars:new Map()}; gs.set(k,G)}
    const kv=nk(p.campos?.cultivar); let V=G.vars.get(kv); if(!V){V={k:kv,cultivar:p.campos?.cultivar||"",ps:[]}; G.vars.set(kv,V)} V.ps.push(p);
  }
  const info=ps=>{const p=ps[0], em=ps.map(x=>x.campos?.emergencia).filter(Boolean).sort()[0]||null;
    return {p,ps,area:Math.min(ha,ps.reduce((a,x)=>a+areaP(x),0)),dap:dias(p.data,data),emergencia:em,dae:em&&em<=data?dias(em,data):null}};
  return [...gs.values()].map(G=>{const vars=[...G.vars.values()].map(V=>({k:V.k,cultivar:V.cultivar,...info(V.ps)}));
    return {k:G.k,cultura:G.cultura,vars,...info(vars.flatMap(v=>v.ps).sort((a,b)=>a.data.localeCompare(b.data)))}});
}
// escolha por talhão: "" = tudo · "c:<cultura>" · "v:<cultura>|<variedade>" (guardada neste aparelho)
let escolha={}; try{escolha=JSON.parse(localStorage.getItem("ci-escolha")||"{}")}catch{}
const guarda=()=>{try{localStorage.setItem("ci-escolha",JSON.stringify(escolha))}catch{}};
function selDe(t,ls){
  let s=escolha[t]||""; const [tp,v]=[s.slice(0,1),s.slice(2)], [kc,kv]=v.split("|");
  const G=ls.find(g=>g.k===kc);
  if(!s||!G) return ls.length===1?{G:ls[0],V:ls[0].vars.length===1?ls[0].vars[0]:null,s:""}:{G:null,V:null,s:""};
  const V=tp==="v"?G.vars.find(x=>x.k===kv)||null:(G.vars.length===1?G.vars[0]:null);
  return {G,V,s};
}
// lançamento vale para a escolha? (sem cultura/variedade informada = vale para todas)
const casa=(r,G,V)=>{if(!G) return true; const rc=nk(r.campos?.cultura); if(rc&&rc!==G.k) return false;
  if(V&&V.k){const rv=nk(r.campos?.cultivar); if(rv&&rv!==V.k) return false} return true};
function chips(t,ls,sel){
  if(ls.length<2&&!(ls[0]?.vars.length>1)) return "";
  const c=(v,txt,on)=>`<button type="button" class="chip ci-chip" aria-pressed="${on}" data-cisel="${esc(t)}|${esc(v)}">${txt}</button>`;
  let h=`<div class="chips ci-chips">${ls.length>1?c("","Tudo",!sel.G):""}${ls.map(g=>c("c:"+g.k,`${esc(g.cultura)} <small>${num(g.area)} ha</small>`,sel.G===g&&(!sel.V||g.vars.length===1))).join("")}</div>`;
  if(sel.G&&sel.G.vars.length>1) h+=`<div class="chips ci-chips ci-vars">${c("c:"+sel.G.k,"Todas as variedades",!sel.V)}${sel.G.vars.map(v=>c("v:"+sel.G.k+"|"+v.k,`${esc(v.cultivar||"Sem variedade")} <small>${num(v.area)} ha</small>`,sel.V===v)).join("")}</div>`;
  return h;
}
function ligaChips(root,depois){
  root.querySelectorAll("[data-cisel]").forEach(b=>b.onclick=e=>{e.stopPropagation(); const i=b.dataset.cisel.indexOf("|"), t=b.dataset.cisel.slice(0,i), v=b.dataset.cisel.slice(i+1);
    if(v) escolha[t]=v; else delete escolha[t]; guarda(); depois()});
}

/* ---------- Painel: "Talhões hoje" ---------- */
let abrirEm=null;
function render(){
  const box=$("#ci-box"); if(!box) return;
  const hoje=todayISO(), ts=TALHOES.map(t=>t.n);
  const linhas=ts.map(t=>({t,c:ciclo(t,hoje),ls:lavouras(t,hoje)}));
  if(!linhas.some(x=>x.c)){box.hidden=true;return}
  box.hidden=false;
  const numsDe=(t,L,filtro)=>{const a=ultimaAplic(t,hoje,L.p.data,filtro);
    return {a,html:`<span class="ci-n"><b>${L.dap}</b><small>DAP</small></span>${L.dae!=null?`<span class="ci-n"><b>${L.dae}</b><small>DAE</small></span>`:L.emergencia?`<span class="ci-n"><b>–</b><small>emerge ${brDate(L.emergencia).slice(0,5)}</small></span>`:""}${a?`<span class="ci-n"><b>${dias(a.data,hoje)}</b><small>DAA</small></span>`:""}`}};
  box.innerHTML=`<div class="ci-top"><h3>Talhões hoje</h3><span class="note">DAP = dias após o plantio · DAE = após a emergência · DAA = após a aplicação</span></div>
    <div class="ci-lista">${linhas.map(({t,c,ls})=>{
      const id=(typeof propCfg!=="undefined"?propCfg.talhoes.find(x=>x.n===t)?.id:null), mini=id&&window.mpMini?window.mpMini(id,40):"";
      if(!c) return `<div class="ci-t vazio" data-ct="${esc(t)}" role="button" tabindex="0" aria-label="Ver tudo do talhão ${esc(t)}">${mini?`<span class="ci-mini">${mini}</span>`:""}<div class="ci-c"><b>${esc(t)}</b><small>Sem plantio registrado</small><span class="ci-ver">Ver atividades da safra ›</span></div></div>`;
      if(!ls.length) return `<div class="ci-t vazio" data-ct="${esc(t)}" role="button" tabindex="0" aria-label="Ver tudo do talhão ${esc(t)}">${mini?`<span class="ci-mini">${mini}</span>`:""}<div class="ci-c"><b>${esc(t)}</b><small>${esc(c.cultura||"Cultura")} colhida em ${brDate(c.colheita?.data||c.p.data)}${c.colheita?` (${dias(c.colheita.data,hoje)} dias)`:""}</small><span class="ci-ver">Ver o que foi feito ›</span></div></div>`;
      const sel=selDe(t,ls), L=sel.V||sel.G;
      let corpo;
      if(!L){ // Tudo: uma linha por cultura
        corpo=ls.map(g=>{const n=numsDe(t,g,r=>casa(r,g,null)); return `<div class="ci-lav"><div class="ci-l1"><b>${esc(g.cultura)}</b><span>${num(g.area)} ha${g.vars.length>1?` · ${g.vars.length} variedades`:g.vars[0]?.cultivar?" · "+esc(g.vars[0].cultivar):""}</span></div><div class="ci-nums">${n.html}</div></div>`}).join("");
      }else{
        const filtro=r=>casa(r,sel.G,sel.V), n=numsDe(t,L,filtro), a=n.a, car=a&&Number(a.campos?.carencia)>0?soma(a.data,Number(a.campos.carencia)):null;
        const nome=[sel.G.cultura,sel.V?sel.V.cultivar:(sel.G.vars.length>1?`${sel.G.vars.length} variedades`:"")].filter(Boolean).join(" · ");
        const ab=abrirEm===L.p.id+"|"+t;
        corpo=`<div class="ci-l1"><span>${esc(nome)} · ${num(L.area)} ha</span></div>
          <div class="ci-nums">${n.html}</div>
          <small class="ci-sub">Plantio em ${brDate(L.p.data)}${L.emergencia?` · emergência em ${brDate(L.emergencia)}`:""}</small>
          ${a?`<small class="ci-sub">Última aplicação ${brDate(a.data)}${prods(a).length?`: ${esc(prods(a).join(" + "))}`:a.nome?`: ${esc(a.nome)}`:""}${car?` · <span class="${car>hoje?"ci-car":"ci-lib"}">${car>hoje?`carência até ${brDate(car)} (faltam ${dias(hoje,car)} dias)`:`carência terminou em ${brDate(car)}`}</span>`:""}</small>`:""}
          ${L.emergencia?"":ab?`<div class="ci-em"><input type="date" id="ci-em-d" value="${hoje}" max="${hoje}" min="${L.p.data}" aria-label="Data da emergência"><button type="button" class="btn fn-mini" data-ciok="${L.p.id}">Salvar</button><button type="button" class="link" data-cix>Cancelar</button></div>`
            :`<button type="button" class="link ci-bt" data-ciem="${L.p.id}|${esc(t)}">Informar emergência</button>`}`;
      }
      return `<div class="ci-t" data-ct="${esc(t)}" role="button" tabindex="0" aria-label="Ver tudo do talhão ${esc(t)}">${mini?`<span class="ci-mini">${mini}</span>`:""}<div class="ci-c">
          <div class="ci-l1"><b>${esc(t)}</b>${ls.length===1&&ls[0].vars.length===1?`<span>${esc([ls[0].cultura,ls[0].vars[0].cultivar].filter(Boolean).join(" · "))}</span>`:""}</div>
          ${chips(t,ls,sel)}
          ${corpo}
          <span class="ci-ver">Ver tudo deste talhão ›</span>
        </div></div>`}).join("")}</div>`;
  ligaChips(box,render);
  box.querySelectorAll("[data-ct]").forEach(el=>{
    const abre=e=>{if(e.target.closest("button,input,a,.ci-chips")) return; abreTalhao(el.dataset.ct)};
    el.addEventListener("click",abre);
    el.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target===el){e.preventDefault(); abreTalhao(el.dataset.ct)}});
  });
  box.querySelectorAll("[data-ciem]").forEach(b=>b.onclick=()=>{abrirEm=b.dataset.ciem; render(); $("#ci-em-d")?.focus()});
  box.querySelectorAll("[data-cix]").forEach(b=>b.onclick=()=>{abrirEm=null; render()});
  box.querySelectorAll("[data-ciok]").forEach(b=>b.onclick=async()=>{
    const r=registros.find(x=>x.id===b.dataset.ciok), d=$("#ci-em-d").value; if(!r||!d) return;
    if(d<r.data){$("#ci-em-d").setCustomValidity("A emergência não pode ser antes do plantio."); $("#ci-em-d").reportValidity(); return}
    b.disabled=true; const {id,...doc}=r; doc.campos={...doc.campos,emergencia:d};
    try{await col.doc(id).set(doc); abrirEm=null}catch{b.disabled=false}
  });
}
/* ---------- Tela do talhão: tudo o que foi feito no ciclo atual ---------- */
let aberto=null;
function periodo(t){
  const hoje=todayISO(), ls=lavouras(t,hoje), sel=selDe(t,ls), L=sel.V||sel.G;
  if(ls.length){ // lavouras ativas: começa depois da colheita anterior ao primeiro plantio ativo
    const p0=ls.flatMap(g=>g.vars.flatMap(v=>v.ps)).sort((a,b)=>a.data.localeCompare(b.data))[0];
    const ant=registros.filter(r=>r.tipo==="colheita"&&exec(r)&&tem(r,t)&&r.data<p0.data).sort((a,b)=>b.data.localeCompare(a.data))[0];
    const ini=ant?soma(ant.data,1):safraDe(p0.data)+"-07-01";
    const c=L?{p:L.p,dap:L.dap,dae:L.dae,colheita:null,cultura:sel.G.cultura,cultivar:sel.V?.cultivar||""}:null;
    const tit=L?`${sel.G.cultura}${sel.V?.cultivar?" · "+sel.V.cultivar:""} · ${num(L.area)} ha`:ls.map(g=>`${g.cultura} ${num(g.area)} ha`).join(" + ");
    return {c,ini,fim:null,tit:tit+` · safra ${safraLab(safraDe(p0.data))}`,ls,sel,filtro:r=>casa(r,sel.G,sel.V)};
  }
  const c=ciclo(t,hoje);
  if(!c){const y=safraDe(hoje); return {c:null,ini:y+"-07-01",fim:null,tit:`Safra ${safraLab(y)}`}}
  // começa logo depois da colheita anterior (pega a dessecação/pré-plantio); sem colheita anterior, no início da safra do plantio
  const ant=registros.filter(r=>r.tipo==="colheita"&&exec(r)&&tem(r,t)&&r.data<c.p.data).sort((a,b)=>b.data.localeCompare(a.data))[0];
  const ini=ant?soma(ant.data,1):safraDe(c.p.data)+"-07-01";
  return {c,ini,fim:c.colheita?c.colheita.data:null,tit:`${c.cultura||"Cultura"}${c.cultivar?" · "+c.cultivar:""} · safra ${safraLab(safraDe(c.p.data))}`};
}
function telaTalhao(){
  const el=$("#ct-tela"); if(!el||!aberto) return;
  const t=aberto, hoje=todayISO(), {c,ini,fim,tit,ls,sel,filtro}=periodo(t);
  const rs=registros.filter(r=>r.tipo!=="chuva"&&tem(r,t)&&r.data>=ini&&(!fim||r.data<=fim)&&(!filtro||filtro(r)))
    .sort((a,b)=>a.data.localeCompare(b.data)||String(a.criadoEm).localeCompare(String(b.criadoEm)));
  const ex=rs.filter(exec), pr=rs.filter(r=>!exec(r));
  const ha=haDe(t), areaDe=r=>Number(r.areas?.[t])||ha;
  const cHa=ex.reduce((a,r)=>a+(Number(r.custoHa)||0),0), cTot=ex.reduce((a,r)=>a+(Number(r.custoHa)||0)*areaDe(r),0);
  const temLiq=ex.some(r=>r.custoHaLiq!=null), cHaL=ex.reduce((a,r)=>a+(Number(r.custoHaLiq??r.custoHa)||0),0);
  const pHa=pr.reduce((a,r)=>a+(Number(r.custoHa)||0),0);
  const chIni=c?c.p.data:ini, chFim=fim||hoje;
  const mm=registros.filter(r=>r.tipo==="chuva"&&r.data>=chIni&&r.data<=chFim&&(!(r.talhoes||[]).length||tem(r,t))).reduce((a,r)=>a+(Number(r.campos?.mm)||0),0);
  const porTipo={}; for(const r of ex) porTipo[r.tipo]=(porTipo[r.tipo]||0)+1;
  const id=(typeof propCfg!=="undefined"?propCfg.talhoes.find(x=>x.n===t)?.id:null), mini=id&&window.mpMini?window.mpMini(id,56):"";
  const rot=d=>!c?"":d>=c.p.data?`${dias(c.p.data,d)} DAP`:`${dias(d,c.p.data)} dias antes do plantio`;
  let lista="",dia=null;
  for(const r of rs){
    if(r.data!==dia){if(dia) lista+="</div>"; dia=r.data; lista+=`<div class="day"><h3>${brDate(r.data)}${rot(r.data)?` <small class="ct-dap">${rot(r.data)}</small>`:""}${r.data>hoje?` <small class="ct-fut">daqui a ${dias(hoje,r.data)} dias</small>`:""}</h3>`}
    lista+=recCard(r);
  }
  if(dia) lista+="</div>";
  el.innerHTML=`<div class="ct-bar"><button type="button" class="btn ghost" id="ct-volta">‹ Voltar</button><span class="ct-bar-t">${esc(t)}</span></div>
    <div class="ct-corpo">
      <div class="ct-cab">${mini?`<span class="ci-mini">${mini}</span>`:""}<div><h2>${esc(t)} <small>${num(ha)} ha</small></h2><p class="note">${esc(tit)}${c?` · plantio em ${brDate(c.p.data)}`:""}${c?.colheita?` · colhido em ${brDate(c.colheita.data)}`:""}</p></div></div>
      ${ls?chips(t,ls,sel):""}
      ${c&&!c.colheita?`<div class="ci-nums"><span class="ci-n"><b>${c.dap}</b><small>DAP</small></span>${c.dae!=null?`<span class="ci-n"><b>${c.dae}</b><small>DAE</small></span>`:""}${(()=>{const a=ultimaAplic(t,hoje,c.p.data,filtro); return a?`<span class="ci-n"><b>${dias(a.data,hoje)}</b><small>DAA</small></span>`:""})()}</div>`:""}
      <div class="ct-res">
        <div><b>${ex.length}</b><small>atividade${ex.length===1?"":"s"} feita${ex.length===1?"":"s"}</small></div>
        <div><b>${pr.length}</b><small>programada${pr.length===1?"":"s"}</small></div>
        <div><b>${num(mm)} mm</b><small>chuva ${c?"desde o plantio":"na safra"}</small></div>
        <div><b>${brl(cHa)}/ha</b><small>insumos aplicados · ${brl(cTot)} no talhão${temLiq?` · com desconto ${brl(cHaL)}/ha`:""}${pHa?` · + ${brl(pHa)}/ha programado`:""}</small></div>
      </div>
      ${Object.keys(porTipo).length?`<p class="note ct-tipos">${Object.entries(porTipo).map(([k,n])=>`${esc(TIPOS[k]?.label||k)}: <b>${n}</b>`).join(" · ")}</p>`:""}
      <p class="note">Desde ${brDate(ini)}${fim?` até a colheita`:" até hoje (e o que está programado)"}. A chuva é a lançada na propriedade.</p>
      <div class="ct-lista">${rs.length?lista:`<div class="empty">Nenhuma atividade lançada neste talhão ${c?"neste ciclo":"nesta safra"}.</div>`}</div>
    </div>`;
  ligaCards(el); ligaChips(el,()=>{telaTalhao(); render()});
  el.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",fecha));
  $("#ct-volta").onclick=fecha;
}
function abreTalhao(t){
  aberto=t;
  let el=$("#ct-tela"); if(!el){el=document.createElement("div"); el.id="ct-tela"; el.className="ct-tela"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); document.body.appendChild(el)}
  el.hidden=false; document.body.classList.add("ct-aberto"); telaTalhao(); el.scrollTop=0; $("#ct-volta")?.focus();
}
function fecha(){aberto=null; const el=$("#ct-tela"); if(el) el.hidden=true; document.body.classList.remove("ct-aberto")}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&aberto) fecha()});
window.abreTalhao=abreTalhao;

const agenda=()=>{clearTimeout(agenda.t); agenda.t=setTimeout(()=>{try{render(); if(aberto) telaTalhao()}catch(e){console.error(e)}},120)};
const origLista=renderLista;
renderLista=function(){const r=origLista.apply(this,arguments); agenda(); return r};
document.addEventListener("visibilitychange",()=>{if(!document.hidden) agenda()});
agenda();
})();
