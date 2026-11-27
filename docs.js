/* Diário da Lavoura — Documentos (v120): receitas, planejamentos de aplicação, recomendações e outros papéis da lavoura.
   Coleção documentos {titulo, tipo, cultura, safra (ano de início), talhoes:[nomes], data, obs, anexos:[{id,nome,tipo,mime,tam,em}], criadoEm}
   Tela Painel → Documentos (view "documentos"): "+ Guardar documento" (formulário com anxCampo), busca sem acento e filtros
   (tipo, cultura, safra), lista por safra. Os papéis dos contratos (config/financeiro.contratos[n].anexos) também aparecem
   aqui (só leitura, "Abrir o contrato"). Na tela do talhão (ciclo.js) aparece "Documentos da cultura" (window.docBloco). */
(function(){
"use strict";
const TIPOS_DOC={planej:"Planejamento de aplicações",receita:"Receita agronômica",recom:"Recomendação / manejo da cultura",solo:"Análise de solo",laudo:"Laudo / análise",mapa:"Mapa / croqui",contrato:"Contrato / pedido",outro:"Outro"};
let lista=[], edit=null, anx=null, iniciou=false, q="", fTipo="", fCult="", fSafra="", talSel=new Set();
const norm=x=>String(x||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const culturas=()=>((typeof propCfg!=="undefined"&&propCfg.culturas)||["Soja","Milho","Feijão","Trigo","Cevada","Aveia"]);
const talhoesN=()=>(typeof TALHOES!=="undefined"?TALHOES.map(t=>t.n):[]);
const y0=()=>safraDe(todayISO());
const safrasOpts=()=>{const y=y0(), s=new Set([y+1,y,y-1,y-2,y-3]); for(const d of lista) if(d.safra) s.add(d.safra); return [...s].sort((a,b)=>b-a)};
const F=()=>window.finApi;

/* papéis dos contratos, como documentos só de leitura */
function docsContratos(){
  const cs=F()?.contratosCfg?.()||{}, out=[];
  for(const [k,c] of Object.entries(cs)){ if(!c||!(c.anexos||[]).length) continue;
    const cc=F().cultSafra?F().cultSafra(c):{cultura:c.cultura||"",safra:null};
    out.push({id:"ctr|"+k,ctr:k,titulo:`${F().ctrTxt(k)}${c.fornecedor?" · "+c.fornecedor:""}`,tipo:"contrato",cultura:cc.cultura||"",safra:cc.safra||null,talhoes:[],data:c.criado?String(c.criado).slice(0,10):"",obs:c.obs||"",anexos:c.anexos})}
  return out;
}
const todos=()=>[...lista,...docsContratos()];
const ctrTxt=c=>c?(F()?.ctrTxt?F().ctrTxt(c):c):"";
const ctrN=c=>F()?.ctrN?F().ctrN(c):String(c||"").replace(/\D/g,"");
const txtBusca=d=>norm([d.titulo,ctrTxt(d.contrato),TIPOS_DOC[d.tipo]||"",d.cultura,d.safra?safraLab(d.safra):"",(d.talhoes||[]).join(" "),d.obs,...(d.anexos||[]).map(a=>a.nome)].join(" "));
function filtrados(){
  const ws=norm(q).split(/\s+/).filter(Boolean);
  return todos().filter(d=>(!fTipo||d.tipo===fTipo)&&(!fCult||norm(d.cultura)===norm(fCult))&&(!fSafra||String(d.safra||"")===fSafra)&&(!ws.length||ws.every(w=>txtBusca(d).includes(w))));
}
const linhaSub=d=>[TIPOS_DOC[d.tipo]||"",d.contrato&&!d.ctr?ctrTxt(d.contrato):"",[d.cultura,d.safra?safraLab(d.safra):""].filter(Boolean).join(" "),(d.talhoes||[]).length?(d.talhoes.length>2?`${d.talhoes.length} talhões`:d.talhoes.join(", ")):"",d.data?brDate(d.data):""].filter(Boolean).join(" · ");
const cartao=(d,o={})=>`<article class="dc-it" data-dc="${esc(d.id)}">
  <div class="dc-top"><b>${esc(d.titulo)}</b><span class="dc-n">${(d.anexos||[]).length?`📎 ${(d.anexos||[]).length}`:""}</span></div>
  <small class="dc-sub">${esc(linhaSub(d))}</small>
  ${d.obs?`<p class="dc-obs">${esc(d.obs)}</p>`:""}
  <div class="dc-anx">${window.anxLinks?window.anxLinks(d.anexos||[],"Foto"):""}</div>
  ${o.semAcoes?"":`<div class="rec-actions">${d.ctr?`<button type="button" class="link" data-dcctr="${esc(d.ctr)}">📄 Abrir o contrato</button>`:`${d.contrato?`<button type="button" class="link" data-dcctr="${esc(d.contrato)}">📄 Abrir o contrato</button>`:""}<button type="button" class="link" data-dced="${esc(d.id)}">Editar</button><button type="button" class="link danger" data-dcdel="${esc(d.id)}">Excluir</button>`}</div>`}
</article>`;

function render(){
  const box=$("#dc-box"); if(!box) return;
  if(!box.dataset.pronto){ box.dataset.pronto=1;
    box.innerHTML=`<details class="sub dc-form" id="dc-mais"><summary><b id="dc-f-tit">+ Guardar documento</b></summary>
      <form id="dc-form" autocomplete="off">
        <div class="field"><label for="dc-tit">Nome do documento</label><input id="dc-tit" required placeholder="Ex.: Planejamento de aplicações da soja"></div>
        <div class="grid2"><div class="field"><label for="dc-tipo">Tipo</label><select id="dc-tipo">${Object.entries(TIPOS_DOC).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></div>
          <div class="field"><label for="dc-data">Data do documento</label><input id="dc-data" type="date"></div>
          <div class="field"><label for="dc-cult">Cultura</label><select id="dc-cult"></select></div>
          <div class="field"><label for="dc-safra">Safra</label><select id="dc-safra"></select></div></div>
        <div class="field"><label for="dc-ctr">Contrato ou pedido <small class="note">(opcional — o documento aparece também no contrato)</small></label><select id="dc-ctr"></select></div>
        <div class="field"><label>Talhões <small class="note">(opcional — nenhum = vale para a propriedade toda)</small></label><div class="dc-tal" id="dc-tal"></div></div>
        <div class="field"><label for="dc-obs">Observação</label><textarea id="dc-obs" rows="2" placeholder="Ex.: feito pelo agrônomo, versão de novembro"></textarea></div>
        <div class="field"><label>Arquivos (foto do papel, PDF, planilha…)</label><div id="dc-anx"></div></div>
        <div class="row"><button class="btn" type="submit" id="dc-salvar">Guardar documento</button><button type="button" class="link" id="dc-cancel" hidden>Cancelar edição</button><span class="toast" id="dc-st" role="status"></span></div>
      </form></details>
      <div class="dc-filtros"><input type="search" id="dc-q" placeholder="Buscar: soja, receita, agrônomo…" aria-label="Buscar nos documentos">
        <select id="dc-ft" aria-label="Tipo"></select><select id="dc-fc" aria-label="Cultura"></select><select id="dc-fs" aria-label="Safra"></select></div>
      <p class="note" id="dc-cont"></p>
      <div id="dc-lista" class="dc-lista"></div>`;
    anx=window.anxCampo?window.anxCampo($("#dc-anx"),{rotulo:"Anexar foto, PDF ou arquivo",accept:"image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"}):null;
    $("#dc-form").addEventListener("submit",salvar);
    // escolheu o contrato: completa cultura e safra do cadastro do contrato (se estiverem vazias)
    $("#dc-ctr").addEventListener("change",()=>{const k=$("#dc-ctr").value; if(!k) return; const c=F()?.contratoCfg?.(k); const cs=c&&F().cultSafra?F().cultSafra(c):null;
      if(cs?.cultura&&!$("#dc-cult").value){if(![...$("#dc-cult").options].some(o=>o.value===cs.cultura)) $("#dc-cult").add(new Option(cs.cultura,cs.cultura)); $("#dc-cult").value=cs.cultura}
      if(cs?.safra){if(![...$("#dc-safra").options].some(o=>o.value===String(cs.safra))) $("#dc-safra").add(new Option(safraLab(cs.safra),String(cs.safra))); $("#dc-safra").value=String(cs.safra)}
      if(!$("#dc-tipo").dataset.mexido) $("#dc-tipo").value="contrato"});
    $("#dc-tipo").addEventListener("change",()=>{$("#dc-tipo").dataset.mexido=1});
    $("#dc-cancel").onclick=reset;
    $("#dc-q").addEventListener("input",e=>{q=e.target.value; lista_()});
    for(const [id,set] of [["#dc-ft",v=>fTipo=v],["#dc-fc",v=>fCult=v],["#dc-fs",v=>fSafra=v]]) $(id).onchange=e=>{set(e.target.value); lista_()};
    $("#dc-tal").addEventListener("click",e=>{const b=e.target.closest("[data-t]"); if(!b) return; const t=b.dataset.t; talSel.has(t)?talSel.delete(t):talSel.add(t); b.setAttribute("aria-pressed",talSel.has(t))});
    box.dataset.novo=1;
  }
  // selects que dependem das configurações e da lista
  const cs=culturas(), ss=safrasOpts();
  const keepSel=(id,html)=>{const el=$(id), v=el.value; el.innerHTML=html; if([...el.options].some(o=>o.value===v)) el.value=v};
  keepSel("#dc-cult",`<option value="">Todas / nenhuma</option>${cs.map(c=>`<option>${esc(c)}</option>`).join("")}`);
  keepSel("#dc-safra",`<option value="">—</option>${ss.map(y=>`<option value="${y}">${safraLab(y)}</option>`).join("")}`);
  ctrOpts();
  keepSel("#dc-ft",`<option value="">Todos os tipos</option>${Object.entries(TIPOS_DOC).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}`);
  keepSel("#dc-fc",`<option value="">Todas as culturas</option>${[...new Set([...cs,...todos().map(d=>d.cultura).filter(Boolean)])].map(c=>`<option>${esc(c)}</option>`).join("")}`);
  keepSel("#dc-fs",`<option value="">Todas as safras</option>${ss.map(y=>`<option value="${y}">${safraLab(y)}</option>`).join("")}`);
  if(box.dataset.novo){delete box.dataset.novo; reset()}
  pintaTal();
  lista_();
}
// lista de contratos e pedidos (Financeiro, cadastro e estoque); guarda o escolhido
function ctrOpts(extra){
  const el=$("#dc-ctr"); if(!el) return; const v=extra!=null?extra:el.value;
  const ls=(window.ctrLista?window.ctrLista():Object.keys(F()?.contratosCfg?.()||{}).map(k=>({k:ctrN(k),txt:k,pessoa:""})));
  const ops=ls.map(c=>({v:c.txt,l:ctrTxt(c.txt)+(c.pessoa?" · "+c.pessoa:"")}));
  if(v&&!ops.some(o=>ctrN(o.v)===ctrN(v))) ops.unshift({v,l:ctrTxt(v)});
  el.innerHTML=`<option value="">Nenhum</option>`+ops.map(o=>`<option value="${esc(o.v)}">${esc(o.l)}</option>`).join("");
  const m=ops.find(o=>ctrN(o.v)===ctrN(v)); el.value=m?m.v:"";
}
function pintaTal(){const el=$("#dc-tal"); if(!el) return; el.innerHTML=talhoesN().map(t=>`<button type="button" class="chip" data-t="${esc(t)}" aria-pressed="${talSel.has(t)}">${esc(t)}</button>`).join("")||`<span class="note">Nenhum talhão cadastrado.</span>`}
function lista_(){
  const box=$("#dc-lista"); if(!box) return;
  const fs=filtrados(), tot=todos().length;
  $("#dc-cont").textContent=tot?(fs.length===tot?`${tot} documento${tot===1?"":"s"}`:`${fs.length} de ${tot} documentos`):"";
  if(!fs.length){box.innerHTML=`<div class="empty">${tot?"Nenhum documento com essa busca.":"Nenhum documento guardado ainda. Toque em \"+ Guardar documento\", tire a foto do papel (ou escolha o PDF) e diga a cultura e a safra."}</div>`; return}
  const G=new Map(); for(const d of fs.sort((a,b)=>(b.safra||0)-(a.safra||0)||String(a.cultura).localeCompare(String(b.cultura),"pt-BR")||String(b.data).localeCompare(String(a.data)))){const k=d.safra?`Safra ${safraLab(d.safra)}`:"Sem safra"; if(!G.has(k)) G.set(k,[]); G.get(k).push(d)}
  box.innerHTML=[...G].map(([k,ds])=>`<h3 class="sub-h dc-g">${esc(k)} <small>${ds.length}</small></h3>${ds.map(d=>cartao(d)).join("")}`).join("");
  liga(box);
}
function liga(root){
  root.querySelectorAll("[data-dced]").forEach(b=>b.onclick=()=>editar(b.dataset.dced));
  root.querySelectorAll("[data-dcctr]").forEach(b=>b.onclick=()=>{document.getElementById("ct-tela")&&window.ciFecha?.(); window.ctrRelatorio?.(b.dataset.dcctr)});
  root.querySelectorAll("[data-dcdel]").forEach(b=>b.onclick=async()=>{
    if(!b.dataset.conf){b.dataset.conf=1; b.textContent="Confirmar exclusão"; setTimeout(()=>{delete b.dataset.conf; b.textContent="Excluir"},4000); return}
    try{await db.collection("documentos").doc(b.dataset.dcdel).delete(); window.ponte?.aviso?.("Documento excluído (fica 30 dias na Lixeira).",true)}catch(e){console.error(e)}});
}
function reset(){
  edit=null; talSel=new Set();
  $("#dc-form").reset(); $("#dc-data").value=todayISO(); $("#dc-safra").value=String(y0()); $("#dc-ctr").value=""; delete $("#dc-tipo").dataset.mexido; anx?.limpar();
  $("#dc-f-tit").textContent="+ Guardar documento"; $("#dc-salvar").textContent="Guardar documento"; $("#dc-cancel").hidden=true; pintaTal();
}
function editar(id){
  const d=lista.find(x=>x.id===id); if(!d) return;
  if(window.show) window.show("documentos");
  edit=id; talSel=new Set(d.talhoes||[]);
  $("#dc-tit").value=d.titulo||""; $("#dc-tipo").value=d.tipo||"outro"; $("#dc-data").value=d.data||""; $("#dc-cult").value=d.cultura||""; $("#dc-safra").value=d.safra?String(d.safra):""; $("#dc-obs").value=d.obs||""; ctrOpts(d.contrato); $("#dc-ctr").value=d.contrato||""; anx?.set(d.anexos||[]);
  $("#dc-f-tit").textContent="Editar documento"; $("#dc-salvar").textContent="Salvar alterações"; $("#dc-cancel").hidden=false; pintaTal();
  const m=$("#dc-mais"); m.open=true; m.scrollIntoView({behavior:"smooth",block:"start"});
}
async function salvar(e){
  e.preventDefault();
  const st=$("#dc-st"), titulo=$("#dc-tit").value.trim(), anexos=anx?.get()||[], obs=$("#dc-obs").value.trim();
  if(!titulo){$("#dc-tit").focus(); return}
  if(anx?.ocupado()){st.textContent="Espere terminar de enviar o arquivo…"; return}
  if(!anexos.length&&!obs){st.textContent="Anexe a foto ou o arquivo do documento (ou escreva uma observação)."; return}
  const doc={titulo,tipo:$("#dc-tipo").value,data:$("#dc-data").value||"",cultura:$("#dc-cult").value||"",safra:$("#dc-safra").value?Number($("#dc-safra").value):null,talhoes:talhoesN().filter(t=>talSel.has(t)),obs,anexos,contrato:$("#dc-ctr").value||""};
  const b=$("#dc-salvar"); b.disabled=true;
  try{
    if(edit){const {id:_i,...ant}=lista.find(x=>x.id===edit)||{}; await db.collection("documentos").doc(edit).set({...ant,...doc,criadoEm:ant.criadoEm||new Date().toISOString()})}
    else await db.collection("documentos").add({...doc,criadoEm:new Date().toISOString()});
    const era=!!edit; reset(); $("#dc-mais").open=false; st.textContent=""; window.ponte?.aviso?.(era?"Documento atualizado.":"Documento guardado.",true);
  }catch(err){st.textContent="Não consegui guardar: "+(err?.message||err)} finally{b.disabled=false}
}

/* ---------- tela do talhão: documentos da cultura/safra que está no talhão ---------- */
window.docBloco=function(t,cs){
  const vale=d=>(!(d.talhoes||[]).length||(d.talhoes||[]).includes(t))&&(cs||[]).some(x=>(!d.cultura||norm(d.cultura)===norm(x.cultura))&&(!d.safra||!x.safra||d.safra===x.safra))&&(d.cultura||(d.talhoes||[]).includes(t));
  const ds=todos().filter(vale); if(!ds.length) return "";
  return `<details class="rot-box dc-ct"><summary>📎 Documentos da cultura (${ds.length})</summary><div class="dc-lista">${ds.map(d=>cartao(d,{semAcoes:true})).join("")}</div><p class="note"><button type="button" class="link" data-dcver="1">Ver todos os documentos</button></p></details>`;
};
document.addEventListener("click",e=>{if(e.target.closest("[data-dcver]")){window.ciFecha?.(); window.show?.("documentos")}});

/* documentos de uma lavoura (relatório "Resultado da lavoura"): mesma cultura, safra entre as que a lavoura ocupou (ou sem safra),
   e talhões em comum (ou sem talhão) */
window.docDaLavoura=(cultura,safras,talhoes)=>{const S=new Set(safras||[]), T=new Set(talhoes||[]);
  return todos().filter(d=>d.cultura&&norm(d.cultura)===norm(cultura)&&(!d.safra||S.has(d.safra))&&(!(d.talhoes||[]).length||d.talhoes.some(t=>T.has(t))))
    .sort((a,b)=>(a.tipo==="contrato")-(b.tipo==="contrato")||String(a.data).localeCompare(String(b.data)))};
window.docTipoNome=k=>TIPOS_DOC[k]||k||"";
// documentos (da tela Documentos) ligados a um contrato ou pedido
window.docDoContrato=k=>{const n=ctrN(k); return n?lista.filter(d=>d.contrato&&ctrN(d.contrato)===n):[]};
// abre "+ Guardar documento" já ligado a um contrato
window.docNovo=o=>{window.show?.("documentos"); setTimeout(()=>{reset(); if(o?.contrato){ctrOpts(o.contrato); $("#dc-ctr").value=[...$("#dc-ctr").options].find(x=>ctrN(x.value)===ctrN(o.contrato))?.value||""; $("#dc-ctr").dispatchEvent(new Event("change"))} const m=$("#dc-mais"); m.open=true; m.scrollIntoView({behavior:"smooth",block:"start"}); setTimeout(()=>$("#dc-tit").focus(),300)},150)};

/* ---------- backup, planilha, Perguntar ---------- */
window.docColecao=()=>lista.map(d=>({...d}));
window.docPlanilha=add=>add("Documentos",todos().map(d=>({"Documento":d.titulo,"Tipo":TIPOS_DOC[d.tipo]||d.tipo||"","Cultura":d.cultura||"","Safra":d.safra?safraLab(d.safra):"","Talhões":(d.talhoes||[]).join(", "),"Contrato/pedido":d.contrato?ctrTxt(d.contrato):"","Data":d.data?brDate(d.data):"","Arquivos":(d.anexos||[]).map(a=>a.nome).join("; "),"Observação":d.obs||""})));
window.docTexto=()=>{const ds=todos(); return ds.length?"\n\nDocumentos guardados (documento | tipo | cultura safra | talhões | arquivos | obs):\n"+ds.map(d=>[d.titulo,TIPOS_DOC[d.tipo]||"",[d.cultura,d.safra?safraLab(d.safra):""].filter(Boolean).join(" "),(d.talhoes||[]).join(", "),(d.anexos||[]).map(a=>a.nome).join("; "),d.obs].map(x=>x||"-").join(" | ")).join("\n"):""};

window.docInicia=function(){
  if(iniciou||typeof db==="undefined"||!db) return; iniciou=true;
  db.collection("documentos").onSnapshot(s=>{lista=s.docs.map(x=>({id:x.id,...x.data()})).filter(d=>d.titulo); try{render()}catch(e){console.error(e)}; window.ciAgenda?.()},()=>{});
};
(function tenta(n){try{window.docInicia()}catch(e){} if(!iniciou&&n<120) setTimeout(()=>tenta(n+1),500)})(0);
// abrir a tela redesenha (culturas/talhões podem ter mudado); contratos mudam no Financeiro
const orig=window.show;
if(orig) window.show=show=function(view){const r=orig.apply(this,arguments); if(view==="documentos") try{render()}catch(e){console.error(e)} return r};
})();
