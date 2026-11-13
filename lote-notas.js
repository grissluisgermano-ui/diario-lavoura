/* Diário da Lavoura — notas antigas recebidas por e-mail, lançadas por mês.
   As notas pendentes com mais de 90 dias (window.nePendentesAntigas, danfe.js) aparecem em Estoque → Notas → "Notas antigas",
   agrupadas por ano e mês. "Lançar o mês" abre uma tela de conferência:
   - as notas do mês (dá para desmarcar; nota de entrada/cancelada vem desmarcada);
   - os produtos (um por descrição da nota): vai ou não para o estoque, nome no estoque, unidade, quantidade total;
   - Financeiro: conta a pagar por parcela, já paga no vencimento (as que vencem depois de hoje ficam em aberto).
   Lançar: soma as entradas por produto (um set por produto) e cria as contas (window.finLote, financeiro.js). */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const e=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const br=x=>Number(x||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const MES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const INSUMO=/SEMENTE|\bSTE\b|FERTIL|ADUBO|UREIA|URÉIA|\bKCL\b|CLORETO|SUPERFOS|\bSSP\b|\bTSP\b|\bMAP\b|\bNPK\b|\d{1,2}[-.]\d{1,2}[-.]\d{1,2}|CALC[AÁ]RIO|INOCUL|GESSO|FOSFAT|SULFATO DE AM|NITRATO|ÓLEO MINERAL|OLEO MINERAL|ADJUVANTE|ESPALHANTE/i;
let abertos=new Set(), lote=null;

const anoMes=d=>String(d.data||"").slice(0,7);
function nomeLimpo(desc){
  let t=String(desc||"").replace(/\s+-\s+.*$/,"").replace(/\s+\d+([.,]\d+)?\s*(L|LT|LTS|LITROS?|KG|KGS|G|GR|ML|TN|T)\b.*$/i,"")
    .replace(/\s+\b(GL|GAL|GALAO|BD|BB|BALDE|FR|FRASCO|SC|SACO|BAG|BIG ?BAG|CX|PCT|PCTE|EMB|TB|BOMBONA)\b.*$/i,"").trim();
  if(!t) t=String(desc||"").trim();
  return t.toLowerCase().replace(/(^|[\s/(-])([a-zà-ú])/g,(m,a,b)=>a+b.toUpperCase());
}
function classeDe(desc){const d=String(desc).toUpperCase();
  if(/SEMENTE|\bSTE\b/.test(d)) return "Semente"; if(/INOCUL/.test(d)) return "Inoculante"; if(/CALC[AÁ]RIO|GESSO/.test(d)) return "Corretivo";
  if(/FERTIL|ADUBO|UREIA|URÉIA|\bKCL\b|CLORETO|SUPERFOS|\bSSP\b|\bTSP\b|\bMAP\b|\bNPK\b|\d{1,2}[-.]\d{1,2}[-.]\d{1,2}|FOSFAT|SULFATO DE AM|NITRATO/.test(d)) return "Fertilizante";
  if(/ÓLEO MINERAL|OLEO MINERAL|ADJUVANTE|ESPALHANTE/.test(d)) return "Adjuvante / óleo";
  return "";
}

/* ---------- lista "Notas antigas" ---------- */
window.nePintarAntigas=function(){
  let box=$("#ne-ant");
  if(!box){const ign=$("#ne-ign"); if(!ign) return; box=document.createElement("section"); box.id="ne-ant"; box.className="ne-ant"; ign.before(box)}
  const ns=window.nePendentesAntigas?.()||[];
  if(!ns.length){box.hidden=true; box.innerHTML=""; return}
  box.hidden=false;
  const anos=new Map();
  for(const d of ns){const am=anoMes(d), y=am.slice(0,4); if(!anos.has(y)) anos.set(y,new Map()); const m=anos.get(y); if(!m.has(am)) m.set(am,[]); m.get(am).push(d)}
  box.innerHTML=`<div class="row" style="justify-content:space-between"><h3 class="sub-h">Notas antigas</h3><span class="note">${ns.length} para lançar</span></div>
    <p class="note">Notas com mais de 3 meses que chegaram por e-mail. Lance um mês de cada vez: o app mostra os produtos para conferir e lança no estoque e no Financeiro (como já pagas).</p>
    ${[...anos].sort((a,b)=>b[0].localeCompare(a[0])).map(([y,ms])=>{const qt=[...ms.values()].reduce((s,l)=>s+l.length,0), tot=[...ms.values()].flat().reduce((s,d)=>s+(Number(d.total)||0),0);
      return `<details class="nl-ano" data-nla="${y}" ${abertos.has(y)?"open":""}><summary><b>${y}</b><span class="note">${qt} nota${qt===1?"":"s"} · ${br(tot)}</span></summary>
        ${[...ms].sort((a,b)=>b[0].localeCompare(a[0])).map(([am,l])=>`<div class="nl-mes"><div><b>${MES[+am.slice(5)-1]}</b><small>${l.length} nota${l.length===1?"":"s"} · ${br(l.reduce((s,d)=>s+(Number(d.total)||0),0))} · ${e([...new Set(l.map(d=>d.emit||""))].filter(Boolean).slice(0,3).map(x=>x.split(" ").slice(0,2).join(" ")).join(", "))}</small></div>
          <button type="button" class="btn fn-mini" data-nlm="${am}">Lançar o mês</button></div>`).join("")}
      </details>`}).join("")}`;
  box.querySelectorAll("[data-nla]").forEach(d=>d.addEventListener("toggle",()=>{d.open?abertos.add(d.dataset.nla):abertos.delete(d.dataset.nla)}));
  box.querySelectorAll("[data-nlm]").forEach(b=>b.onclick=()=>abrirMes(b.dataset.nlm));
};

/* ---------- tela de conferência do mês ---------- */
const noEstoque=ch=>!!ch&&estoque.some(p=>(p.entradas||[]).some(x=>x.chave===ch));
function prepara(am,lista,titulo){
  const docs=(lista||(window.nePendentesAntigas?.()||[]).filter(d=>anoMes(d)===am)).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
  const notas=[], prods=new Map();
  for(const d of docs){
    let x=null, fin=null, tp="1";
    try{const doc=new DOMParser().parseFromString(d.xml,"application/xml"); x=lerXml(d.xml); fin=window.finDadosXml(doc); tp=doc.getElementsByTagNameNS("*","tpNF")[0]?.textContent?.trim()||"1"}catch{}
    if(!x||!fin){notas.push({d,erro:"não consegui ler o XML",ok:false});continue}
    // venda de grãos (fixação de preço) ou entrega no depósito: vai para Grãos/Financeiro (graos-nota.js), não para o estoque
    const vg=tp==="0"?window.vgLe?.(d.xml):null;
    if(vg&&(vg.tipo==="venda"||vg.tipo==="remessa")){const ja=window.vgJaLancada?.(vg);
      notas.push({d,x,fin,grao:vg,rm:vg.tipo==="remessa"?window.vgRomaneio?.(vg):null,ok:!d.cancelada&&!ja,aviso:d.cancelada?"nota cancelada":ja?"já lançada":"",itens:[],temSem:false,finJa:false}); continue}
    const temSem=x.itens.some(it=>/SEMENTE|\bSTE\b/i.test(it.descricao)||classeDe(it.descricao)==="Semente");
    const vgD=tp==="0"?window.vgLe?.(d.xml):null;
    const aviso=d.cancelada?"nota cancelada":vgD?.tipo==="devolucao"?`devolução de compra${vgD.refNF?` (ref. NF ${vgD.refNF})`:""}: acerte a quantidade na entrada da nota original no estoque`:tp==="0"?"nota de entrada emitida pelo fornecedor (ex.: compra de grãos)":noEstoque(fin.chave)?"já está no estoque":
      temSem?"tem semente: lance esta nota sozinha (embalagens)":window.finLote?.jaLancada(fin)&&!lista?"já está no Financeiro":"";
    const n={d,x,fin,ok:!aviso,aviso,itens:[],temSem,finJa:!!window.finLote?.jaLancada(fin),devol:vgD?.tipo==="devolucao"};
    for(const it of x.itens){
      const k=(it.descricao+"|"+it.unidade).toUpperCase();
      if(!prods.has(k)){
        const est=estoque.find(p=>it.descricao.toLowerCase().includes(p.comercial.toLowerCase()));
        const ag=window.agrofitBusca?.(it.descricao);
        const c=converteEmb(it.descricao,it.unidade,1);
        const cla=est?.classe||ag?.classe||classeDe(it.descricao);
        const peca=/^(PC|P[ÇC]A?S?|UN|UND|UNID|SV|SERV|JG|CJ|KIT|MT|M)$/i.test(String(it.unidade||"").trim())||/PARAFUSO|ROLAMENTO|FILTRO|CORREIA|RETENTOR|EMBOLO|ÊMBOLO|VEDA[CÇ]AO|MANGUEIRA|BICO|LAMPADA|PNEU|OLEO (LUBRIF|HIDRAUL|MOTOR)|GRAXA|DIESEL/i.test(it.descricao);
        prods.set(k,{k,desc:it.descricao,uCom:it.unidade,est:!!(est||ag||INSUMO.test(it.descricao)||!peca),
          nome:est?.comercial||(ag?nomeLimpo(ag.marca):nomeLimpo(it.descricao)),gen:est?.generico||ag?.generico||"",classe:cla,un:est?.unidade||(c.un==="un"&&ag?ag.unidade:c.un),q:0,v:0,n:0});
      }
      const p=prods.get(k); n.itens.push({k,it});
    }
    notas.push(n);
  }
  return {am,notas,prods,titulo};
}
function somaProds(){
  for(const p of lote.prods.values()){p.q=0;p.v=0;p.n=0}
  for(const n of lote.notas) if(n.ok) for(const {k,it} of n.itens){const p=lote.prods.get(k), c=converteEmb(it.descricao,it.unidade,it.quantidade); p.q+=c.un===p.un?c.q:it.quantidade; p.v+=it.valorTotal; p.n++}
}
function abrirMes(am,lista,titulo){
  lote=prepara(am,lista,titulo);
  let el=$("#nl-tela"); if(!el){el=document.createElement("div"); el.id="nl-tela"; el.className="ct-tela nl-tela"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); document.body.appendChild(el)}
  el.hidden=false; document.body.classList.add("ct-aberto"); render(); el.scrollTop=0;
}
function fechar(){const el=$("#nl-tela"); if(el) el.hidden=true; document.body.classList.remove("ct-aberto"); lote=null}
function render(){
  const el=$("#nl-tela"); if(!el||!lote) return;
  somaProds();
  const [y,m]=(lote.am||"0000-01").split("-"), tit=lote.titulo||`${MES[+m-1]} de ${y}`, sel=lote.notas.filter(n=>n.ok), usados=[...lote.prods.values()].filter(p=>p.n>0);
  const contas=window.finLote?.contas()||[], cp=window.finLote?.contaPadrao()||"";
  const novo=p=>!prodEstoque(p.nome);
  el.innerHTML=`<div class="ct-bar"><button type="button" class="btn ghost" id="nl-volta">‹ Voltar</button><span class="ct-bar-t">${e(tit)}</span></div>
  <div class="ct-corpo">
    <h2 class="nl-h">${lote.titulo?"Lançar "+e(tit.toLowerCase()):"Lançar notas de "+MES[+m-1]+" de "+y}</h2>
    <p class="note">Confira as notas e os produtos. Os que estiverem marcados em "Estoque" entram como compra na data da nota. Tudo vai também para o Financeiro.</p>
    <h3 class="sub-h">Notas (${sel.length} de ${lote.notas.length})</h3>
    <div class="nl-notas">${lote.notas.map((n,i)=>`<div class="nl-nota${n.ok?"":" off"}"><input type="checkbox" data-nln="${i}" id="nl-n${i}" ${n.ok?"checked":""} ${n.erro?"disabled":""} aria-label="Lançar a NF ${e(n.d.numero||"")}">
      <span class="nl-nt" data-for="nl-n${i}"><b>NF ${e(n.d.numero||"")} · ${e(n.fin?.emit||n.d.emit||"")}</b><small>${n.d.data?n.d.data.split("-").reverse().join("/"):""} · ${br(n.fin?.total||n.d.total)}${n.grao?"":` · ${n.itens.length} ite${n.itens.length===1?"m":"ns"}`}${n.grao?` · <span class="ne-grao">${e(window.vgResumo(n.grao))}</span>${n.grao.tipo==="remessa"?(n.rm?` · <span class="note">✓ romaneio de ${n.rm.data.split("-").reverse().join("/")}</span>`:` · <span class="falta">sem romaneio parecido na Colheita</span>`):""}`:""}${n.aviso||n.erro?` · <span class="falta">${e(n.aviso||n.erro)}</span>`:n.finJa?` · <span class="note">já no Financeiro: entra só no estoque</span>`:""}${n.fin?.retirada&&!n.devol?` · <span class="ne-ret">retirada do contrato ${e(n.fin.contrato)} — só estoque</span>`:""}</small></span>
      ${n.temSem&&!n.ok&&n.x?`<button type="button" class="link" data-nlsz="${i}">Lançar sozinha</button>`:""}${n.d.arquivo?`<button type="button" class="link" data-nldn="${i}">DANFE</button>`:`<button type="button" class="link" data-danfe="${e(n.d.id)}">DANFE</button>`}</div>`).join("")}</div>
    <h3 class="sub-h">Produtos (${usados.length})</h3>
    <p class="note">Desmarque "Estoque" no que não é insumo (peças, diesel, serviços…): esses vão só para o Financeiro. O nome é o que fica no estoque; produtos iguais com nomes diferentes podem ser juntados escrevendo o mesmo nome.</p>
    <div class="nl-prods">${usados.map(p=>`<div class="nl-prod${p.est?"":" off"}" data-nlp="${e(p.k)}">
      <label class="nl-est"><input type="checkbox" class="nl-pe" ${p.est?"checked":""}> Estoque</label>
      <div class="nl-pc"><small class="note">Na nota: ${e(p.desc)} · ${e(p.uCom)}${p.n>1?` · em ${p.n} notas`:""}</small>
        <div class="nl-pg"><input class="nl-pn" list="dl-estoque" value="${e(p.nome)}" aria-label="Nome no estoque">
          <select class="nl-pu" aria-label="Unidade" ${prodEstoque(p.nome)?"disabled":""}>${["L","kg","sc","un"].map(u=>`<option ${u===(prodEstoque(p.nome)?.unidade||p.un)?"selected":""}>${u}</option>`).join("")}</select>
          <span class="nl-pq mono">${num(p.q)} ${e(prodEstoque(p.nome)?.unidade||p.un)}</span><span class="nl-pv mono">${br(p.v)}</span></div>
        <small><span class="pill ${novo(p)?"prox":"ok"}">${novo(p)?"Produto novo":"Já no estoque"}</span>${p.gen?` <span class="note">${e(p.gen)}</span>`:""}${p.classe?` <span class="note">· ${e(p.classe)}</span>`:""}</small></div>
    </div>`).join("")}</div>
    ${lote.notas.some(n=>n.grao)?`<p class="vg-exp"><b>Notas de grãos:</b> as de <b>venda</b> (fixação de preço) tiram as sacas do saldo da Lavoura em Grãos e entram no Financeiro como receita já recebida na conta da cooperativa, com os descontos da nota (Senar, Funrural, retenção de capital). Venda já lançada à mão nos Grãos (mesmo dia ±5, mesmas sacas) é completada, não repetida. As de <b>entrega no depósito</b> (remessa) não mexem em saldo nem dinheiro: só ficam guardadas.</p>`:""}
    <h3 class="sub-h">Financeiro</h3>
    <label class="nf-chk"><input type="checkbox" id="nl-fin" checked> Lançar também no Financeiro (uma conta a pagar por parcela)</label>
    <div class="grid2" id="nl-fin-op">
      <div class="field"><label for="nl-sit">Situação</label><select id="nl-sit"><option value="pago">Já pagas na data do vencimento (o que vence depois de hoje fica em aberto)</option><option value="aberto">Em aberto</option></select></div>
      <div class="field"><label for="nl-conta">Conta</label><select id="nl-conta">${contas.map(c=>`<option value="${c.id}" ${c.id===cp?"selected":""}>${e(c.nome)}</option>`).join("")||`<option value="">Cadastre uma conta no Financeiro → Resumo</option>`}</select></div>
    </div>
    <p class="note">O saldo atual das contas não muda: o Financeiro só soma pagamentos a partir da data inicial de cada conta.</p>
    <div class="row"><button type="button" class="btn" id="nl-ok" ${sel.length?"":"disabled"}>Lançar ${sel.length} nota${sel.length===1?"":"s"}</button><span class="note" id="nl-st" role="status"></span></div>
  </div>`;
  $("#nl-volta").onclick=fechar;
  el.querySelectorAll("[data-nldn]").forEach(b=>b.onclick=()=>window.danfeAbrir?.(lote.notas[+b.dataset.nldn].d.xml));
  el.querySelectorAll("[data-nlsz]").forEach(b=>b.onclick=()=>{const n=lote.notas[+b.dataset.nlsz]; fechar(); window.nfImportarArquivo?.(new File([n.d.xml],`NFe${n.d.id}.xml`,{type:"text/xml"}))});
  el.querySelectorAll("[data-nln]").forEach(c=>c.onchange=()=>{lote.notas[+c.dataset.nln].ok=c.checked; render()});
  el.querySelectorAll(".nl-nt").forEach(t=>t.onclick=()=>{const c=document.getElementById(t.dataset.for); if(c&&!c.disabled){c.checked=!c.checked; c.onchange()}});
  el.querySelectorAll(".nl-prod").forEach(box=>{const p=lote.prods.get(box.dataset.nlp);
    box.querySelector(".nl-pe").onchange=ev=>{p.est=ev.target.checked; box.classList.toggle("off",!p.est)};
    box.querySelector(".nl-pn").onchange=ev=>{p.nome=ev.target.value.trim()||p.nome; const ex=prodEstoque(p.nome); if(ex){p.un=ex.unidade; p.gen=ex.generico||p.gen; p.classe=ex.classe||p.classe} render()};
    box.querySelector(".nl-pu").onchange=ev=>{p.un=ev.target.value; render()};
  });
  $("#nl-fin").onchange=()=>{$("#nl-fin-op").hidden=!$("#nl-fin").checked};
  $("#nl-sit").onchange=()=>{$("#nl-conta").closest(".field").hidden=$("#nl-sit").value!=="pago"};
  $("#nl-ok").onclick=lancar;
}
async function lancar(){
  const b=$("#nl-ok"), st=t=>$("#nl-st").textContent=t;
  if(!b.dataset.armed){b.dataset.armed="1"; b.textContent="Confirmar lançamento"; return}
  const fin=$("#nl-fin").checked, pago=$("#nl-sit").value==="pago", conta=$("#nl-conta").value;
  if(fin&&pago&&!conta&&lote.notas.some(n=>n.ok&&!n.grao)){st("Cadastre uma conta no Financeiro → Resumo primeiro."); return}
  for(const p of lote.prods.values()) if(p.est&&p.n&&!p.nome){st("Há produto sem nome."); return}
  b.disabled=true; $("#nl-volta").disabled=true;
  const notas=lote.notas.filter(n=>n.ok);
  try{
    // 1) estoque: junta as entradas de todas as notas por produto e grava cada produto uma vez
    const porProd=new Map();
    for(const n of notas){
      const daNota=new Map();
      for(const {k,it} of n.itens){const p=lote.prods.get(k); if(!p.est) continue;
        const key=p.nome.toLowerCase(), un=prodEstoque(p.nome)?.unidade||p.un, c=converteEmb(it.descricao,it.unidade,it.quantidade), q=c.un===un?c.q:it.quantidade;
        const g=daNota.get(key)||{p,q:0,v:0}; g.q+=q; g.v+=it.valorTotal; daNota.set(key,g)}
      for(const [key,g] of daNota){
        const ent={data:n.d.data,quantidade:+g.q.toFixed(3),valorTotal:g.v>0?+g.v.toFixed(2):null,origem:n.fin.emit,nf:n.fin.numero,chave:n.fin.chave}; if(n.fin.contrato) ent.contrato=n.fin.contrato; if(n.fin.retirada) ent.retirada=true;
        const P=porProd.get(key)||{p:g.p,ents:[]}; P.ents.push(ent); porProd.set(key,P)}
    }
    let i=0;
    for(const [key,{p,ents}] of porProd){
      const ex=prodEstoque(p.nome);
      if(ex){const {id,...doc}=ex; const ja=new Set((ex.entradas||[]).map(x=>x.chave).filter(Boolean)); doc.entradas=[...(ex.entradas||[]),...ents.filter(x=>!ja.has(x.chave))];
        if(p.gen&&!ex.generico) doc.generico=p.gen; if(p.classe&&!ex.classe) doc.classe=p.classe; await db.collection("estoque").doc(id).set(doc)}
      else await db.collection("estoque").add({comercial:p.nome,generico:p.gen||"",classe:p.classe||"",unidade:p.un,entradas:ents,criadoEm:new Date().toISOString()});
      st(`Estoque: ${++i} de ${porProd.size} produtos…`);
    }
    // XML de notas vindas de arquivo fica guardado (DANFE e "Refazer pela nota")
    for(const n of notas) if(n.d.arquivo&&n.fin.chave&&!n.grao) try{await db.collection("nfe").doc(n.fin.chave).set({xml:n.d.xml,numero:n.fin.numero,emit:n.fin.emit,data:n.fin.data,criadoEm:new Date().toISOString()})}catch{}
    // 2) Financeiro: contas a pagar de cada nota
    let nf=0;
    // notas de grãos (venda / entrega no depósito)
    let ng=0, nr=0;
    for(const n of notas.filter(n=>n.grao)){
      if(n.grao.tipo==="venda"){await window.vgLancar(n.grao,{recebido:true,conta:window.vgContaPadrao?.(n.grao.local)||"",xml:n.d.xml}); ng++}
      else{await window.vgGuardar(n.grao,n.d.xml); nr++}
      st(`Grãos: ${ng+nr} de ${notas.filter(n=>n.grao).length} notas…`);
    }
    if(fin){ for(const n of notas){ if(n.fin.retirada||n.grao) continue; // retirada do contrato: já paga; grãos: já feito acima
      const itens=n.itens.map(({k,it})=>{const p=lote.prods.get(k); return {nome:p.est?p.nome:it.descricao,classe:p.est?p.classe:classeDe(it.descricao),v:it.valorTotal}});
      await window.finLote.lancarNota(n.fin,{pago,conta,itens}); st(`Financeiro: ${++nf} de ${notas.length} notas…`) }
      if(pago) window.finLote.lembraConta(conta) }
    const el=$("#nl-tela .ct-corpo");
    el.innerHTML=`<h2 class="nl-h">Pronto</h2><p class="toast">${notas.length} nota${notas.length===1?"":"s"} lançada${notas.length===1?"":"s"}: ${[porProd.size?`${porProd.size} produto${porProd.size===1?"":"s"} no estoque`:"",fin&&nf?`${nf} no Financeiro`:"",ng?`${ng} venda${ng===1?"":"s"} de grãos`:"",nr?`${nr} entrega${nr===1?"":"s"} no depósito guardada${nr===1?"":"s"}`:""].filter(Boolean).join(" · ")}${notas.some(n=>n.fin.retirada)?` (${notas.filter(n=>n.fin.retirada).length} de retirada de contrato: só no estoque)`:""}.</p>
      <div class="row"><button type="button" class="btn" id="nl-fim">Voltar às notas</button></div>`;
    $("#nl-volta").disabled=false; $("#nl-fim").onclick=fechar;
  }catch(err){
    st(`Parei no meio (${err?.code==="quota_exceeded"?"limite do banco de dados":"erro ao gravar"}). Feche e abra o mês de novo: o que já entrou não é lançado duas vezes.`);
    $("#nl-volta").disabled=false;
  }
}
document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&lote) fechar()});
/* vários XML escolhidos de uma vez (Estoque → Entrada → Escolher XML): mesma conferência, para notas de qualquer data */
window.loteArquivos=async function(files){
  const docs=[], canc=new Set(), vistas=new Set(); let ruins=0;
  for(const f of files){
    let t=""; try{t=await f.text()}catch{ruins++; continue}
    if(/<procEventoNFe|<evento\b/i.test(t)&&/<tpEvento>110111</.test(t)){const m=t.match(/<chNFe>(\d{44})</); if(m) canc.add(m[1]); continue}
    let fin=null; try{fin=window.finDadosXml(new DOMParser().parseFromString(t,"application/xml"))}catch{}
    if(!fin||!fin.chave){ruins++; continue}
    if(vistas.has(fin.chave)) continue; vistas.add(fin.chave);
    docs.push({id:fin.chave,xml:t,numero:fin.numero,data:fin.data,emit:fin.emit,total:fin.total,arquivo:f.name});
  }
  for(const d of docs) if(canc.has(d.id)) d.cancelada=true;
  if(!docs.length){window.ponte?.aviso?.("Nenhum XML de NF-e nos arquivos escolhidos."); return}
  const ds=docs.map(d=>d.data).filter(Boolean).sort(), dt=x=>x?x.split("-").reverse().join("/"):"";
  abrirMes(null,docs,`${docs.length} nota${docs.length>1?"s":""} escolhida${docs.length>1?"s":""}${ds.length?` (${dt(ds[0])}${ds.length>1&&ds[0]!==ds[ds.length-1]?" a "+dt(ds[ds.length-1]):""})`:""}`);
  if(ruins) window.ponte?.aviso?.(`${ruins} arquivo${ruins>1?"s":""} não ${ruins>1?"eram":"era"} XML de NF-e e ficou de fora.`);
};
})();
