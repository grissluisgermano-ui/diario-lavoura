/* Diário da Lavoura — contratos de entrega futura (venda com preço fixado).
   Coleção contratos_entrega {comprador, numero, cultura, safra (ano de início, ex. 2026 = 26/27), sacas, preco, data, precoMercado,
                              vencimento, finalidade, obs, criadoEm}
   Cada entrega é um movimento "venda" em graos com contratoId (sai do saldo e vira conta a receber no Financeiro pelo valor do contrato).
   Só vale grão colhido na safra do contrato: o app mostra quanto a Lavoura colheu naquela safra no local e avisa se passar. */
(function(){
"use strict";
let lista=[], edit=null, abreEnt=null, iniciou=false;
const hoje=()=>todayISO();
const dias=(a,b)=>Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/864e5);
const entregas=c=>graos.filter(g=>g.contratoId===c.id&&g.tipo==="venda");
const entregue=c=>entregas(c).reduce((s,g)=>s+(Number(g.sacas)||0),0);
const nomeCtr=c=>`${c.comprador}${c.numero?" nº "+c.numero:""}`;
/* Lavoura: colhido na safra num local (parte da Lavoura dos romaneios) e já entregue em contratos dessa safra/cultura/local */
function colhidoSafra(cultura,safra,local){
  let s=0; const cu=normCult(cultura), lo=String(local||"").toLowerCase();
  for(const m of grMovs()) if(m.tipo==="romaneio"&&m.cultura===cu&&safraDe(m.data)===safra&&String(m.local||"").toLowerCase()===lo) s+=m.sacas*(divisaoDe(m).lavoura/100);
  return s;
}
function jaEntregueSafra(cultura,safra,local,semId){
  const cu=normCult(cultura), lo=String(local||"").toLowerCase();
  return graos.filter(g=>g.contratoId&&g.id!==semId&&normCult(g.cultura)===cu&&String(g.local||"").toLowerCase()===lo&&lista.find(c=>c.id===g.contratoId)?.safra===safra).reduce((s,g)=>s+(Number(g.sacas)||0),0);
}

function render(){
  const box=$("#ce-lista"); if(!box) return;
  const h=hoje();
  const ord=[...lista].sort((a,b)=>{const fa=a.sacas-entregue(a)>0.01, fb=b.sacas-entregue(b)>0.01; return (fb-fa)||String(a.vencimento).localeCompare(String(b.vencimento))});
  const alerta=lista.filter(c=>c.sacas-entregue(c)>0.01&&c.vencimento&&dias(h,c.vencimento)<=30).length;
  window.marca?.("graos:ctr",alerta);
  // resumo por cultura/safra
  const R={}; for(const c of lista){const k=`${c.cultura} ${safraLab(c.safra)}`; const x=R[k]||={sacas:0,ent:0,valor:0}; x.sacas+=c.sacas; x.ent+=entregue(c); x.valor+=c.sacas*c.preco}
  $("#ce-resumo").innerHTML=Object.entries(R).map(([k,x])=>`<div class="ce-r"><b>${esc(k)}</b><span>${num(x.sacas)} sc contratadas · ${num(x.ent)} entregues · <b>faltam ${num(Math.max(0,x.sacas-x.ent))}</b></span><small>${brl(x.valor)} no total</small></div>`).join("");
  box.innerHTML=ord.length?ord.map(c=>{
    const ent=entregue(c), falta=Math.max(0,c.sacas-ent), pct=c.sacas>0?Math.min(100,ent/c.sacas*100):0, fim=falta<=0.01;
    const dv=c.vencimento?dias(h,c.vencimento):null, venc=!fim&&dv!=null&&dv<0, perto=!fim&&dv!=null&&dv>=0&&dv<=30;
    const ganho=c.precoMercado>0?(c.preco-c.precoMercado)*c.sacas:null;
    const col=colhidoSafra(c.cultura,c.safra,c.comprador), usado=jaEntregueSafra(c.cultura,c.safra,c.comprador), livre=Math.max(0,col-usado);
    const es=entregas(c).sort((a,b)=>b.data.localeCompare(a.data));
    return `<article class="ce${fim?" fim":venc?" venc":perto?" perto":""}">
      <div class="rec-top"><b class="ce-tit">${esc(nomeCtr(c))}</b><span class="pill ${fim?"ok":venc?"venc":perto?"prox":""}">${fim?"Entregue":c.vencimento?(venc?"Venceu "+brDate(c.vencimento):"Entrega até "+brDate(c.vencimento)):"Sem prazo"}</span></div>
      <div class="ce-l2">${esc(c.cultura)} ${safraLab(c.safra)} · <b>${num(c.sacas)} sc</b> a <b>${brl(c.preco)}</b>/sc = ${brl(c.sacas*c.preco)}</div>
      <div class="ce-bar" role="img" aria-label="${num(pct)}% entregue"><i style="width:${pct}%"></i></div>
      <div class="ce-nums"><span>Entregue <b>${num(ent)} sc</b> (${brl(ent*c.preco)})</span><span>Falta <b>${num(falta)} sc</b>${falta>0?` (${brl(falta*c.preco)})`:""}</span>${!fim&&dv!=null&&dv>=0?`<span>${dv} dias para o vencimento</span>`:""}</div>
      ${ganho!=null?`<div class="ce-g ${ganho>=0?"pos":"neg"}">Mercado no dia da fixação: ${brl(c.precoMercado)}/sc → ${ganho>=0?"ganho":"diferença"} de ${brl(Math.abs(ganho))} com o contrato</div>`:""}
      ${c.finalidade||c.obs?`<p class="rec-desc">${esc([c.finalidade,c.obs].filter(Boolean).join(" · "))}</p>`:""}
      ${!fim?`<small class="note">Colhido na safra ${safraLab(c.safra)} em ${esc(c.comprador)} (parte da Lavoura): ${num(col)} sc · já usado em contratos: ${num(usado)} sc · disponível ${num(livre)} sc</small>`:""}
      ${es.length?`<details class="fn-det"><summary>${es.length} entrega${es.length>1?"s":""}</summary>${es.map(g=>`<div class="fn-it"><span>${brDate(g.data)} · ${num(g.sacas)} sc</span><span class="mono">${g.valorTotal?brl(g.valorTotal):""}</span></div>`).join("")}</details>`:""}
      ${abreEnt===c.id?formEntrega(c,falta,livre):""}
      <div class="rec-actions">${!fim&&abreEnt!==c.id?`<button type="button" class="btn fn-mini" data-ceent="${c.id}">Registrar entrega</button>`:""}<button type="button" class="link" data-ceed="${c.id}">Editar</button><button type="button" class="link danger" data-cedel="${c.id}">Excluir</button></div>
    </article>`}).join(""):`<div class="empty">Nenhum contrato de entrega cadastrado.</div>`;
  box.querySelectorAll("[data-ceent]").forEach(b=>b.onclick=()=>{abreEnt=b.dataset.ceent; render(); $("#ce-e-sc")?.focus()});
  box.querySelectorAll("[data-ceed]").forEach(b=>b.onclick=()=>editar(b.dataset.ceed));
  box.querySelectorAll("[data-cedel]").forEach(b=>b.onclick=()=>{const c=lista.find(x=>x.id===b.dataset.cedel); confirmar(b,entregue(c)>0?"Excluir? (as entregas ficam como vendas)":"Confirmar exclusão",()=>db.collection("contratos_entrega").doc(c.id).delete())});
  const fe=$("#ce-ent"); if(fe) ligaEntrega(lista.find(c=>c.id===abreEnt));
}
function formEntrega(c,falta,livre){
  const sug=Math.min(falta,livre>0?livre:falta);
  return `<div class="ce-ent fn-baixa" id="ce-ent">
    <b>Entrega do contrato</b>
    <div class="grid2">
      <div class="field"><label for="ce-e-d">Data</label><input type="date" id="ce-e-d" value="${hoje()}"></div>
      <div class="field"><label for="ce-e-sc">Sacas entregues</label><input id="ce-e-sc" inputmode="decimal" value="${String(+sug.toFixed(2)).replace(".",",")}"></div>
      <div class="field"><label for="ce-e-l">Saiu do depósito</label><input id="ce-e-l" list="dl-dep" value="${esc(c.comprador)}"></div>
      <div class="field"><label>Valor (R$)</label><input id="ce-e-v" disabled></div>
    </div>
    <p class="note" id="ce-e-av"></p>
    <div class="row"><button type="button" class="btn fn-mini" id="ce-e-ok">Confirmar entrega</button><button type="button" class="link" id="ce-e-x">Cancelar</button><span class="toast" id="ce-e-st"></span></div>
  </div>`;
}
function ligaEntrega(c){
  if(!c) return;
  const atual=()=>{const sc=horNum($("#ce-e-sc").value)||0, l=$("#ce-e-l").value.trim(); $("#ce-e-v").value=sc>0?brl(sc*c.preco):"";
    const col=colhidoSafra(c.cultura,c.safra,l), us=jaEntregueSafra(c.cultura,c.safra,l), liv=col-us, falta=c.sacas-entregue(c);
    $("#ce-e-av").innerHTML=[sc>falta+0.01?`<span class="falta">Passa ${num(sc-falta)} sc do que falta no contrato.</span>`:"",
      sc>liv+0.01?`<span class="falta">Só ${num(Math.max(0,liv))} sc colhidas na safra ${safraLab(c.safra)} em ${esc(l||"—")} estão livres (o contrato só aceita grão desta safra). Confira o local ou os romaneios.</span>`:"",
      `Sai do saldo da Lavoura em ${esc(l||"—")} e vira conta a receber no Financeiro.`].filter(Boolean).join(" ")};
  ["#ce-e-sc","#ce-e-l"].forEach(s=>$(s).addEventListener("input",atual)); atual();
  $("#ce-e-x").onclick=()=>{abreEnt=null; render()};
  $("#ce-e-ok").onclick=async()=>{
    const sc=horNum($("#ce-e-sc").value), l=$("#ce-e-l").value.trim(), d=$("#ce-e-d").value||hoje();
    if(!(sc>0)){$("#ce-e-st").textContent="Informe as sacas."; return} if(!l){$("#ce-e-st").textContent="Informe o depósito."; return}
    $("#ce-e-ok").disabled=true;
    try{await db.collection("graos").add({tipo:"venda",titular:"lavoura",data:d,cultura:normCult(c.cultura),local:l,sacas:sc,valorTotal:+(sc*c.preco).toFixed(2),
        contrato:nomeCtr(c),contratoId:c.id,obs:`Entrega do contrato de entrega futura (${num(c.sacas)} sc a ${brl(c.preco)})`,criadoEm:new Date().toISOString()});
      abreEnt=null; render(); flash(`Entrega de ${num(sc)} sc lançada.`)}
    catch{$("#ce-e-st").textContent="Não foi possível salvar."; $("#ce-e-ok").disabled=false}
  };
}
function flash(m){const t=$("#ce-toast"); if(!t) return; t.textContent=m; clearTimeout(flash.t); flash.t=setTimeout(()=>t.textContent="",4000)}

/* ---------- formulário do contrato ---------- */
function reset(){
  edit=null; $("#ce-form").reset(); $("#ce-f-tit").textContent="Novo contrato de entrega"; $("#ce-salvar").textContent="Salvar contrato"; $("#ce-cancel").hidden=true;
  $("#ce-data").value=hoje(); safras(safraDe(hoje())); $("#ce-total").textContent="";
}
function safras(sel){const y=safraDe(hoje()); $("#ce-safra").innerHTML=[y-1,y,y+1,y+2].map(s=>`<option value="${s}"${s===sel?" selected":""}>${safraLab(s)}</option>`).join("")}
function total(){const sc=horNum($("#ce-sacas").value), p=parseNum($("#ce-preco").value), m=parseNum($("#ce-merc").value);
  $("#ce-total").textContent=sc>0&&p>0?`Total do contrato: ${brl(sc*p)}${m>0?` · ${p>=m?"ganho":"diferença"} de ${brl(Math.abs((p-m)*sc))} sobre o mercado`:""}`:""}
function editar(id){
  const c=lista.find(x=>x.id===id); if(!c) return;
  reset(); edit=id; $("#ce-mais").open=true;
  $("#ce-comp").value=c.comprador||""; $("#ce-num").value=c.numero||""; $("#ce-cult").value=c.cultura||""; safras(c.safra);
  $("#ce-sacas").value=String(c.sacas).replace(".",","); $("#ce-preco").value=String(c.preco).replace(".",","); $("#ce-merc").value=c.precoMercado?String(c.precoMercado).replace(".",","):"";
  $("#ce-data").value=c.data||""; $("#ce-venc").value=c.vencimento||""; $("#ce-fin").value=c.finalidade||""; $("#ce-obs").value=c.obs||"";
  $("#ce-f-tit").textContent="Editar contrato"; $("#ce-salvar").textContent="Salvar alterações"; $("#ce-cancel").hidden=false; total();
  $("#ce-form").scrollIntoView({block:"start",behavior:"smooth"});
}
$("#ce-form").addEventListener("submit",async ev=>{
  ev.preventDefault(); if(!db){flash("Sem conexão com o banco de dados.");return}
  const comprador=$("#ce-comp").value.trim(), cultura=$("#ce-cult").value.trim(), sacas=horNum($("#ce-sacas").value), preco=parseNum($("#ce-preco").value);
  if(!comprador){flash("Informe a cooperativa / comprador.");$("#ce-comp").focus();return}
  if(!cultura){flash("Informe a cultura.");$("#ce-cult").focus();return}
  if(!(sacas>0)){flash("Informe as sacas do contrato.");$("#ce-sacas").focus();return}
  if(!(preco>0)){flash("Informe o preço fixado por saca.");$("#ce-preco").focus();return}
  const m=parseNum($("#ce-merc").value), old=edit?lista.find(x=>x.id===edit):null;
  const body={comprador,numero:$("#ce-num").value.trim(),cultura:normCult(cultura),safra:+$("#ce-safra").value,sacas,preco,precoMercado:m>0?m:null,
    data:$("#ce-data").value||hoje(),vencimento:$("#ce-venc").value||null,finalidade:$("#ce-fin").value.trim(),obs:$("#ce-obs").value.trim(),criadoEm:old?.criadoEm||new Date().toISOString()};
  $("#ce-salvar").disabled=true;
  try{ if(edit){await db.collection("contratos_entrega").doc(edit).set(body); for(const g of entregas(old)){const {id,...d}=g; if(d.contrato!==nomeCtr(body)) await db.collection("graos").doc(id).set({...d,contrato:nomeCtr(body)})}}
       else await db.collection("contratos_entrega").add(body);
       const era=!!edit; reset(); $("#ce-mais").open=false; flash(era?"Contrato atualizado.":"Contrato salvo.") }
  catch{flash("Não foi possível salvar. Tente de novo.")} finally{$("#ce-salvar").disabled=false}
});
$("#ce-cancel").onclick=()=>{reset(); $("#ce-mais").open=false};
["#ce-sacas","#ce-preco","#ce-merc"].forEach(s=>$(s).addEventListener("input",total));

/* ---------- ligações ---------- */
window.ceColecao=()=>lista.map(c=>({...c}));
window.cePlanilha=(add,dt)=>add("Contratos de entrega",lista.map(c=>{const e=entregue(c); return {"Comprador":c.comprador,"Nº":c.numero||"","Cultura":c.cultura,"Safra":safraLab(c.safra),"Sacas":c.sacas,"Preço (R$/sc)":c.preco,"Total (R$)":+(c.sacas*c.preco).toFixed(2),"Mercado no dia (R$/sc)":c.precoMercado||"","Data":dt(c.data),"Entrega até":dt(c.vencimento),"Entregue (sc)":+e.toFixed(2),"Falta (sc)":+Math.max(0,c.sacas-e).toFixed(2),"Finalidade":c.finalidade||"","Observação":c.obs||""}}));
window.ceTexto=()=>lista.length?"\n\nContratos de entrega futura (comprador | cultura safra | sacas | preço fixado | entregue | falta | entrega até | finalidade):\n"+lista.map(c=>{const e=entregue(c); return `${nomeCtr(c)} | ${c.cultura} ${safraLab(c.safra)} | ${num(c.sacas)} sc | ${brl(c.preco)}/sc | ${num(e)} sc | ${num(Math.max(0,c.sacas-e))} sc | ${c.vencimento?brDate(c.vencimento):"-"} | ${c.finalidade||"-"}`}).join("\n")+"\nSó grão colhido na safra do contrato pode ser entregue.":"";
const agenda=()=>{clearTimeout(agenda.t); agenda.t=setTimeout(()=>{try{render()}catch(e){console.error(e)}},100)};
const origG=renderGraos; renderGraos=function(){const r=origG.apply(this,arguments); agenda(); return r};
window.ceInicia=function(){
  if(iniciou||!db) return; iniciou=true;
  db.collection("contratos_entrega").onSnapshot(s=>{lista=s.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.comprador&&c.sacas>0); agenda()},()=>{});
};
reset(); render();
if(typeof col!=="undefined"&&col) window.ceInicia();
})();
