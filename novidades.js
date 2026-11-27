/* Novidades das atualizações (v118).
   A cada versão publicada, acrescente UMA entrada no começo de NOVIDADES:
     {v: número da versão, data: "DD/MM/AAAA", titulo, texto (parágrafos separados por linha em branco; "- " no começo vira item),
      onde: [{view: tela do app (ex. "fin_resumo") ou "config", sel: seletor do lugar dentro da tela (opcional), l: nome do lugar}]}
   Cada pessoa tem a sua leitura: novidades_lidas/{uid} {lidas:{"118": iso}, vistos:{"118|fin_resumo": iso}, desde}.
   - Faixa amarela #nv-alerta logo abaixo da linha das chuvas enquanto houver novidade não lida. "Ler" abre a janela #nv-modal e marca como lida.
   - Bolinha amarela (.nv-dot) na aba, no menu lateral e no lugar (sel) até a pessoa abrir aquela tela (ou 15 dias depois de ler).
   - Configurações → "Histórico de atualizações" (#nv-hist, abaixo do "Procurar atualização") com todas.
   Entradas com antiga:true já contam como lidas (histórico de antes deste recurso). */
(function(){
const NOVIDADES=[
  {v:121,data:"27/11/2026",titulo:"Documentos no resultado da lavoura",tags:["relatorio","resultado","foto","arquivo","documento"],
   texto:`O "Resultado de cada lavoura" (Financeiro → Resultado → Resultado de cada lavoura) agora mostra também os papéis da lavoura.

- "📎 Documentos da lavoura": os documentos guardados com a mesma cultura e safra (receitas, planejamentos, recomendações) e os papéis dos contratos e pedidos daquela cultura. Toque no nome para abrir a foto ou o PDF.
- Na lista de atividades, cada lançamento com foto ou arquivo (inclusive o papel do romaneio da colheita) mostra o 📷/📄 para abrir ali mesmo.
- No "Imprimir / PDF" sai a lista com o nome de cada documento.`,
   onde:[{view:"fin_safra",sel:"#rlv-box h3",l:"Financeiro → Resultado → Resultado de cada lavoura"}]},
  {v:120,data:"27/11/2026",titulo:"Contratos e pedidos com os papéis, e a tela Documentos",tags:["arquivo","arquivos","pdf","foto","papel","papeis","receita","planejamento","guardar"],
   texto:`Contratos e pedidos: em Financeiro → Resumo, a caixa que se chamava "Descontos dos contratos" agora é "Contratos e pedidos".

- "+ Novo contrato ou pedido": escolha Contrato ou Pedido, digite o número e preencha fornecedor (Coamo, Casarão…), cultura, safra, valor, vencimento e descontos.
- "Papéis do contrato": tire a foto ou escolha o PDF do contrato. O arquivo fica guardado na hora, sem precisar tocar em Salvar. Os papéis também aparecem no Relatório do contrato, onde dá para anexar mais.
- O contrato cadastrado já aparece em "Contratos e pedidos em aberto", mesmo antes de chegar a primeira nota.

Documentos (Painel → Documentos): lugar para guardar receitas, planejamentos de aplicação, recomendações do agrônomo, análises de solo e outros papéis.

- "+ Guardar documento": nome, tipo, cultura, safra, talhões (opcional) e a foto ou o PDF.
- Busca por palavra e filtros por tipo, cultura e safra. Os papéis dos contratos aparecem junto.
- Na tela do talhão (Painel → Talhões hoje → tocar no talhão) aparece "Documentos da cultura", com os documentos da cultura e da safra que estão naquele talhão.`,
   onde:[{view:"fin_resumo",sel:"#fn-cdesc-box > summary",l:"Financeiro → Resumo → Contratos e pedidos"},{view:"documentos",sel:"#dc-mais > summary",l:"Painel → Documentos"}]},
  {v:119,data:"27/11/2026",titulo:"Busca no histórico de atualizações",tags:["procurar","pesquisar","buscar"],
   texto:`O "Histórico de atualizações" (Configurações, abaixo do "Procurar atualização") ganhou uma caixa de busca.

- Digite uma palavra ou assunto: financeiro, contrato, grãos, estoque, talhão…
- Não precisa acento, e palavras do mesmo assunto também valem: "dinheiro" ou "pagar" acham as novidades do Financeiro; "soja" ou "venda" acham as de Grãos.
- As palavras encontradas ficam marcadas em amarelo.`,
   onde:[{view:"config",sel:".nv-h-busca",l:"Configurações → Histórico de atualizações"}]},
  {v:118,data:"27/11/2026",titulo:"Avisos das atualizações",
   texto:`Agora, toda vez que o app for atualizado, aparece esta faixa amarela logo abaixo da linha das chuvas, contando o que mudou.

- Tocou em "Ler", a novidade sai da sua tela. Na tela da sua irmã ela continua até ela ler também (cada um tem a sua leitura).
- Uma bolinha amarela mostra onde fica o que mudou (na aba, no menu e no próprio lugar). Ela some depois que você passar por lá.
- Todas as novidades ficam guardadas em Configurações → "Histórico de atualizações", logo abaixo do "Procurar atualização".`,
   onde:[{view:"config",sel:"#nv-hist > summary",l:"Configurações → Histórico de atualizações"}]},
  {v:117,data:"26/11/2026",titulo:"Relatório do contrato e pagamento com desconto",
   texto:`Cada contrato de insumos tem agora um relatório próprio: o que foi comprado (notas a preço cheio), o desconto, o que já foi pago, o que está em aberto, o que já foi retirado, o que falta retirar e onde cada produto foi aplicado.

- Abrir: Financeiro → Resumo → "Contratos e pedidos em aberto" → toque no contrato (também no cartão da conta → "relatório" e em Resultado → Contratos de insumos).
- O 84865 já vem cadastrado: 19% nos químicos, 3% no fertilizante, valor total R$ 124.121,61, vencimento 01/04/27 e 1,3% ao mês de desconto por antecipação.
- Caixa "Pagar o contrato": escolha a data e a conta, o app calcula o valor com a antecipação (dias também contam) e dá baixa em tudo de uma vez. Se errar, "Desfazer o pagamento" volta tudo.
- Os descontos dos outros contratos ficam em Financeiro → Resumo → "Descontos dos contratos" (agora com valor total, vencimento e % ao mês).`,
   onde:[{view:"fin_resumo",sel:"#fn-ctr-box .sub-h",l:"Financeiro → Resumo → Contratos e pedidos em aberto"}]},
  {v:116,data:"25/11/2026",antiga:true,titulo:"Custos gerais divididos entre todas as lavouras",
   texto:`No resultado de cada lavoura, os custos gerais da safra (diesel, manutenção, mão de obra, arrendamento…) são divididos 100% entre as lavouras que ocuparam a terra naquela safra, pela área × dias de cada uma. Enquanto a safra não termina, a parte de cada lavoura muda um pouco a cada dia.`,
   onde:[{view:"fin_safra",l:"Financeiro → Resultado → Resultado de cada lavoura"}]},
  {v:115,data:"24/11/2026",antiga:true,titulo:"Resultado de cada lavoura",
   texto:`Relatório completo de uma lavoura do começo ao fim (ex. a cevada do talhão 1): atividades e insumos, produção, vendas, custos diretos e gerais, custo por hectare e lucro.

- Abrir: Financeiro → Resultado → "Resultado de cada lavoura", ou no Histórico da área do talhão → "resultado".
- A área colhida não soma mais em dobro quando a colheita é feita em dias diferentes.
- "Encerrar lavoura sem colheita" saiu do Painel: fica só na tela do talhão, pede a data e confirmação, e tem "Desfazer o encerramento".`,
   onde:[{view:"fin_safra",l:"Financeiro → Resultado"}]},
  {v:114,data:"23/11/2026",antiga:true,titulo:"Zerar sobra dos grãos",
   texto:`Quando sobra um restinho (menos de 1 saca) num depósito depois de vender tudo, aparece "Zerar sobra" no cartão da cultura em Grãos. Não mexe no Financeiro nem no resultado, e tem "Desfazer o acerto".`,
   onde:[{view:"graos",l:"Lavoura → Grãos"}]},
  {v:113,data:"23/11/2026",antiga:true,titulo:"Venda de várias pessoas juntas",
   texto:`Em Grãos → Movimentar saldo, a caixa "Várias pessoas na mesma venda" deixa vender a parte da Lavoura e dos funcionários numa venda só. O Financeiro recebe o total e cria o repasse a pagar para cada funcionário.`,
   onde:[{view:"graos",l:"Lavoura → Grãos → Movimentar saldo"}]},
  {v:112,data:"22/11/2026",antiga:true,titulo:"Histórico da área (rotação de culturas)",
   texto:`Cada talhão mostra o que foi plantado nas safras anteriores: no Painel (linha "↻" em Talhões hoje) e na tela do talhão ("Histórico da área"), onde também dá para anotar safras de antes do app.`,
   onde:[{view:"painel",sel:"#ci-box",l:"Painel → Talhões hoje"}]},
  {v:111,data:"21/11/2026",antiga:true,titulo:"Lavoura encerrada",
   texto:`O talhão é só referência: quando outra cultura é plantada e não cabe mais na área, a lavoura mais antiga (primeiro a cobertura) é encerrada sozinha. O plantio ganhou o campo "Lavoura encerrada em" para encerrar à mão.`,
   onde:[{view:"painel",l:"Painel → Talhões hoje"}]},
  {v:110,data:"20/11/2026",antiga:true,titulo:"Dessecação encerra a cobertura",
   texto:`Uma dessecação ou rolagem que cita o nome da cultura (ex. "Dessecação Aveia Cobertura") encerra aquela lavoura no talhão.`,
   onde:[{view:"painel",l:"Painel → Talhões hoje"}]},
];
window.NOVIDADES=NOVIDADES;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const DIA=864e5;
let est=null, ref=null; // estado da pessoa: {lidas, vistos}
const lida=n=>n.antiga||!!est?.lidas?.[n.v];
const naoLidas=()=>est?NOVIDADES.filter(n=>!lida(n)):[];
// bolinha: novidade lida há menos de 15 dias (ou não lida) e lugar ainda não visitado
const comPonto=()=>est?NOVIDADES.filter(n=>!n.antiga&&(!est.lidas?.[n.v]||Date.now()-new Date(est.lidas[n.v])<15*DIA)):[];
const pontoEm=(n,o)=>!est.vistos?.[n.v+"|"+o.view];

function grava(d){
  if(!ref) return; est={...est,...d,lidas:{...est.lidas,...(d.lidas||{})},vistos:{...est.vistos,...(d.vistos||{})}};
  try{ref.set(est)}catch(e){console.error(e)}
  pinta();
}
function marcaLidas(lista){const ag=new Date().toISOString(), l={}; for(const n of lista) l[n.v]=ag; if(lista.length) grava({lidas:l})}
function visitou(view){
  if(!est) return; const v={};
  for(const n of comPonto()) for(const o of n.onde||[]) if(o.view===view&&pontoEm(n,o)&&lida(n)) v[n.v+"|"+o.view]=new Date().toISOString();
  if(Object.keys(v).length) grava({vistos:v});
}

// a bolinha fica enquanto a pessoa está na tela (para ver onde é) e some quando ela sai de lá
let atual=null;
function saiu(view){ if(atual===null) atual=view; if(atual!==view){visitou(atual); atual=view} }

/* ---------- textos ---------- */
function corpo(t){
  return String(t||"").split(/\n\s*\n/).map(p=>{
    const ls=p.split("\n").map(x=>x.trim()).filter(Boolean);
    if(ls.length&&ls.every(x=>x.startsWith("- "))) return `<ul>${ls.map(x=>`<li>${esc(x.slice(2))}</li>`).join("")}</ul>`;
    return `<p>${esc(ls.join(" "))}</p>`}).join("");
}
const ondeBts=n=>(n.onde||[]).length?`<div class="nv-onde">${n.onde.map((o,i)=>`<button type="button" class="link nv-ir" data-nvir="${n.v}|${i}">📍 ${esc(o.l||o.view)}</button>`).join("")}</div>`:"";
const cartao=(n,novo)=>`<article class="nv-it${novo?" nv-novo":""}"><header><b>${esc(n.titulo)}</b><small>Versão ${n.v} · ${esc(n.data)}${novo?" · nova":""}</small></header>${corpo(n.texto)}${ondeBts(n)}</article>`;

/* ---------- faixa ---------- */
function instala(){
  if($("#nv-alerta")) return;
  const box=document.createElement("div"); box.className="nv-alerta"; box.id="nv-alerta"; box.hidden=true; box.setAttribute("role","status");
  box.innerHTML=`<span class="nv-al-ic" aria-hidden="true">✨</span><div class="nv-al-txt"><b id="nv-al-tit"></b><span id="nv-al-sub"></span></div><button type="button" class="btn" id="nv-al-ler">Ler</button>`;
  $("header.head").after(box);
  $("#nv-al-ler").onclick=()=>abreModal(naoLidas());
  const m=document.createElement("div"); m.id="nv-modal"; m.className="nv-modal"; m.hidden=true;
  m.innerHTML=`<div class="nv-jan" role="dialog" aria-modal="true" aria-labelledby="nv-m-tit"><div class="nv-m-bar"><b id="nv-m-tit">Novidades</b><button type="button" class="link" id="nv-m-x" aria-label="Fechar">✕</button></div><div class="nv-m-corpo" id="nv-m-corpo"></div><div class="nv-m-rod"><button type="button" class="btn" id="nv-m-ok">Entendi</button></div></div>`;
  document.body.append(m);
  const fecha=()=>{m.hidden=true; document.body.classList.remove("nv-aberto")};
  $("#nv-m-x").onclick=fecha; $("#nv-m-ok").onclick=fecha;
  m.addEventListener("click",e=>{if(e.target===m) fecha()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!m.hidden) fecha()});
  // "📍 lugar": fecha a janela e vai até lá
  document.addEventListener("click",e=>{const b=e.target.closest("[data-nvir]"); if(!b) return;
    const [v,i]=b.dataset.nvir.split("|"), n=NOVIDADES.find(x=>String(x.v)===v), o=n?.onde?.[+i]; if(!o) return;
    fecha(); vaiPara(o)});
}
function vaiPara(o){
  if(o.view==="config"){ $("#cfg-abrir")?.click(); const d=$("#nv-hist"); if(d) d.open=true }
  else if(typeof window.show==="function") window.show(o.view);
  setTimeout(()=>{const el=o.sel&&document.querySelector(o.sel); (el||document.querySelector(".wrap")).scrollIntoView({behavior:"smooth",block:"center"}); if(el){el.classList.add("nv-pisca"); setTimeout(()=>el.classList.remove("nv-pisca"),2600)}},250);
}
function abreModal(lista,tit){
  if(!lista.length) return;
  $("#nv-m-tit").textContent=tit||(lista.length>1?`${lista.length} novidades no app`:"Novidade no app");
  $("#nv-m-corpo").innerHTML=lista.map(n=>cartao(n,!lida(n))).join("");
  $("#nv-modal").hidden=false; document.body.classList.add("nv-aberto");
  marcaLidas(lista.filter(n=>!lida(n)));
}

/* ---------- histórico em Configurações ---------- */
// busca no histórico: sem acento, pelo começo das palavras, e entende palavras do mesmo assunto ("dinheiro" acha o financeiro)
const norm=x=>String(x||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const ASSUNTOS=[
  "financeiro dinheiro conta contas pagar pagamento pago paga receber recebimento custo custos gasto gastos despesa desconto descontos valor preco lucro resultado reais parcela parcelas vencimento juros",
  "graos grao saca sacas venda vender vendido vendida deposito soja milho cevada trigo feijao colheita romaneio sobra repasse funcionario funcionarios",
  "documento documentos arquivo arquivos papel papeis pdf foto receita receitas planejamento",
  "estoque produto produtos insumo insumos defensivo defensivos quimico quimicos adubo fertilizante semente sementes nota notas aplicado aplicacao",
  "contrato contratos coamo cooperativa pedido retirada retirado antecipacao",
  "talhao talhoes area lavoura lavouras cultura culturas plantio plantado rotacao safra safras cobertura aveia encerrar encerrada encerramento dessecacao colhida",
  "aviso avisos atualizacao atualizacoes novidade novidades bolinha historico versao"
].map(g=>g.split(" "));
const casa=(tok,w)=>tok.startsWith(w)||(w.length>=4&&w.startsWith(tok)&&tok.length>=4);
function termos(q){ // cada palavra digitada vira a lista de palavras que valem por ela
  // a digitada vale pelo começo ("contr" acha contrato); as do mesmo assunto só a palavra inteira (ou plural)
  return norm(q).split(/[^a-z0-9]+/).filter(w=>w.length>=2).map(w=>{
    const t=[{w,p:true}]; for(const g of ASSUNTOS) if(g.some(x=>casa(x,w))) for(const x of g) if(x!==w) t.push({w:x,p:false}); return t});
}
const bate=(tok,o)=>o.p?casa(tok,o.w):(tok===o.w||tok===o.w+"s"||tok===o.w+"es");
const tokens=n=>norm([n.titulo,n.texto,...(n.onde||[]).map(o=>o.l||""),...(n.tags||[]),"versao "+n.v].join(" ")).split(/[^a-z0-9]+/).filter(Boolean);
const acha=(n,T)=>{const tk=tokens(n); return T.every(ws=>ws.some(o=>tk.some(t=>bate(t,o))))};
function marcaTexto(el,T){ // destaca as palavras encontradas
  const ws=T.flat(); if(!ws.length) return;
  const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT), nos=[]; while(tw.nextNode()) nos.push(tw.currentNode);
  for(const no of nos){const tx=no.nodeValue, nz=norm(tx); if(nz.length!==tx.length) continue;
    const re=/[a-z0-9]+/g, par=[]; let m; while((m=re.exec(nz))) if(ws.some(o=>bate(m[0],o))) par.push([m.index,m.index+m[0].length]);
    if(!par.length) continue;
    const fr=document.createDocumentFragment(); let i=0;
    for(const [x,y] of par){fr.append(tx.slice(i,x)); const mk=document.createElement("mark"); mk.className="nv-mk"; mk.textContent=tx.slice(x,y); fr.append(mk); i=y}
    fr.append(tx.slice(i)); no.replaceWith(fr)}
}
let busca="";
function hist(){
  let d=$("#nv-hist");
  if(!d){const vb=$("#versao-box"); if(!vb) return;
    d=document.createElement("details"); d.id="nv-hist"; d.className="nv-hist"; vb.after(d);
    d.innerHTML=`<summary></summary><div class="nv-h-busca"><input type="search" id="nv-q" placeholder="Buscar: financeiro, contrato, grãos, talhão…" aria-label="Buscar nas atualizações" autocomplete="off"><span class="note" id="nv-q-n" role="status"></span></div><div class="nv-h-lista" id="nv-h-lista"></div>`;
    const q=d.querySelector("#nv-q");
    q.addEventListener("input",()=>{busca=q.value; lista()});
    d.querySelector("summary").addEventListener("click",e=>{if(e.target.closest(".nv-h-ler")){e.preventDefault(); marcaLidas(naoLidas())}});
  }
  const nl=naoLidas().length;
  d.querySelector("summary").innerHTML=`Histórico de atualizações <small>(${NOVIDADES.length}${nl?` · ${nl} não lida${nl>1?"s":""}`:""})</small>${nl?`<button type="button" class="link nv-h-ler">Marcar como lidas</button>`:""}`;
  lista();
}
function lista(){
  const box=$("#nv-h-lista"); if(!box) return;
  const T=termos(busca), achou=T.length?NOVIDADES.filter(n=>acha(n,T)):NOVIDADES;
  box.innerHTML=achou.length?achou.map(n=>cartao(n,!lida(n))).join(""):`<p class="note nv-h-nada">Nenhuma atualização com “${esc(busca.trim())}”. Tente outra palavra (ex.: financeiro, estoque, grãos, contrato, talhão).</p>`;
  if(T.length) marcaTexto(box,T);
  $("#nv-q-n").textContent=T.length?(achou.length?`${achou.length} de ${NOVIDADES.length}`:""):"";
}

/* ---------- pintar faixa, bolinhas e histórico ---------- */
function pinta(){
  if(!$("#nv-alerta")) return;
  const nl=naoLidas(), box=$("#nv-alerta");
  if(nl.length){const n=nl[0];
    $("#nv-al-tit").textContent=nl.length>1?`${nl.length} novidades no app`:`Novidade no app (versão ${n.v})`;
    $("#nv-al-sub").textContent=nl.length>1?nl.map(x=>x.titulo).join(" · "):n.titulo;
    box.hidden=false} else box.hidden=true;
  hist(); pontos();
}
function pontos(){
  document.querySelectorAll(".nv-dot").forEach(x=>x.remove());
  if(!est) return;
  const dot=t=>{const s=document.createElement("span"); s.className="nv-dot"; s.title=t; s.setAttribute("aria-label","Novidade: "+t); return s};
  const G=typeof GRUPOS!=="undefined"?GRUPOS:{}, grupos=new Set(), feitos=new Set();
  for(const n of comPonto()) for(const o of n.onde||[]){
    if(!pontoEm(n,o)) continue;
    const put=(el,k)=>{if(el&&!feitos.has(k)){feitos.add(k); el.append(dot(n.titulo))}};
    if(o.view==="config") put($("#cfg-abrir"),"cfg");
    else{
      put(document.querySelector(`#tabs-s [data-view="${o.view}"]`),"s|"+o.view);
      put(document.querySelector(`#side [data-view="${o.view}"]`),"d|"+o.view);
      const g=Object.keys(G).find(k=>G[k].v.includes(o.view)); if(g) grupos.add(g);
    }
    if(o.sel) put(document.querySelector(o.sel),"e|"+o.sel);
  }
  for(const g of grupos) document.querySelector(`#tabs-g [data-g="${g}"]`)?.append(dot("Novidade"));
}

/* ---------- ligar ---------- */
window.nvInicia=function(){
  const uid=typeof meuId!=="undefined"?meuId:null;
  if(ref||typeof db==="undefined"||!db||!uid) return;
  instala();
  ref=db.collection("novidades_lidas").doc(uid);
  ref.onSnapshot(s=>{const d=s.exists?s.data()||{}:null;
    est=d?{lidas:d.lidas||{},vistos:d.vistos||{},desde:d.desde||null}:{lidas:{},vistos:{},desde:new Date().toISOString()};
    pinta()},()=>{});
};
// as abas e o menu são redesenhados a cada troca de tela: repõe as bolinhas
const pm=window.pintaMarcas;
if(pm) window.pintaMarcas=function(){const r=pm.apply(this,arguments); try{pontos()}catch{} return r};
const orig=window.show;
if(orig) window.show=show=function(view){const r=orig.apply(this,arguments); try{saiu(view); pontos()}catch(e){console.error(e)} return r};
document.addEventListener("click",e=>{if(e.target.closest("#cfg-abrir")) setTimeout(()=>{saiu("config"); hist(); pontos()},0)});
// mudou algo na tela (listas redesenhadas): repõe a bolinha do lugar
let t=null; new MutationObserver(()=>{clearTimeout(t); t=setTimeout(()=>{if(est&&comPonto().some(n=>(n.onde||[]).some(o=>o.sel&&pontoEm(n,o)&&!document.querySelector(o.sel+" .nv-dot")&&document.querySelector(o.sel)))) pontos()},300)}).observe(document.body,{childList:true,subtree:true});
})();
// o login pode terminar antes ou depois deste arquivo carregar: tenta agora e de novo até ligar
(function tenta(n){try{window.nvInicia()}catch(e){console.error(e)} if(!document.getElementById("nv-alerta")&&n<120) setTimeout(()=>tenta(n+1),500)})(0);
