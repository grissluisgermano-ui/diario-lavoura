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
function ciclo(t,data){
  const ps=registros.filter(r=>r.tipo==="plantio"&&exec(r)&&tem(r,t)&&r.data<=data).sort((a,b)=>b.data.localeCompare(a.data));
  const p=ps[0]; if(!p) return null;
  const col=registros.filter(r=>r.tipo==="colheita"&&exec(r)&&tem(r,t)&&r.data>=p.data&&r.data<=data).sort((a,b)=>a.data.localeCompare(b.data))[0];
  const em=p.campos?.emergencia&&p.campos.emergencia<=data?p.campos.emergencia:null;
  return {p,cultura:p.campos?.cultura||"",cultivar:p.campos?.cultivar||"",dap:dias(p.data,data),emergencia:p.campos?.emergencia||null,dae:em?dias(em,data):null,colheita:col||null};
}
function ultimaAplic(t,data,desde){
  return registros.filter(r=>r.tipo==="aplicacao"&&exec(r)&&tem(r,t)&&r.data<=data&&(!desde||r.data>=desde)).sort((a,b)=>b.data.localeCompare(a.data)||String(b.criadoEm).localeCompare(String(a.criadoEm)))[0]||null;
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
    for(const t of r.talhoes){const c=ciclo(t,r.data); if(!c||c.colheita&&c.colheita.id!==r.id) continue;
      const k=txtCiclo(c); vistos.set(k,[...(vistos.get(k)||[]),t])}
    if(vistos.size===1&&r.talhoes.length===[...vistos.values()][0].length) partes.push([...vistos.keys()][0]);
    else for(const [k,ts] of vistos) partes.push(`${ts.join(", ")}: ${k}`);
    if(partes.length) out.push({k:"Ciclo",v:partes.join(" · ")});
    if(r.tipo==="aplicacao"){
      const ants=r.talhoes.map(t=>{const c=ciclo(t,r.data); return registros.filter(x=>x.id!==r.id&&x.tipo==="aplicacao"&&exec(x)&&tem(x,t)&&x.data<=r.data&&(!c||x.data>=c.p.data)).sort((a,b)=>b.data.localeCompare(a.data))[0]}).filter(Boolean);
      if(ants.length){const d=Math.min(...ants.map(a=>dias(a.data,r.data))); out.push({k:"Desde a aplicação anterior",v:`${d} dia${d===1?"":"s"}`})}
    }
    if(r.tipo==="aplicacao"&&Number(r.campos?.carencia)>0) out.push({k:"Fim da carência",v:brDate(soma(r.data,Number(r.campos.carencia)))});
  }catch(e){console.error(e)}
  return out;
};

/* ---------- Painel: "Talhões hoje" ---------- */
let abrirEm=null;
function render(){
  const box=$("#ci-box"); if(!box) return;
  const hoje=todayISO(), ts=TALHOES.map(t=>t.n);
  const linhas=ts.map(t=>({t,c:ciclo(t,hoje)}));
  if(!linhas.some(x=>x.c)){box.hidden=true;return}
  box.hidden=false;
  box.innerHTML=`<div class="ci-top"><h3>Talhões hoje</h3><span class="note">DAP = dias após o plantio · DAE = após a emergência · DAA = após a aplicação</span></div>
    <div class="ci-lista">${linhas.map(({t,c})=>{
      const id=(typeof propCfg!=="undefined"?propCfg.talhoes.find(x=>x.n===t)?.id:null), mini=id&&window.mpMini?window.mpMini(id,40):"";
      if(!c) return `<div class="ci-t vazio">${mini?`<span class="ci-mini">${mini}</span>`:""}<div class="ci-c"><b>${esc(t)}</b><small>Sem plantio registrado</small></div></div>`;
      if(c.colheita) return `<div class="ci-t vazio">${mini?`<span class="ci-mini">${mini}</span>`:""}<div class="ci-c"><b>${esc(t)}</b><small>${esc(c.cultura||"Cultura")} colhida em ${brDate(c.colheita.data)} (${dias(c.colheita.data,hoje)} dias)</small></div></div>`;
      const a=ultimaAplic(t,hoje,c.p.data), car=a&&Number(a.campos?.carencia)>0?soma(a.data,Number(a.campos.carencia)):null;
      const ab=abrirEm===c.p.id+"|"+t;
      return `<div class="ci-t">${mini?`<span class="ci-mini">${mini}</span>`:""}<div class="ci-c">
          <div class="ci-l1"><b>${esc(t)}</b><span>${esc([c.cultura,c.cultivar].filter(Boolean).join(" · "))}</span></div>
          <div class="ci-nums">
            <span class="ci-n"><b>${c.dap}</b><small>DAP</small></span>
            ${c.dae!=null?`<span class="ci-n"><b>${c.dae}</b><small>DAE</small></span>`:c.emergencia?`<span class="ci-n"><b>–</b><small>emerge ${brDate(c.emergencia).slice(0,5)}</small></span>`:""}
            ${a?`<span class="ci-n"><b>${dias(a.data,hoje)}</b><small>DAA</small></span>`:""}
          </div>
          <small class="ci-sub">Plantio em ${brDate(c.p.data)}${c.emergencia?` · emergência em ${brDate(c.emergencia)}`:""}</small>
          ${a?`<small class="ci-sub">Última aplicação ${brDate(a.data)}${prods(a).length?`: ${esc(prods(a).join(" + "))}`:a.nome?`: ${esc(a.nome)}`:""}${car?` · <span class="${car>hoje?"ci-car":"ci-lib"}">${car>hoje?`carência até ${brDate(car)} (faltam ${dias(hoje,car)} dias)`:`carência terminou em ${brDate(car)}`}</span>`:""}</small>`:""}
          ${c.emergencia?"":ab?`<div class="ci-em"><input type="date" id="ci-em-d" value="${hoje}" max="${hoje}" min="${c.p.data}" aria-label="Data da emergência"><button type="button" class="btn fn-mini" data-ciok="${c.p.id}">Salvar</button><button type="button" class="link" data-cix>Cancelar</button></div>`
            :`<button type="button" class="link ci-bt" data-ciem="${c.p.id}|${esc(t)}">Informar emergência</button>`}
        </div></div>`}).join("")}</div>`;
  box.querySelectorAll("[data-ciem]").forEach(b=>b.onclick=()=>{abrirEm=b.dataset.ciem; render(); $("#ci-em-d")?.focus()});
  box.querySelectorAll("[data-cix]").forEach(b=>b.onclick=()=>{abrirEm=null; render()});
  box.querySelectorAll("[data-ciok]").forEach(b=>b.onclick=async()=>{
    const r=registros.find(x=>x.id===b.dataset.ciok), d=$("#ci-em-d").value; if(!r||!d) return;
    if(d<r.data){$("#ci-em-d").setCustomValidity("A emergência não pode ser antes do plantio."); $("#ci-em-d").reportValidity(); return}
    b.disabled=true; const {id,...doc}=r; doc.campos={...doc.campos,emergencia:d};
    try{await col.doc(id).set(doc); abrirEm=null}catch{b.disabled=false}
  });
}
const agenda=()=>{clearTimeout(agenda.t); agenda.t=setTimeout(()=>{try{render()}catch(e){console.error(e)}},120)};
const origLista=renderLista;
renderLista=function(){const r=origLista.apply(this,arguments); agenda(); return r};
document.addEventListener("visibilitychange",()=>{if(!document.hidden) agenda()});
agenda();
})();
