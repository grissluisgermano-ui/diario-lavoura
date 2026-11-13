/* Relatório de notas fiscais (Estoque → Notas fiscais → "Relatório de notas", e Painel → Relatórios → "Notas fiscais").
   Junta, uma linha por nota, tudo o que o app sabe das notas:
   - nfe/{chave} (XML guardado: e-mail, arquivo, lançamentos) — melhores dados (fornecedor, em nome de, total);
   - fin_lanc com nf/chave (contas: parcelas, pago/aberto, titular);
   - entradas do estoque com nf/chave (produtos; finId liga à conta).
   A mesma nota é reconhecida pela chave ou por NF + fornecedor (finLig.nfKey).
   Situação: cancelada · lançada (estoque e/ou financeiro) · ignorada · recebida, falta lançar. */
(function(){
const $=s=>document.querySelector(s);
const e=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const br=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dt=iso=>iso?iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4):"";
const MES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const mesTxt=am=>{const m=+am.slice(5,7); return m?MES[m-1][0].toUpperCase()+MES[m-1].slice(1)+" de "+am.slice(0,4):"Sem data"};
const hoje=()=>{const d=new Date(); return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const safraDe_=iso=>{const y=+iso.slice(0,4),m=+iso.slice(5,7); return m>=7?y:y-1};
const sLab=y=>String(y).slice(2)+"/"+String(y+1).slice(2);
const L=()=>window.finLig;
const normN=s=>(L()?.norm||(x=>String(x||"").toLowerCase()))(s);
const nfDig=n=>String(n||"").replace(/\D/g,"").replace(/^0+/,"");
const bonito=s=>{s=String(s||"").trim(); if(!s) return ""; return s===s.toUpperCase()?s.toLowerCase().replace(/(^|\s)(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g,w=>w.toLowerCase()):s};

/* leitura do XML guardado (uma vez por nota) */
const cacheX=new Map();
function doXml(d){
  if(cacheX.has(d.id)) return cacheX.get(d.id);
  let r=null;
  try{const doc=new DOMParser().parseFromString(d.xml,"application/xml"); const f=window.finDadosXml?.(doc);
    if(f){const tp=doc.getElementsByTagNameNS("*","tpNF")[0]?.textContent?.trim(); r={...f,tpNF:tp}}}catch{}
  cacheX.set(d.id,r); return r;
}

/* ---------- junta tudo, uma linha por nota ---------- */
function montar(){
  const byCh=new Map(), byK=new Map(), lista=[];
  const kDe=(nf,emit)=>{const n=nfDig(nf); return n&&L()?.nfKey?L().nfKey(nf,emit):""};
  const pega=(chave,nf,emit)=>{
    let n=(chave&&byCh.get(chave))||null; const k=kDe(nf,emit);
    if(!n&&k) n=byK.get(k)||null;
    if(!n){n={chave:"",numero:"",data:"",emit:"",razao:"",dest:"",total:0,xml:false,email:false,ignorada:false,cancelada:false,retirada:false,contrato:"",tpNF:"",
      est:false,vEst:0,prods:[],prodIds:[],ents:[],fin:false,parcs:[],natureza:"",anexos:[]}; lista.push(n)}
    if(chave&&!n.chave){n.chave=chave; byCh.set(chave,n)}
    if(k&&!byK.has(k)) byK.set(k,n);
    if(nf&&!n.numero) n.numero=nfDig(nf);
    return n;
  };
  // 1) XML guardados
  for(const d of window.danfeColecao?.()||[]){
    if(!d.xml) continue; const x=doXml(d);
    const n=pega(d.id,x?.numero||d.numero,x?.emit||d.emit);
    n.xml=true; n.nfeDoc=d; for(const a of d.anexos||[]) if(a?.id&&!n.anexos.some(b=>b.id===a.id)) n.anexos.push(a);
    n.email||=d.origem==="email"; n.ignorada||=!!d.ignorada; n.cancelada||=!!d.cancelada;
    n.data||=x?.data||d.data||""; n.emit||=x?.emit||d.emit||""; n.razao||=x?.emitRazao||""; n.dest||=x?.dest||bonito(d.dest)||"";
    n.total||=x?.total||+d.total||0; n.contrato||=x?.contrato||""; n.tpNF||=x?.tpNF||"";
    if(x?.retirada) n.xRet=true;
    const vg=x?.tpNF==="0"?window.vgLe?.(d.xml):null;
    if(vg?.tipo==="venda") n.venda=true; if(vg?.tipo==="remessa") n.remessa=true; if(vg?.tipo==="devolucao") n.devol=true;
    if(d.registrada) n.registrada=true;
  }
  // 2) contas do Financeiro
  const lanc=(L()?.lanc?.()||[]).filter(l=>l.natureza!=="transf"&&(l.chave||nfDig(l.nf)));
  const porFin=new Map();
  for(const l of lanc){
    const n=pega(l.chave||"",l.nf,l.pessoa);
    n.fin=true; n.parcs.push(l); n.natureza||=l.natureza;
    n.data||=l.competencia||l.vencimento||""; n.emit||=l.pessoa||""; n.dest||=bonito(l.titular)||"";
    if(l.contrato) n.contrato||=l.contrato;
    porFin.set(l.id,n); if(l.grupo) porFin.set(l.grupo,n);
  }
  // 2b) vendas de grãos lançadas pela nota (graos-nota.js)
  for(const m of (typeof grMovs==="function"?grMovs():[])){ if(!m.chave) continue;
    const n=pega(m.chave,m.nf,m.local); n.grao=true; n.venda=true; n.graoTxt=`${String(m.sacas).replace(".",",")} sc de ${m.cultura}`; n.data||=m.data; n.emit||=m.local||"" }
  // 3) entradas do estoque
  for(const p of (typeof estoque!=="undefined"?estoque:[])){
    for(const [i,x] of (p.entradas||[]).entries()){
      if(!x.chave&&!nfDig(x.nf)&&!x.finId) continue;
      let n=x.finId&&porFin.get(x.finId);
      if(n){if(x.chave&&!n.chave){n.chave=x.chave; byCh.set(x.chave,n)}}
      else n=pega(x.chave||"",x.nf,x.origem);
      n.est=true; n.ents.push({e:p,x,i}); n.vEst+=Number(x.valorTotal)||0; n.data||=x.data||""; n.emit||=x.origem||"";
      if(x.retirada) n.retirada=true; if(x.contrato) n.contrato||=x.contrato;
      if(!n.prodIds.includes(p.id)){n.prodIds.push(p.id); n.prods.push(p.comercial)}
    }
  }
  const anx=(n,ls)=>{for(const a of ls||[]) if(a?.id&&!n.anexos.some(b=>b.id===a.id)) n.anexos.push(a)};
  for(const n of lista){
    for(const t of n.ents) anx(n,t.x.anexos); for(const l of n.parcs) anx(n,l.anexos);
    n.vFin=n.parcs.reduce((s,l)=>s+(Number(l.valor)||0),0);
    n.valor=n.total||n.vFin||n.vEst;
    n.emit=n.emit||"Fornecedor não informado";
    n.lancada=n.est||n.fin||n.grao||n.registrada;
    n.sit=n.cancelada?"cancelada":n.lancada?"lancada":n.ignorada?"ignorada":"falta";
    if(!n.lancada&&n.xRet) n.retirada=true;
    const ab=n.parcs.filter(l=>l.status!=="pago");
    n.aberto=ab.reduce((s,l)=>s+(Number(l.valor)||0),0);
    n.pag=!n.fin?"":ab.length===0?"pago":ab.length===n.parcs.length?"aberto":"parcial";
    n.venceEm=ab.map(l=>l.vencimento).filter(Boolean).sort()[0]||"";
    n.venda=n.natureza==="receber";
    n.onde=[n.est?"Estoque":"",n.grao?"Grãos":"",n.fin?"Financeiro":"",n.registrada?"Guardada (entrega no depósito)":""].filter(Boolean).join(" e ");
    // lançada em dobro: mesma entrada (produto, quantidade, valor, embalagem) ou mesma parcela (vencimento, valor) mais de uma vez
    const vistoE=new Map(), repE=[];
    for(const t of n.ents){const k=[t.e.id,t.x.quantidade,t.x.valorTotal,t.x.emb?JSON.stringify(t.x.emb):"",t.x.lote||""].join("|"); const a=vistoE.get(k); if(a){repE.push(t); a.n++} else vistoE.set(k,{t,n:1})}
    const vistoF=new Map(), repF=[];
    for(const l of n.parcs.slice().sort((a,b)=>String(a.criadoEm||"").localeCompare(String(b.criadoEm||"")))){const k=[l.vencimento,Number(l.valor).toFixed(2),l.natureza].join("|"); if(vistoF.has(k)) repF.push(l); else vistoF.set(k,l)}
    n.repE=repE; n.repF=repF; n.repetida=repE.length+repF.length>0;
    if(n.repetida){ // o valor da nota não conta a repetição
      n.vEst-=repE.reduce((s,t)=>s+(Number(t.x.valorTotal)||0),0); n.vFin-=repF.reduce((s,l)=>s+(Number(l.valor)||0),0);
      if(!n.total) n.valor=n.vFin||n.vEst;
      const ab2=n.parcs.filter(l=>l.status!=="pago"&&!repF.includes(l)); n.aberto=ab2.reduce((s,l)=>s+(Number(l.valor)||0),0);
    }
    n.busca=normN([n.numero,n.emit,n.razao,n.dest,n.contrato,...n.prods,...n.parcs.flatMap(l=>[l.descricao,...(l.itens||[]).map(i=>i.desc)])].join(" "));
  }
  return lista.sort((a,b)=>String(b.data).localeCompare(String(a.data))||(+b.numero||0)-(+a.numero||0));
}
const SIT1={lancada:"lançada",falta:"recebida, falta lançar",ignorada:"ignorada",cancelada:"cancelada"}, SITN={lancada:"lançadas",falta:"recebidas, falta lançar",ignorada:"ignoradas",cancelada:"canceladas"};
const SIT={lancada:"Lançada",falta:"Recebida, falta lançar",ignorada:"Ignorada",cancelada:"Cancelada"};
const pagTxt=n=>n.pag==="pago"?(n.venda?"Recebida":"Paga"):n.pag==="aberto"?`Em aberto${n.venceEm?" · vence "+dt(n.venceEm):""}`:n.pag==="parcial"?`Parcial · falta ${br(n.aberto)}`:"";
window.rnNotas=montar;
window.rnOpcoes=()=>{const ls=montar(); return {forn:[...new Set(ls.map(n=>n.emit))].sort((a,b)=>a.localeCompare(b,"pt-BR")),dest:[...new Set(ls.map(n=>n.dest).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"))}};

/* ---------- Painel → Relatórios (PDF / Excel) ---------- */
window.rnRelatorio=function(F){
  const ls=montar().filter(n=>F.dentro(n.data)&&(!F.nfsit||n.sit===F.nfsit)&&(!F.nfforn||n.emit===F.nfforn)&&(!F.nfdest||n.dest===F.nfdest))
    .sort((a,b)=>String(a.data).localeCompare(String(b.data)));
  const linhas=ls.map(n=>[n.data,n.numero,n.emit,n.dest,n.valor,SIT[n.sit]+(n.repetida?" (lançada em dobro)":"")+(n.retirada?" (retirada do contrato)":"")+(n.venda?" (venda)":""),n.onde||"–",pagTxt(n)||(n.retirada?"Já paga no contrato":""),n.prods.join(", "),n.chave]);
  const soma=f=>ls.filter(f).reduce((s,n)=>s+n.valor,0), cont=f=>ls.filter(f).length;
  const resumo=[["Notas",String(ls.length)],["Valor total",br(soma(()=>1))]];
  for(const k of ["lancada","falta","ignorada","cancelada"]) if(cont(n=>n.sit===k)) resumo.push([SIT[k],`${cont(n=>n.sit===k)} · ${br(soma(n=>n.sit===k))}`]);
  const dests=[...new Set(ls.map(n=>n.dest).filter(Boolean))];
  for(const d of dests) resumo.push(["Em nome de "+d,br(soma(n=>n.dest===d&&n.sit!=="cancelada"))]);
  return {colunas:[["Data","data"],["NF"],["Fornecedor"],["Em nome de"],["Valor","brl"],["Situação"],["Onde entrou"],["Pagamento"],["Produtos"],["Chave"]],linhas,
    totais:{4:ls.filter(n=>n.sit!=="cancelada").reduce((s,n)=>s+n.valor,0)},resumo};
};

/* ---------- tela: Estoque → Notas fiscais → Relatório de notas ---------- */
const st={per:"mes0",mes:"",sit:"",forn:"",dest:"",onde:"",q:"",abertos:new Set()};
try{Object.assign(st,JSON.parse(localStorage.getItem("rn-filtros")||"{}"),{q:"",abertos:new Set()})}catch{}
const guarda=()=>{try{localStorage.setItem("rn-filtros",JSON.stringify({per:st.per,mes:st.mes,sit:st.sit,forn:st.forn,dest:st.dest,onde:st.onde}))}catch{}};
function periodo(){
  const h=hoje(), p=st.per;
  if(p==="mes0") return {de:h.slice(0,8)+"01",ate:h.slice(0,8)+"31",rot:mesTxt(h)};
  if(p==="mes1"){const d=new Date(+h.slice(0,4),+h.slice(5,7)-2,1), am=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); return {de:am+"-01",ate:am+"-31",rot:mesTxt(am)}}
  if(p==="mesx"&&st.mes) return {de:st.mes+"-01",ate:st.mes+"-31",rot:mesTxt(st.mes)};
  if(p.startsWith("s")){const y=+p.slice(1); return {de:y+"-07-01",ate:(y+1)+"-06-30",rot:"Safra "+sLab(y)}}
  if(p.startsWith("a")){const y=p.slice(1); return {de:y+"-01-01",ate:y+"-12-31",rot:"Ano de "+y}}
  return {de:"",ate:"",rot:"Todas as datas"};
}
function filtra(ls){
  const P=periodo(), q=normN(st.q);
  return ls.filter(n=>(!P.de||(n.data&&n.data>=P.de&&n.data<=P.ate))&&(!st.sit||n.sit===st.sit)&&(!st.forn||n.emit===st.forn)&&(!st.dest||n.dest===st.dest)
    &&(!st.onde||(st.onde==="est"?n.est&&!n.fin:st.onde==="fin"?n.fin&&!n.est:st.onde==="ambos"?n.est&&n.fin:st.onde==="ret"?n.retirada:st.onde==="aberto"?n.pag==="aberto"||n.pag==="parcial":st.onde==="rep"?n.repetida:st.onde==="graos"?n.grao||n.remessa||(n.venda&&!n.fin&&!n.est):true))
    &&(!q||q.split(" ").every(w=>n.busca.includes(w))));
}
const sel=(id,lab,opts,v)=>`<div class="field"><label for="${id}">${lab}</label><select id="${id}">${opts.map(([k,l])=>`<option value="${e(k)}"${k===v?" selected":""}>${e(l)}</option>`).join("")}</select></div>`;
const chaveN=n=>n.chave||n.numero+"|"+n.emit;
function linha(n){
  const ab=st.abertos.has(chaveN(n));
  const sel_=n.sit==="cancelada"?`<span class="pill venc">Cancelada</span>`:n.sit==="falta"?`<span class="pill rn-falta">Falta lançar</span>`:n.sit==="ignorada"?`<span class="pill rn-ign">Ignorada</span>`:"";
  const onde=[n.est?`<span class="rn-tag rn-est">📦 Estoque</span>`:"",n.fin?`<span class="rn-tag rn-fin">💲 Financeiro</span>`:"",n.retirada?`<span class="rn-tag rn-ret">Retirada do contrato${n.contrato?" "+e(n.contrato):""} · já paga</span>`:"",n.grao?`<span class="rn-tag rn-est">🌾 Grãos: venda de ${e(n.graoTxt)}</span>`:n.venda?`<span class="rn-tag">Venda</span>`:"",n.remessa?`<span class="rn-tag">📦 Entrega no depósito (não é venda)</span>`:"",n.devol?`<span class="rn-tag">↩️ Devolução</span>`:"",n.anexos.length?`<span class="rn-tag">📎 ${n.anexos.length} anexo${n.anexos.length>1?"s":""}</span>`:"",n.repetida?`<span class="rn-tag rn-rep">⚠️ Lançada em dobro</span>`:""].join("");
  const pg=n.pag?`<span class="rn-pag rn-${n.pag}">${e(pagTxt(n))}</span>`:"";
  const det=ab?`<div class="rn-det">
      ${n.repetida?`<div class="rn-repbox"><b>⚠️ Esta nota foi lançada mais de uma vez</b>
        ${n.repE.length?`<span>No estoque, entrou de novo: ${n.repE.map(t=>`${e(t.e.comercial)} ${String(t.x.quantidade).replace(".",",")} ${e(t.e.unidade==="emb"?"emb.":t.e.unidade)}`).join(", ")}</span>`:""}
        ${n.repF.length?`<span>No Financeiro, parcela${n.repF.length>1?"s":""} repetida${n.repF.length>1?"s":""}: ${n.repF.map(l=>`${dt(l.vencimento)} ${br(l.valor)}${l.status==="pago"?" (paga)":""}`).join(", ")}</span>`:""}
        <button type="button" class="btn rn-tirar" data-rntira="${e(chaveN(n))}">Tirar a repetição (deixar só uma vez)</button>
        <span class="note">O que sair fica 30 dias na Lixeira (Histórico) e pode voltar.</span></div>`:""}
      ${n.razao&&normN(n.razao)!==normN(n.emit)?`<div><span>Razão social</span><b>${e(n.razao)}</b></div>`:""}
      ${n.prods.length?`<div><span>Produtos no estoque</span><b>${n.prods.map(e).join(", ")}</b></div>`:""}
      ${n.parcs.length?`<div><span>Parcelas</span><b>${n.parcs.slice().sort((a,b)=>String(a.vencimento).localeCompare(String(b.vencimento))).map(l=>`${dt(l.vencimento)} ${br(l.valor)} ${l.status==="pago"?"✓":"(aberta)"}`).join(" · ")}</b></div>`:""}
      ${n.contrato?`<div><span>Contrato</span><b>${e(n.contrato)}</b></div>`:""}
      ${n.est&&n.fin&&n.total&&Math.abs(n.vEst-n.total)>1&&n.vEst>0?`<div><span>Valor no estoque</span><b>${br(n.vEst)}</b></div>`:""}
      ${n.chave?`<div><span>Chave</span><b class="mono rn-ch">${e(n.chave)}</b></div>`:""}
      <div class="rn-anx"><span>Foto ou PDF da nota</span>
        ${n.anexos.length?`<div class="rn-anx-l">${n.anexos.map(a=>`<span class="rn-anx-it">${window.anxLinks?.([a])||""}<button type="button" class="rn-anx-rm" data-rnanxrm="${e(chaveN(n))}" data-id="${e(a.id)}" aria-label="Tirar este anexo">×</button></span>`).join("")}</div>`:""}
        <label class="btn ghost fn-mini rn-anx-add">📎 ${n.anexos.length?"Anexar outro":"Anexar foto ou PDF da nota"}<input type="file" accept="image/*,application/pdf,.pdf" multiple hidden data-rnanx="${e(chaveN(n))}"></label>
        <small class="note rn-anx-st" data-st="${e(chaveN(n))}" role="status"></small></div>
      <div class="rn-acoes">${n.xml?`<button type="button" class="btn ghost fn-mini" data-danfe="${e(n.chave)}">DANFE</button>`:""}${n.parcs[0]?`<button type="button" class="btn ghost fn-mini" data-rnfin="${e(n.parcs[0].id)}">Abrir a conta</button>`:""}${n.prodIds[0]?`<button type="button" class="btn ghost fn-mini" data-rnes="${e(n.prodIds[0])}">Ver no estoque</button>`:""}${n.sit==="falta"||n.sit==="ignorada"?`<button type="button" class="btn fn-mini" data-rnv="lancar">Ir para as notas a lançar</button>`:""}</div>
    </div>`:"";
  return `<article class="rn-nota rn-s-${n.sit}">
    <button type="button" class="rn-lin" data-rnab="${e(chaveN(n))}" aria-expanded="${ab}">
      <span class="rn-a"><b>NF ${e(n.numero||"s/ nº")} · ${e(n.emit)}</b><small>${e(dt(n.data))}${n.dest?" · em nome de "+e(n.dest):""}</small></span>
      <span class="rn-v mono">${br(n.valor)}${n.remessa?`<small class="rn-fisc">só fiscal</small>`:""}</span>
    </button>
    <div class="rn-tags">${sel_}${onde}${pg}</div>
    ${det}
  </article>`;
}
let ultimo=[];
function render(){
  const box=$("#rn-rel"); if(!box||box.hidden) return;
  const ls=montar(), h=hoje(), sy=safraDe_(h);
  const safras=[...new Set([sy,...ls.filter(n=>n.data).map(n=>safraDe_(n.data))])].sort((a,b)=>b-a);
  const anos=[...new Set([h.slice(0,4),...ls.filter(n=>n.data).map(n=>n.data.slice(0,4))])].sort().reverse();
  const forn=[...new Set(ls.map(n=>n.emit))].sort((a,b)=>a.localeCompare(b,"pt-BR")), dests=[...new Set(ls.map(n=>n.dest).filter(Boolean))].sort();
  if(st.forn&&!forn.includes(st.forn)) st.forn=""; if(st.dest&&!dests.includes(st.dest)) st.dest="";
  const fs=filtra(ls); ultimo=fs; const P=periodo();
  const val=fs.filter(n=>n.sit!=="cancelada"&&!n.remessa), tot=val.reduce((s,n)=>s+n.valor,0);
  const totV=val.filter(n=>n.venda).reduce((s,n)=>s+n.valor,0), totC=tot-totV;
  const c=k=>fs.filter(n=>n.sit===k), cv=k=>c(k).filter(n=>!n.remessa).reduce((s,n)=>s+n.valor,0);
  const porD={}; for(const n of val){const k=n.dest||"Não informado"; porD[k]=(porD[k]||0)+n.valor}
  const porF={}; for(const n of val){(porF[n.emit]??={n:0,v:0}); porF[n.emit].n++; porF[n.emit].v+=n.valor}
  const topF=Object.entries(porF).sort((a,b)=>b[1].v-a[1].v);
  const aberto=val.reduce((s,n)=>s+(n.venda?0:n.aberto),0);
  // grupos por mês
  const grupos=[]; for(const n of fs){const am=(n.data||"").slice(0,7); let g=grupos[grupos.length-1]; if(!g||g.am!==am){g={am,ns:[]}; grupos.push(g)} g.ns.push(n)}
  const reps=ls.filter(n=>n.repetida);
  const foco=document.activeElement?.id;
  box.innerHTML=`<div class="rn-filtros">
      ${sel("rn-per","Período",[["mes0","Este mês"],["mes1","Mês passado"],["mesx","Escolher o mês…"],...safras.map(y=>["s"+y,"Safra "+sLab(y)]),...anos.map(a=>["a"+a,"Ano de "+a]),["tudo","Todas as datas"]],st.per)}
      ${st.per==="mesx"?`<div class="field"><label for="rn-mes">Mês</label><input type="month" id="rn-mes" value="${e(st.mes||h.slice(0,7))}"></div>`:""}
      ${sel("rn-sit","Situação",[["","Todas"],["lancada","Lançadas"],["falta","Recebidas, falta lançar"],["ignorada","Ignoradas"],["cancelada","Canceladas"]],st.sit)}
      ${sel("rn-onde","Onde entrou",[["","Tudo"],["ambos","Estoque e Financeiro"],["est","Só no estoque"],["fin","Só no Financeiro"],["ret","Retiradas do contrato"],["aberto","Com conta em aberto"],["graos","Notas de grãos (venda / depósito)"],["rep","Lançadas em dobro"]],st.onde)}
      ${sel("rn-forn","Fornecedor",[["","Todos"],...forn.map(x=>[x,x])],st.forn)}
      ${sel("rn-dest","Nota em nome de",[["","Todos"],...dests.map(x=>[x,x])],st.dest)}
      <div class="field rn-busca"><label for="rn-q">Buscar</label><input type="search" id="rn-q" placeholder="Número da NF, produto, contrato…" value="${e(st.q)}"></div>
    </div>
    ${reps.length&&st.onde!=="rep"?`<button type="button" class="rn-aviso" data-rnrep="1">⚠️ ${reps.length} nota${reps.length>1?"s":""} lançada${reps.length>1?"s":""} em dobro: ${reps.slice(0,3).map(n=>"NF "+e(n.numero)).join(", ")}${reps.length>3?"…":""} <b>Ver</b></button>`:""}
    <div class="rn-res">
      <div class="rn-tot"><span>${e(P.rot)}</span><b>${fs.length} nota${fs.length===1?"":"s"}${totV?"":" · "+br(tot)}</b>${totV?`<small class="rn-cv">${totC?`Compras ${br(totC)} · `:""}Vendas ${br(totV)}</small>`:""}${aberto>0?`<small>Em aberto no Financeiro: ${br(aberto)}</small>`:""}</div>
      <div class="rn-chips">${["lancada","falta","ignorada","cancelada"].filter(k=>c(k).length).map(k=>`<button type="button" class="rn-chip rn-c-${k}${st.sit===k?" on":""}" data-rnsit="${k}"><b>${c(k).length}</b> ${(c(k).length===1?SIT1:SITN)[k]}<small>${br(cv(k))}</small></button>`).join("")}</div>
      ${Object.keys(porD).length>1||st.dest?`<div class="rn-dests">${Object.entries(porD).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div><span>${k==="Não informado"?"Sem nome na nota":"Em nome de "+e(k)}</span><b>${br(v)}</b></div>`).join("")}</div>`:""}
      ${topF.length>1?`<details class="rn-forn"><summary>Por fornecedor (${topF.length})</summary>${topF.map(([k,x])=>`<button type="button" class="rn-fl" data-rnforn="${e(k)}"><span>${e(k)}</span><span>${x.n} nota${x.n===1?"":"s"}</span><b class="mono">${br(x.v)}</b></button>`).join("")}</details>`:""}
      <div class="rn-bt"><button type="button" class="btn ghost fn-mini" id="rn-xlsx">Baixar Excel</button><button type="button" class="btn ghost fn-mini" id="rn-pdf">PDF para imprimir</button><span class="note" id="rn-st" role="status"></span></div>
    </div>
    ${fs.length?grupos.map(g=>`<h4 class="rn-mes"><span>${e(mesTxt(g.am))}</span><span>${g.ns.length} · ${br(g.ns.filter(n=>n.sit!=="cancelada"&&!n.remessa).reduce((s,n)=>s+n.valor,0))}</span></h4>${g.ns.map(linha).join("")}`).join(""):`<div class="empty">Nenhuma nota com esses filtros.${st.per!=="tudo"?`<br><button type="button" class="link" data-rnper="tudo">Ver todas as datas</button>`:""}</div>`}`;
  if(foco==="rn-q"){const q=$("#rn-q"); q.focus(); q.setSelectionRange(q.value.length,q.value.length)}
  const ch=(id,k)=>box.querySelector(id)?.addEventListener("change",ev=>{st[k]=ev.target.value; st.abertos.clear(); guarda(); render()});
  ch("#rn-per","per"); ch("#rn-mes","mes"); ch("#rn-sit","sit"); ch("#rn-onde","onde"); ch("#rn-forn","forn"); ch("#rn-dest","dest");
  box.querySelector("#rn-q").addEventListener("input",ev=>{st.q=ev.target.value; st.abertos.clear(); clearTimeout(render.t); render.t=setTimeout(render,250)});
  box.querySelectorAll("[data-rnab]").forEach(b=>b.onclick=()=>{const i=b.dataset.rnab; st.abertos.has(i)?st.abertos.delete(i):st.abertos.add(i); render()});
  box.querySelectorAll("[data-rnsit]").forEach(b=>b.onclick=()=>{st.sit=st.sit===b.dataset.rnsit?"":b.dataset.rnsit; st.abertos.clear(); guarda(); render()});
  box.querySelectorAll("[data-rnforn]").forEach(b=>b.onclick=()=>{st.forn=b.dataset.rnforn; st.abertos.clear(); guarda(); render()});
  box.querySelectorAll("[data-rnrep]").forEach(b=>b.onclick=()=>{st.onde="rep"; st.per="tudo"; st.sit=""; st.forn=""; st.dest=""; st.q=""; st.abertos=new Set(reps.map(chaveN)); guarda(); render()});
  box.querySelectorAll("[data-rntira]").forEach(b=>b.onclick=()=>{
    if(!b.dataset.ok){b.dataset.ok="1"; b.textContent="Confirmar: tirar a repetição"; return}
    const n=ls.find(x=>chaveN(x)===b.dataset.rntira); if(n){b.disabled=true; tirarRep(n).then(()=>{window.ponte?.aviso?.(`NF ${n.numero}: repetição tirada.`,true); render()}).catch(err=>{console.error(err); b.disabled=false; b.textContent="Não consegui. Tente de novo."})}});
  box.querySelectorAll("[data-rnper]").forEach(b=>b.onclick=()=>{st.per=b.dataset.rnper; guarda(); render()});
  box.querySelectorAll("[data-rnanx]").forEach(inp=>inp.onchange=async()=>{
    const n=ls.find(x=>chaveN(x)===inp.dataset.rnanx), fs=[...inp.files]; inp.value=""; if(!n||!fs.length) return;
    const st=box.querySelector(`[data-st="${CSS.escape(inp.dataset.rnanx)}"]`), novos=[];
    for(const f of fs){st&&(st.textContent=`Enviando ${f.name}…`); try{novos.push(await window.anxEnviar(f))}catch(err){st&&(st.textContent=window.anxErro?.(err,f)||"Não foi possível enviar.")}}
    if(!novos.length) return;
    try{await gravaAnexos(n,[...n.anexos,...novos]); window.ponte?.aviso?.(`NF ${n.numero}: ${novos.length} anexo${novos.length>1?"s":""} guardado${novos.length>1?"s":""}.`,true); render()}
    catch(err){console.error(err); st&&(st.textContent="Não foi possível guardar. Tente de novo.")}
  });
  box.querySelectorAll("[data-rnanxrm]").forEach(b=>b.onclick=async()=>{
    if(!b.dataset.ok){b.dataset.ok="1"; b.textContent="Tirar?"; b.classList.add("ok"); return}
    const n=ls.find(x=>chaveN(x)===b.dataset.rnanxrm); if(!n) return;
    try{await gravaAnexos(n,n.anexos.filter(a=>a.id!==b.dataset.id)); render()}catch(err){console.error(err)}
  });
  box.querySelectorAll("[data-rnfin]").forEach(b=>b.onclick=()=>window.finEditar?.(b.dataset.rnfin));
  box.querySelectorAll("[data-rnes]").forEach(b=>b.onclick=()=>window.esAbrir?.(b.dataset.rnes));
  box.querySelector("#rn-xlsx").onclick=baixarXlsx;
  box.querySelector("#rn-pdf").onclick=paraRelatorios;
}
/* guarda a lista de anexos em todos os lugares da nota: entradas do estoque, parcelas do Financeiro e, sem nenhum dos dois, a nota recebida (nfe) */
async function gravaAnexos(n,lista){
  const limpa=lista.map(a=>({id:a.id,nome:a.nome,tipo:a.tipo,mime:a.mime||"",tam:a.tam||0,em:a.em||new Date().toISOString()}));
  const porProd=new Map(); for(const t of n.ents){const a=porProd.get(t.e.id)||{e:t.e,is:new Set()}; a.is.add(t.i); porProd.set(t.e.id,a)}
  for(const {e:pr,is} of porProd.values()){const {id,...doc}=pr; doc.entradas=(pr.entradas||[]).map((x,k)=>is.has(k)?{...x,anexos:limpa}:x); await db.collection("estoque").doc(id).set(doc)}
  for(const l of n.parcs){const {id,...doc}=l; await db.collection("fin_lanc").doc(id).set({...doc,anexos:limpa})}
  if(n.nfeDoc&&(!n.ents.length&&!n.parcs.length||n.nfeDoc.anexos)){const {id,...doc}=n.nfeDoc; await db.collection("nfe").doc(id).set({...doc,anexos:limpa})}
}
/* tira as entradas/parcelas repetidas (ficam juntas na Lixeira) */
async function tirarRep(n){
  const p=window.ponte, lote="rep"+Date.now().toString(36); if(p) p.lote=lote;
  try{
    const porProd=new Map(); for(const t of n.repE){const a=porProd.get(t.e.id)||{e:t.e,is:new Set()}; a.is.add(t.i); porProd.set(t.e.id,a)}
    for(const {e:pr,is} of porProd.values()){
      const {id,...doc}=pr, fora=(pr.entradas||[]).filter((_,k)=>is.has(k));
      doc.entradas=(pr.entradas||[]).filter((_,k)=>!is.has(k));
      await window.ponte?.lixeira?.guardar?.({colecao:"estoque",docId:id,dados:{...doc,entradas:pr.entradas||[]},entradas:fora});
      await db.collection("estoque").doc(id).set(doc);
    }
    for(const l of n.repF) await db.collection("fin_lanc").doc(l.id).delete();
  }finally{if(p&&p.lote===lote) p.lote=null}
}
async function baixarXlsx(){
  const s=$("#rn-st"), P=periodo();
  if(typeof XLSX==="undefined"){s.textContent="Não consegui carregar o gerador de planilha. Verifique a internet."; return}
  if(typeof downloads==="undefined"||!downloads){s.textContent="Download indisponível nesta visualização."; return}
  const rows=ultimo.slice().sort((a,b)=>String(a.data).localeCompare(String(b.data))).map(n=>({"Data":dt(n.data),"NF":n.numero,"Fornecedor":n.emit,"Razão social":n.razao,"Em nome de":n.dest,"Valor (R$)":+n.valor.toFixed(2),
    "Situação":SIT[n.sit]+(n.repetida?" (lançada em dobro)":""),"Onde entrou":n.onde,"Retirada do contrato":n.retirada?"sim":"","Contrato":n.contrato,"Pagamento":pagTxt(n),"Em aberto (R$)":n.aberto?+n.aberto.toFixed(2):"","Produtos":n.prods.join(", "),"Chave":n.chave}));
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"Sem notas":""}]);
  ws["!cols"]=Object.keys(rows[0]||{a:1}).map(k=>({wch:Math.min(50,Math.max(10,k.length+2,...rows.slice(0,200).map(r=>String(r[k]??"").length)))}));
  XLSX.utils.book_append_sheet(wb,ws,"Notas");
  const nome=`notas-fiscais-${P.rot.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-")}.xlsx`;
  try{const r=await downloads.save({filename:nome,data:new Blob([XLSX.write(wb,{bookType:"xlsx",type:"array"})],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}); s.textContent=r?.status==="saved"?"Planilha salva.":""}
  catch(err){s.textContent=err?.code==="declined"?"":"Não foi possível salvar o arquivo."}
}
/* PDF: abre Painel → Relatórios com o relatório de notas e os mesmos filtros */
function paraRelatorios(){
  const P=periodo();
  show("relatorios");
  setTimeout(()=>{try{
    $("#rl-tipo").value="nfs"; rlMontar();
    const per=$("#rl-per");
    if(st.per.startsWith("s")) per.value=st.per; else if(st.per==="tudo") per.value="todas"; else {per.value="pers"; $("#rl-de").value=P.de; $("#rl-ate").value=P.ate.slice(0,8)+String(new Date(+P.ate.slice(0,4),+P.ate.slice(5,7),0).getDate()).padStart(2,"0")}
    if($("#rl-nfsit")) $("#rl-nfsit").value=st.sit; if($("#rl-nfforn")) $("#rl-nfforn").value=st.forn; if($("#rl-nfdest")) $("#rl-nfdest").value=st.dest;
    per.dispatchEvent(new Event("change"));
  }catch(err){console.error(err)}},120);
}

/* troca "Para lançar" × "Relatório de notas" */
function vista(k){
  document.querySelectorAll(".rn-seg [data-rnv]").forEach(b=>b.setAttribute("aria-selected",b.dataset.rnv===k));
  const a=$("#rn-lancar"), r=$("#rn-rel"); if(!a||!r) return;
  a.hidden=k!=="lancar"; r.hidden=k!=="rel";
  try{localStorage.setItem("rn-vista",k)}catch{}
  if(k==="rel") render();
}
document.addEventListener("click",ev=>{const b=ev.target.closest?.("[data-rnv]"); if(!b) return; vista(b.dataset.rnv); if(b.closest("#rn-rel")) $("#es-abas")?.scrollIntoView({block:"start"})});
window.rnAbrir=()=>{show("estoque"); window.esAba?.("notas"); vista("rel")};
try{if(localStorage.getItem("rn-vista")==="rel") vista("rel")}catch{}
/* redesenha quando chegam dados (nePintar é chamado pelo estoque, pelo Financeiro e pelas notas) */
let agendado=0;
const pede=()=>{if(agendado) return; agendado=setTimeout(()=>{agendado=0; if(!$("#rn-rel")?.hidden&&!$("#rn-rel")?.contains(document.activeElement)) render()},300)};
const orig=window.nePintar;
if(orig) window.nePintar=function(){const r=orig.apply(this,arguments); pede(); return r};
})();
