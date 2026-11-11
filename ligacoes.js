/* Diário da Lavoura — ligações entre as partes do app (ligacoes.js).
   Excluir uma coisa pergunta o que fazer com o que está ligado a ela:
     conta do Financeiro ↔ produtos da nota no Estoque (finId = grupo|id, mesma chave, mesma NF+fornecedor, origem est|…)
     abastecimento / manutenção / serviço de benfeitoria / venda de grãos ↔ conta do Financeiro (origem ds|id, mq|id, bf|id, gr|id)
     pagamento com grãos (conta.quitGraos.grId ↔ graos.finId), máquina → manutenções, benfeitoria → serviços.
   Tudo o que sai junto vai para a Lixeira com o mesmo "lote" e volta junto ao recuperar.
   "Conferir ligações" (Financeiro → Resumo, #lg-box): mostra o que ficou desencontrado (coisa excluída de um lado só,
   valor diferente entre o Diário e a conta) com o botão para acertar. Logo depois de uma alteração feita aqui, a
   diferença nova já abre a pergunta. "Deixar assim" fica guardado em config/ligacoes {ign:[]}. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const e_=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const R$=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const nB=v=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:2});
const br=iso=>{const [y,m,d]=String(iso||"").slice(0,10).split("-"); return d?`${d}/${m}/${y}`:""};
const F=()=>window.finLig, CONTAS=()=>F()?.lanc()||[];
const G=n=>{try{return eval(n)}catch{return []}}; // listas do index.html (let globais)
const EST=()=>G("estoque"), DS=()=>G("diesel"), MQ=()=>G("manut"), SV=()=>G("bfServ"), GR=()=>G("graos"), REG=()=>G("registros");
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const valConta=l=>Number(l.valor)||0;
const nomeConta=l=>`${l.descricao||"Conta"}${l.parcela?` (parcela ${l.parcela})`:""}`;

/* ---------- quem está ligado a quem ---------- */
const nfL=s=>String(s||"").replace(/^0+/,"");
function ligaCE(l,x){ // conta l ↔ entrada do estoque x
  if(!l||!x||l.natureza!=="pagar") return false;
  if(x.finId&&(x.finId===l.id||(l.grupo&&x.finId===l.grupo))) return true;
  if(l.chave&&x.chave&&x.chave===l.chave) return true;
  const f=F(); if(!f) return false;
  if(l.nf&&x.nf&&f.nfKey(x.nf,x.origem)===f.nfKey(l.nf,l.pessoa)) return true;
  if(/^est\|/.test(l.origem||"")&&l.origem===`est|${f.norm(x.origem)}|${x.nf?nfL(x.nf):x.data}`) return true;
  return false;
}
function parcelasDe(contas){ // junta as outras parcelas da mesma nota
  const out=new Map(contas.map(c=>[c.id,c]));
  for(const c of contas) for(const o of CONTAS()) if(!out.has(o.id)&&((c.grupo&&o.grupo===c.grupo)||(c.chave&&o.chave===c.chave)||(/^est\|/.test(c.origem||"")&&o.origem===c.origem))) out.set(o.id,o);
  return [...out.values()];
}
function entradasDe(contas){
  const out=[];
  for(const e of EST()) (e.entradas||[]).forEach((x,i)=>{if(contas.some(c=>ligaCE(c,x))) out.push({e,i,x})});
  return out;
}
const ORIG={ds:{col:"diesel",nome:"abastecimento",a:"o",ex:"excluído",lista:DS,val:d=>Number(d.valorTotal)||0,txt:d=>`Abastecimento de ${nB(d.litros)} L em ${br(d.data)}`},
  mq:{col:"manutencoes",nome:"manutenção",a:"a",ex:"excluída",lista:MQ,val:x=>Number(x.custoTotal)||0,txt:x=>`Manutenção — ${typeof nomeMaq==="function"?nomeMaq(x.maquinaId):""} em ${br(x.data)}`},
  bf:{col:"servicos_benf",nome:"serviço da benfeitoria",a:"o",ex:"excluído",lista:SV,val:x=>Number(x.custoTotal)||0,txt:x=>`Serviço — ${typeof nomeBf==="function"?nomeBf(x.benfId):""} em ${br(x.data)}`},
  gr:{col:"graos",nome:"venda de grãos",a:"a",ex:"excluída",lista:GR,val:m=>Number(m.valorTotal)||0,txt:m=>`Venda de ${nB(m.sacas)} sc de ${m.cultura||""} em ${br(m.data)}`}};
const origemDe=l=>{const m=/^(ds|mq|bf|gr)\|(.+)$/.exec(l.origem||""); return m?{k:m[1],id:m[2],o:ORIG[m[1]]}:null};
const contasDaOrigem=k=>CONTAS().filter(l=>l.origem===k);
const usado=e=>REG().some(r=>(r.campos?.produtos||[]).some(p=>p.produtoId===e.id||String(p.nome||"").toLowerCase()===String(e.comercial||"").toLowerCase()));
const entTxt=({e,x})=>`${e.comercial} — ${typeof ehEmb==="function"&&ehEmb(e)&&typeof embRot==="function"&&x.emb?`${nB(x.quantidade)} × ${embRot(x.emb,x.quantidade)}`:`${nB(x.quantidade)} ${e.unidade||""}`}${Number(x.valorTotal)>0?" · "+R$(x.valorTotal):""}`;

/* ---------- ações (tudo que sai junto ganha o mesmo lote na Lixeira) ---------- */
async function emLote(fn){ const p=window.ponte; const lote=rid(); if(p) p.lote=lote; try{ await fn(lote) } finally { if(p&&p.lote===lote) p.lote=null } }
async function tirarEntradas(lista){ // [{e,i}] → tira do estoque; produto vazio e sem uso é apagado
  const porProd=new Map(); for(const t of lista){const a=porProd.get(t.e.id)||{e:t.e,is:new Set()}; a.is.add(t.i); porProd.set(t.e.id,a)}
  for(const {e,is} of porProd.values()){
    const {id,...doc}=e, fora=(e.entradas||[]).filter((_,k)=>is.has(k));
    doc.entradas=(e.entradas||[]).filter((_,k)=>!is.has(k));
    if(!doc.entradas.length&&!usado(e)) await db.collection("estoque").doc(id).delete();
    else { await window.ponte?.lixeira?.guardar?.({colecao:"estoque",docId:id,dados:{...doc,entradas:e.entradas||[]},entradas:fora}); await db.collection("estoque").doc(id).set(doc) }
  }
}
async function soltarEntradas(lista){ // a conta saiu, os produtos ficam: voltam a aparecer como compra pendente no Resumo
  const porProd=new Map(); for(const t of lista){const a=porProd.get(t.e.id)||{e:t.e,is:new Set()}; a.is.add(t.i); porProd.set(t.e.id,a)}
  for(const {e,is} of porProd.values()){
    if(!(e.entradas||[]).some((x,k)=>is.has(k)&&(x.doFinanceiro||x.finId))) continue;
    const {id,...doc}=e; doc.entradas=(e.entradas||[]).map((x,k)=>{if(!is.has(k)) return x; const {doFinanceiro,finId,...y}=x; return y});
    await db.collection("estoque").doc(id).set(doc);
  }
}
async function excluirContas(cs){
  for(const l of cs){
    if(l.quitGraos?.grId) await db.collection("graos").doc(l.quitGraos.grId).delete().catch(()=>{});
    await db.collection("fin_lanc").doc(l.id).delete();
  }
}
async function desligarConta(l){ const {id,...d}=l; delete d.origem; await db.collection("fin_lanc").doc(id).set(d) }

/* ---------- janela de pergunta ---------- */
let modal=null;
function janela({titulo,html,botoes,check}){
  if(!modal){
    modal=document.createElement("div"); modal.id="lg-modal"; modal.className="lg-modal"; modal.hidden=true;
    modal.innerHTML=`<div class="lg-jan" role="dialog" aria-modal="true" aria-labelledby="lg-tit"><div class="lg-top"><h3 id="lg-tit"></h3><button type="button" class="lg-x" aria-label="Fechar">✕</button></div><div class="lg-corpo"></div><div class="lg-bts"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",ev=>{if(ev.target===modal||ev.target.closest(".lg-x")) fecha()});
    document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&!modal.hidden) fecha()});
  }
  modal.querySelector("#lg-tit").textContent=titulo;
  modal.querySelector(".lg-corpo").innerHTML=html+(check?`<label class="lg-chk"><input type="checkbox" id="lg-chk" ${check.on?"checked":""}> <span>${check.l}</span></label>`:"");
  const B=modal.querySelector(".lg-bts");
  B.innerHTML=botoes.map((b,i)=>`<button type="button" class="btn ${b.cls||"ghost"} lg-bt" data-i="${i}"><b>${b.l}</b>${b.sub?`<small>${b.sub}</small>`:""}</button>`).join("")+`<button type="button" class="link lg-cancela">Cancelar</button>`;
  B.querySelector(".lg-cancela").onclick=fecha;
  B.querySelectorAll(".lg-bt").forEach(bt=>bt.onclick=async()=>{
    const b=botoes[+bt.dataset.i], chk=!!modal.querySelector("#lg-chk")?.checked;
    B.querySelectorAll("button").forEach(x=>x.disabled=true); bt.querySelector("b").textContent="Aguarde…";
    try{ await b.fn(chk); fecha(); if(b.ok) window.ponte?.aviso?.(b.ok,true) }
    catch(err){ console.warn(err); B.querySelectorAll("button").forEach(x=>x.disabled=false); bt.querySelector("b").textContent="Falhou, tente de novo" }
  });
  modal.hidden=false; document.body.classList.add("lg-aberto");
  setTimeout(()=>modal.querySelector(".lg-x")?.focus(),30);
}
function fecha(){ if(modal){modal.hidden=true; document.body.classList.remove("lg-aberto")} }
const lista=(itens,max=8)=>`<ul class="lg-lista">${itens.slice(0,max).map(t=>`<li>${t}</li>`).join("")}${itens.length>max?`<li>… e mais ${itens.length-max}</li>`:""}</ul>`;
const avisoNeg=ents=>{ // produtos que já foram usados e ficariam com saldo negativo
  const porProd=new Map(); for(const t of ents){const a=porProd.get(t.e.id)||{e:t.e,is:new Set()}; a.is.add(t.i); porProd.set(t.e.id,a)}
  const neg=[]; for(const {e,is} of porProd.values()){ try{ const r=resumoProd({...e,entradas:(e.entradas||[]).filter((_,k)=>!is.has(k))}); if(r.saldo<-1e-6) neg.push(`<b>${e_(e.comercial)}</b> já foi usado em atividades: o saldo vai ficar negativo`) }catch{} }
  return neg.length?`<p class="lg-atn">⚠️ ${neg.join("<br>⚠️ ")}.</p>`:"";
};
const avisoPago=cs=>{const p=cs.filter(c=>c.status==="pago"&&c.contaId); return p.length?`<p class="lg-atn">${p.length===1?"A conta já foi paga":`${p.length} já foram pagas`}: se excluir, o saldo do banco/caixa muda em ${R$(p.reduce((t,c)=>t+(Number(c.valorPago??c.valor)||0),0))}.</p>`:""};

/* ---------- excluir: cada caminho ---------- */
function delConta(id,b,fn){
  const l=CONTAS().find(x=>x.id===id); if(!l) return confirmar(b,"Confirmar exclusão",fn);
  const todas=parcelasDe([l]), ents=l.natureza==="pagar"?entradasDe(todas):[], og=origemDe(l), src=og?og.o.lista().find(x=>x.id===og.id):null;
  const grMov=l.quitGraos?.grId?GR().find(m=>m.id===l.quitGraos.grId):null;
  if(!ents.length&&!src&&todas.length<2&&!grMov) return confirmar(b,"Confirmar exclusão",fn);
  let html=`<p><b>${e_(nomeConta(l))}</b> · ${R$(valConta(l))}${l.status==="pago"?" · paga":""}</p>`;
  const bts=[];
  if(todas.length>1) html+=`<p>Esta nota tem <b>${todas.length} parcelas</b> no Financeiro (${R$(todas.reduce((t,c)=>t+valConta(c),0))}).</p>`;
  if(ents.length) html+=`<p>Os produtos desta nota estão no <b>Estoque</b>:</p>`+lista(ents.map(t=>e_(entTxt(t))))+avisoNeg(ents);
  if(grMov) html+=`<p>Foi paga com grãos: o movimento de ${nB(grMov.sacas)} sc de ${e_(grMov.cultura)} também sai de Grãos.</p>`;
  if(ents.length){
    bts.push({l:todas.length>1?`Excluir a nota inteira`:`Excluir a conta e os produtos do estoque`,sub:`${todas.length>1?todas.length+" parcelas + ":""}${ents.length} entrada${ents.length>1?"s":""} do estoque`,cls:"danger",
      ok:"Excluído do Financeiro e do Estoque. Fica 30 dias na Lixeira.",fn:()=>emLote(async()=>{await excluirContas(todas); await tirarEntradas(ents)})});
    if(todas.length>1) bts.push({l:"Só esta parcela",sub:"as outras parcelas e o estoque continuam",fn:()=>emLote(()=>excluirContas([l]))});
    bts.push({l:todas.length>1?"Só as contas (todas as parcelas)":"Só a conta",sub:"os produtos continuam no estoque e a compra volta a aparecer nas pendências do Resumo",
      ok:"Conta excluída. Os produtos continuam no estoque.",fn:()=>emLote(async()=>{await excluirContas(todas); await soltarEntradas(ents)})});
  }else if(src){
    html+=`<p>Esta conta veio do Diário: <b>${e_(og.o.txt(src))}</b>${og.o.val(src)?" · "+R$(og.o.val(src)):""}.</p>`;
    bts.push({l:`Excluir a conta e ${og.o.a} ${og.o.nome}`,sub:"sai do Financeiro e do Diário",cls:"danger",ok:"Excluído do Financeiro e do Diário. Fica 30 dias na Lixeira.",
      fn:()=>emLote(async()=>{await excluirContas(todas); await db.collection(og.o.col).doc(og.id).delete()})});
    bts.push({l:"Só a conta",sub:`${og.o.a} ${og.o.nome} continua e volta a aparecer nas pendências do Resumo`,fn:()=>emLote(()=>excluirContas(todas))});
  }else{
    if(todas.length>1){
      bts.push({l:"Excluir todas as parcelas",sub:`${todas.length} parcelas`,cls:"danger",fn:()=>emLote(()=>excluirContas(todas))});
      bts.push({l:"Só esta parcela",fn:()=>emLote(()=>excluirContas([l]))});
    }else bts.push({l:"Excluir a conta",cls:"danger",fn:()=>emLote(()=>excluirContas([l]))});
  }
  html+=avisoPago(todas);
  janela({titulo:"Excluir conta",html,botoes:bts});
}
function delEntrada({id,i},b,fn){
  const e=EST().find(x=>x.id===id), x=e?.entradas?.[+i]; if(!x) return confirmar(b,"Confirmar",fn);
  const contas=parcelasDe(CONTAS().filter(c=>ligaCE(c,x)));
  if(!contas.length) return confirmar(b,"Confirmar",fn);
  const ents=entradasDe(contas), esta={e,i:+i,x}, outras=ents.filter(t=>!(t.e.id===id&&t.i===+i));
  let html=`<p><b>${e_(entTxt(esta))}</b>${x.nf?` · NF ${e_(x.nf)}`:""}</p><p>Esta entrada está no <b>Financeiro</b>:</p>`+lista(contas.map(c=>`${e_(nomeConta(c))} · ${R$(valConta(c))}${c.status==="pago"?" · paga":""}`));
  const bts=[];
  if(outras.length){
    html+=`<p>A mesma nota tem mais ${outras.length} produto${outras.length>1?"s":""} no estoque:</p>`+lista(outras.map(t=>e_(entTxt(t))))+avisoNeg(ents);
    bts.push({l:"Excluir a nota inteira",sub:`${ents.length} entradas do estoque + ${contas.length>1?contas.length+" parcelas":"a conta"} do Financeiro`,cls:"danger",
      ok:"Nota excluída do Estoque e do Financeiro. Fica 30 dias na Lixeira.",fn:()=>emLote(async()=>{await tirarEntradas(ents); await excluirContas(contas)})});
    bts.push({l:"Só esta entrada",sub:"a conta continua: confira o valor dela no Financeiro",ok:"Entrada excluída. Confira o valor da conta no Financeiro.",fn:()=>emLote(()=>tirarEntradas([esta]))});
  }else{
    html+=avisoNeg([esta]);
    bts.push({l:`Excluir a entrada e ${contas.length>1?"as "+contas.length+" parcelas":"a conta"}`,sub:"sai do Estoque e do Financeiro",cls:"danger",
      ok:"Excluído do Estoque e do Financeiro. Fica 30 dias na Lixeira.",fn:()=>emLote(async()=>{await tirarEntradas([esta]); await excluirContas(contas)})});
    bts.push({l:"Só a entrada do estoque",sub:"a conta continua no Financeiro",fn:()=>emLote(()=>tirarEntradas([esta]))});
  }
  html+=avisoPago(contas);
  janela({titulo:"Excluir entrada do estoque",html,botoes:bts});
}
function delProduto(id,b,fn){
  const e=EST().find(x=>x.id===id); if(!e) return confirmar(b,"Confirmar exclusão",fn);
  const minhas=(e.entradas||[]).map((x,i)=>({e,i,x}));
  const contas=parcelasDe(CONTAS().filter(c=>minhas.some(t=>ligaCE(c,t.x))));
  const uso=usado(e);
  if(!contas.length&&!uso) return confirmar(b,"Confirmar exclusão",fn);
  // conta que só tem este produto pode sair junto; conta com outros produtos fica
  const so=contas.filter(c=>entradasDe(parcelasDe([c])).every(t=>t.e.id===id)), mistas=contas.filter(c=>!so.includes(c));
  let html=`<p><b>${e_(e.comercial)}</b> · ${minhas.length} entrada${minhas.length===1?"":"s"}</p>`;
  if(uso) html+=`<p class="lg-atn">⚠️ Este produto aparece em atividades lançadas. Elas continuam, mas sem o produto no estoque (sem baixa e sem custo atualizado).</p>`;
  if(so.length) html+=`<p>Contas do Financeiro só deste produto:</p>`+lista(so.map(c=>`${e_(nomeConta(c))} · ${R$(valConta(c))}${c.status==="pago"?" · paga":""}`));
  if(mistas.length) html+=`<p>Contas com este e outros produtos (continuam; confira o valor):</p>`+lista(mistas.map(c=>`${e_(nomeConta(c))} · ${R$(valConta(c))}`));
  const bts=[];
  if(so.length) bts.push({l:"Excluir o produto e as contas dele",sub:`${so.length} conta${so.length>1?"s":""} do Financeiro`,cls:"danger",ok:"Produto e contas excluídos. Ficam 30 dias na Lixeira.",
    fn:()=>emLote(async()=>{await db.collection("estoque").doc(id).delete(); await excluirContas(so)})});
  bts.push({l:so.length?"Só o produto":"Excluir o produto",sub:so.length?"as contas continuam no Financeiro":"",cls:so.length?"ghost":"danger",fn:()=>emLote(()=>db.collection("estoque").doc(id).delete())});
  html+=avisoPago(so);
  janela({titulo:"Excluir produto do estoque",html,botoes:bts});
}
function delOrigem(k,col,id,b,fn){
  const o=ORIG[k], src=o.lista().find(x=>x.id===id), cs=contasDaOrigem(k+"|"+id);
  const grConta=k==="gr"&&src?.finId?CONTAS().find(l=>l.id===src.finId):null;
  if(!cs.length&&!grConta) return confirmar(b,"Confirmar exclusão",fn);
  let html=`<p><b>${e_(src?o.txt(src):o.nome)}</b>${src&&o.val(src)?" · "+R$(o.val(src)):""}</p>`; const bts=[];
  if(cs.length){
    html+=`<p>Está no <b>Financeiro</b>:</p>`+lista(cs.map(c=>`${e_(nomeConta(c))} · ${R$(valConta(c))}${c.status==="pago"?" · paga":" · em aberto"}`))+avisoPago(cs);
    bts.push({l:`Excluir ${o.a} ${o.nome} e ${cs.length>1?"as contas":"a conta"}`,sub:"sai do Diário e do Financeiro",cls:"danger",ok:"Excluído do Diário e do Financeiro. Fica 30 dias na Lixeira.",
      fn:()=>emLote(async()=>{await fn(); await excluirContas(cs)})});
    bts.push({l:`Só ${o.a} ${o.nome}`,sub:"a conta continua no Financeiro (fica sem ligação)",fn:()=>emLote(async()=>{await fn(); for(const c of cs) await desligarConta(c)})});
  }
  if(grConta){
    html+=`<p>Este movimento é o <b>pagamento com grãos</b> da conta “${e_(nomeConta(grConta))}” (${R$(valConta(grConta))}).</p>`;
    const aberta=async()=>{const {id:cid,...d}=grConta; delete d.quitGraos; delete d.pagoEm; delete d.contaId; delete d.valorPago; d.status="aberto"; await db.collection("fin_lanc").doc(cid).set(d)};
    const so=async()=>{const {id:cid,...d}=grConta; if(d.quitGraos){d.quitGraos={...d.quitGraos}; delete d.quitGraos.grId} await db.collection("fin_lanc").doc(cid).set(d)};
    bts.push({l:"Excluir e voltar a conta para em aberto",cls:"danger",fn:()=>emLote(async()=>{await fn(); await aberta()})});
    bts.push({l:"Só o movimento",sub:"a conta continua paga com grãos",fn:()=>emLote(async()=>{await fn(); await so()})});
  }
  janela({titulo:`Excluir ${o.nome}`,html,botoes:bts});
}
function delMaquina(id,b,fn,benf){
  const filhos=benf?SV().filter(x=>x.benfId===id):MQ().filter(x=>x.maquinaId===id), k=benf?"bf":"mq", col=benf?"servicos_benf":"manutencoes";
  if(!filhos.length) return confirmar(b,"Confirmar exclusão",fn);
  const art=benf?(filhos.length>1?"os":"o"):(filhos.length>1?"as":"a"), cs=filhos.flatMap(x=>contasDaOrigem(k+"|"+x.id)), nome=benf?(filhos.length>1?"serviços":"serviço"):(filhos.length>1?"manutenções":"manutenção");
  const html=`<p>${benf?"Esta benfeitoria":"Esta máquina"} tem <b>${filhos.length} ${nome}</b> lançad${benf?"o":"a"}${filhos.length>1?"s":""} (${R$(filhos.reduce((t,x)=>t+(Number(x.custoTotal)||0),0))}).</p>`+
    (cs.length?`<p>${cs.length} conta${cs.length>1?"s":""} no Financeiro (${R$(cs.reduce((t,c)=>t+valConta(c),0))}).</p>`:"");
  const bts=[{l:`Excluir ${benf?"a benfeitoria":"a máquina"} e ${art} ${nome}`,sub:"tudo vai para a Lixeira junto",cls:"danger",ok:"Excluído. Fica 30 dias na Lixeira.",
      fn:async chk=>emLote(async()=>{await fn(); for(const x of filhos) await db.collection(col).doc(x.id).delete(); if(chk) await excluirContas(cs); else for(const c of cs) await desligarConta(c)})},
    {l:`Só ${benf?"a benfeitoria":"a máquina"}`,sub:`${art} ${nome} fica${filhos.length>1?"m":""} no histórico como “${benf?"Benfeitoria":"Máquina"} removida”`,fn:()=>emLote(()=>fn())}];
  janela({titulo:benf?"Excluir benfeitoria":"Excluir máquina",html,botoes:bts,check:cs.length?{l:`Excluir também as contas do Financeiro (${cs.length})`,on:false}:null});
}
window.ligDel=function(tipo,arg,b,fn){
  try{
    switch(tipo){
      case "conta": return delConta(arg,b,fn);
      case "entrada": return delEntrada(arg,b,fn);
      case "produto": return delProduto(arg,b,fn);
      case "diesel": return delOrigem("ds","diesel",arg,b,fn);
      case "manut": return delOrigem("mq","manutencoes",arg,b,fn);
      case "serv": return delOrigem("bf","servicos_benf",arg,b,fn);
      case "graos": return delOrigem("gr","graos",arg,b,fn);
      case "maquina": return delMaquina(arg,b,fn,false);
      case "benf": return delMaquina(arg,b,fn,true);
    }
  }catch(err){console.warn("ligDel",err)}
  confirmar(b,"Confirmar exclusão",fn);
};

/* ---------- Conferir ligações ---------- */
let cfg={ign:[]}, cfgOk=false;
function divergencias(){
  const out=[], ign=new Set(cfg.ign||[]), cs=CONTAS(); if(!F()||!window.finLig.pronto()) return out;
  const ids=new Set(cs.map(c=>c.id)), grupos=new Set(cs.map(c=>c.grupo).filter(Boolean));
  // 1. produtos no estoque de uma conta que foi excluída
  const orf=new Map();
  for(const e of EST()) (e.entradas||[]).forEach((x,i)=>{
    if(!(x.doFinanceiro&&x.finId)||ids.has(x.finId)||grupos.has(x.finId)||cs.some(c=>ligaCE(c,x))) return;
    const a=orf.get(x.finId)||[]; a.push({e,i,x}); orf.set(x.finId,a)});
  for(const [fid,ents] of orf){ const k="orf|"+fid; if(ign.has(k)) continue;
    out.push({k,tit:"Produtos no estoque de uma conta que foi excluída do Financeiro",html:lista(ents.map(t=>e_(entTxt(t))+(t.x.nf?` · NF ${e_(t.x.nf)}`:"")))+avisoNeg(ents),
      bts:[{l:"Tirar do estoque",cls:"danger",ok:"Produtos tirados do estoque.",fn:()=>emLote(()=>tirarEntradas(ents))},
           {l:"Manter no estoque",sub:"a compra aparece nas pendências do Resumo para lançar de novo ou ignorar",ok:"Mantido no estoque.",fn:()=>soltarEntradas(ents)}]}) }
  // 2. contas do Diário cujo lançamento foi excluído / com valor diferente
  const porOrig=new Map(); for(const c of cs){const og=origemDe(c); if(og){const a=porOrig.get(c.origem)||{og,cs:[]}; a.cs.push(c); porOrig.set(c.origem,a)}}
  for(const [orig,{og,cs:lc}] of porOrig){
    const src=og.o.lista().find(x=>x.id===og.id), soma=lc.reduce((t,c)=>t+valConta(c),0);
    if(!src){ const k="sem|"+orig; if(ign.has(k)) continue;
      out.push({k,tit:`Conta de ${og.o.a==="a"?"uma":"um"} ${og.o.nome} que foi ${og.o.ex} do Diário`,html:lista(lc.map(c=>`${e_(nomeConta(c))} · ${R$(valConta(c))}${c.status==="pago"?" · paga":" · em aberto"}`))+avisoPago(lc),
        bts:[{l:"Excluir a conta",cls:"danger",ok:"Conta excluída.",fn:()=>emLote(()=>excluirContas(lc))},
             {l:"Manter a conta",sub:"fica no Financeiro sem ligação",ok:"Conta mantida.",fn:async()=>{for(const c of lc) await desligarConta(c)}}]}); continue }
    const v=og.o.val(src); if(!(v>0)||Math.abs(v-soma)<0.01) continue;
    const k=`val|${orig}|${v.toFixed(2)}|${soma.toFixed(2)}`; if(ign.has(k)) continue;
    const um=lc.length===1&&lc[0].status!=="pago";
    out.push({k,tit:`Valor diferente: ${og.o.nome} × conta do Financeiro`,html:`<p>${e_(og.o.txt(src))}: <b>${R$(v)}</b><br>No Financeiro: <b>${R$(soma)}</b> (${lc.map(c=>e_(nomeConta(c))).join(", ")})</p>`,
      bts:[...(um?[{l:`Atualizar a conta para ${R$(v)}`,cls:"primary",ok:"Conta atualizada.",fn:async()=>{const {id,...d}=lc[0]; d.valor=+v.toFixed(2); await db.collection("fin_lanc").doc(id).set(d)}}]:
              [{l:"Abrir a conta",sub:lc.some(c=>c.status==="pago")?"já paga: ajuste à mão se precisar":"várias parcelas: ajuste à mão",fn:async()=>window.finEditar?.(lc[0].id)}]),
           {l:"Deixar assim",sub:"por exemplo, teve desconto",ok:"Certo, fica assim.",fn:()=>ignora(k)}]});
  }
  // 3. pagamento com grãos sem o movimento / movimento sem a conta
  const grIds=new Set(GR().map(m=>m.id));
  for(const c of cs) if(c.quitGraos?.grId&&!grIds.has(c.quitGraos.grId)){ const k="qg|"+c.id; if(ign.has(k)) continue;
    out.push({k,tit:"Conta paga com grãos, mas o movimento de grãos foi excluído",html:`<p>${e_(nomeConta(c))} · ${R$(valConta(c))} · ${nB(c.quitGraos.sacas)} sc de ${e_(c.quitGraos.cultura)}</p>`,
      bts:[{l:"Voltar a conta para em aberto",cls:"primary",fn:async()=>{const {id,...d}=c; delete d.quitGraos; delete d.pagoEm; delete d.contaId; delete d.valorPago; d.status="aberto"; await db.collection("fin_lanc").doc(id).set(d)}},
           {l:"Manter paga",sub:"sem o movimento em Grãos",fn:async()=>{const {id,...d}=c; d.quitGraos={...d.quitGraos}; delete d.quitGraos.grId; await db.collection("fin_lanc").doc(id).set(d)}}]}) }
  for(const m of GR()) if(m.finId&&!ids.has(m.finId)){ const k="gf|"+m.id; if(ign.has(k)) continue;
    out.push({k,tit:"Pagamento com grãos de uma conta que foi excluída",html:`<p>${e_(ORIG.gr.txt(m))}${m.contrato?` · ${e_(m.contrato)}`:""}</p>`,
      bts:[{l:"Excluir o movimento de grãos",cls:"danger",sub:"as sacas voltam para o saldo",fn:()=>emLote(()=>db.collection("graos").doc(m.id).delete())},
           {l:"Manter o movimento",fn:async()=>{const {id,...d}=m; delete d.finId; await db.collection("graos").doc(id).set(d)}}]}) }
  // 4. conta "est|" (lançada pela pendência do estoque) sem nenhum produto no estoque
  for(const c of cs) if(/^est\|/.test(c.origem||"")&&!EST().some(e=>(e.entradas||[]).some(x=>ligaCE(c,x)))){ const k="est|"+c.id; if(ign.has(k)) continue;
    out.push({k,tit:"Conta de uma compra do estoque cujos produtos foram excluídos",html:`<p>${e_(nomeConta(c))} · ${R$(valConta(c))}${c.status==="pago"?" · paga":" · em aberto"}</p>`+avisoPago([c]),
      bts:[{l:"Excluir a conta",cls:"danger",fn:()=>emLote(()=>excluirContas([c]))},{l:"Manter a conta",fn:()=>desligarConta(c)}]}) }
  return out;
}
async function ignora(k){ cfg={...cfg,ign:[...new Set([...(cfg.ign||[]),k])].slice(-300)}; await db.collection("config").doc("ligacoes").set(cfg) }
let ultimas=null, ultToque=0, assin="", t0=Date.now();
document.addEventListener("pointerdown",()=>{ultToque=Date.now()},true);
document.addEventListener("keydown",()=>{ultToque=Date.now()},true);
function render(){
  const box=$("#lg-box"); let ds=[]; try{ds=divergencias()}catch(err){console.warn("ligações",err)}
  const s=ds.map(d=>d.k).join(","); window.marca?.("fin_resumo:lig",ds.length);
  if(box&&s!==assin){
    assin=s; box.hidden=!ds.length;
    box.innerHTML=ds.length?`<h3 class="lg-h">🔗 Conferir ligações <span class="bdg">${ds.length}</span></h3><p class="note">Coisas que ficaram desencontradas entre o Diário, o Estoque e o Financeiro. Escolha o que fazer em cada uma.</p>`+
      ds.map((d,i)=>`<div class="lg-it"><b>${e_(d.tit)}</b>${d.html}<div class="lg-it-bts">${d.bts.map((b,j)=>`<button type="button" class="btn ${b.cls||"ghost"} sm" data-lg="${i}:${j}">${e_(b.l)}</button>`).join("")}</div>${d.bts.some(b=>b.sub)?`<p class="note">${d.bts.filter(b=>b.sub).map(b=>`<b>${e_(b.l)}</b>: ${e_(b.sub)}`).join(" · ")}</p>`:""}</div>`).join(""):"";
    box.querySelectorAll("[data-lg]").forEach(bt=>bt.onclick=async()=>{const [i,j]=bt.dataset.lg.split(":").map(Number), b=ds[i]?.bts[j]; if(!b) return; bt.disabled=true; bt.textContent="Aguarde…";
      try{await b.fn(); if(b.ok) window.ponte?.aviso?.(b.ok,true)}catch(err){console.warn(err); bt.disabled=false; bt.textContent="Falhou, tente de novo"}});
  }
  // diferença nova logo depois de uma alteração feita neste aparelho → já pergunta
  if(ultimas&&Date.now()-t0>10000){ const novas=ds.filter(d=>!ultimas.has(d.k)); if(novas.length&&Date.now()-ultToque<20000&&(!modal||modal.hidden)&&!document.hidden){ const d=novas[0];
    janela({titulo:"Confira a ligação",html:`<p><b>${e_(d.tit)}</b></p>`+d.html,botoes:d.bts}) } }
  if(window.finLig?.pronto()&&cfgOk) ultimas=new Set(ds.map(d=>d.k));
}
function inicia(){
  if(typeof db==="undefined"||!db||!window.finLig){setTimeout(inicia,800);return}
  const ref=$("#fn-alertas"); if(ref&&!$("#lg-box")){const d=document.createElement("div"); d.id="lg-box"; d.className="lg-box"; d.hidden=true; ref.after(d)}
  db.collection("config").doc("ligacoes").onSnapshot(s=>{cfg=(s&&s.exists?s.data():null)||{ign:[]}; cfgOk=true; assin=""; render()},()=>{cfgOk=true});
  setInterval(()=>{if(!document.hidden) render()},2500);
  render();
}
window.ligInfoEntrada=function(e,x){ // texto para o formulário de edição da entrada
  const cs=parcelasDe(CONTAS().filter(c=>ligaCE(c,x))); if(!cs.length) return "";
  return `<p class="note lg-nota">🔗 Esta entrada está no Financeiro: ${cs.map(c=>`${e_(nomeConta(c))} (${R$(valConta(c))})`).join(", ")}. Mudou o valor? <button type="button" class="link" data-lgfin="${cs[0].id}">Abrir a conta</button></p>`;
};
window.ligInfoConta=function(l){ // texto para o formulário de edição da conta
  if(!l||l.natureza!=="pagar") return "";
  const ents=entradasDe(parcelasDe([l])); if(!ents.length) return "";
  return `🔗 Os produtos desta nota estão no Estoque: ${ents.map(t=>e_(entTxt(t))).join("; ")}. Se mudar quantidade ou valor, ajuste lá também. <button type="button" class="link" data-lgest="${ents[0].e.id}">Abrir no estoque</button>`;
};
document.addEventListener("click",ev=>{
  const a=ev.target.closest("[data-lgfin]"); if(a){ev.preventDefault(); window.finEditar?.(a.dataset.lgfin); return}
  const s=ev.target.closest("[data-lgest]"); if(s){ev.preventDefault(); window.esAbrir?.(s.dataset.lgest)}
});
window.ligacoes={divergencias,ligaCE,entradasDe,parcelasDe,render};
inicia();
})();
