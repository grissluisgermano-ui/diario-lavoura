/* Diário da Lavoura — DANFE a partir do XML da NF-e.
   danfeAbrir(xmlTexto)  → mostra a DANFE numa tela por cima do app (com Imprimir / salvar PDF)
   danfeGuardar(xmlTexto) → guarda o XML em nfe/{chave} {xml, numero, emit, data} para ver depois
   danfeDeChave(chave)    → abre a DANFE de uma nota já guardada
   Coleção nfe entra no backup (danfeColecao). */
(function(){
"use strict";
let nfeDocs=[];

/* ---------- leitura do XML ---------- */
const g=(el,n)=>el?.getElementsByTagNameNS("*",n)[0]?.textContent?.trim()||"";
const todos=(el,n)=>el?[...el.getElementsByTagNameNS("*",n)]:[];
function ler(xml){
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  if(doc.querySelector("parsererror")) throw new Error("xml");
  const inf=todos(doc,"infNFe")[0]; if(!inf) throw new Error("xml");
  const ide=todos(inf,"ide")[0], emit=todos(inf,"emit")[0], dest=todos(inf,"dest")[0];
  const end=e=>({lgr:g(e,"xLgr"),nro:g(e,"nro"),cpl:g(e,"xCpl"),bairro:g(e,"xBairro"),mun:g(e,"xMun"),uf:g(e,"UF"),cep:g(e,"CEP"),fone:g(e,"fone")});
  const prot=todos(doc,"infProt")[0], tot=todos(inf,"ICMSTot")[0], transp=todos(inf,"transp")[0], vol=todos(transp,"vol")[0];
  const chave=(g(doc,"chNFe")||inf.getAttribute("Id")||"").replace(/\D/g,"");
  const itens=todos(inf,"det").map(d=>{const p=todos(d,"prod")[0], icms=todos(d,"ICMS")[0]?.firstElementChild, ipi=todos(d,"IPI")[0];
    return {cod:g(p,"cProd"),desc:g(p,"xProd"),ncm:g(p,"NCM"),cfop:g(p,"CFOP"),un:g(p,"uCom"),q:+g(p,"qCom")||0,vu:+g(p,"vUnCom")||0,vt:+g(p,"vProd")||0,desc0:+g(p,"vDesc")||0,
      cst:(g(icms,"orig")||"")+(g(icms,"CST")||g(icms,"CSOSN")||""),bc:+g(icms,"vBC")||0,vicms:+g(icms,"vICMS")||0,picms:+g(icms,"pICMS")||0,vipi:+g(ipi,"vIPI")||0,pipi:+g(ipi,"pIPI")||0,
      info:g(d,"infAdProd")}});
  return {chave,numero:g(ide,"nNF"),serie:g(ide,"serie"),emissao:g(ide,"dhEmi")||g(ide,"dEmi"),saida:g(ide,"dhSaiEnt")||g(ide,"dSaiEnt"),natOp:g(ide,"natOp"),tpNF:g(ide,"tpNF"),
    emit:{nome:g(emit,"xNome"),fant:g(emit,"xFant"),doc:g(emit,"CNPJ")||g(emit,"CPF"),ie:g(emit,"IE"),end:end(todos(emit,"enderEmit")[0])},
    dest:{nome:g(dest,"xNome"),doc:g(dest,"CNPJ")||g(dest,"CPF"),ie:g(dest,"IE"),end:end(todos(dest,"enderDest")[0])},
    prot:{n:g(prot,"nProt"),data:g(prot,"dhRecbto"),cStat:g(prot,"cStat")},
    tot:{vBC:+g(tot,"vBC")||0,vICMS:+g(tot,"vICMS")||0,vBCST:+g(tot,"vBCST")||0,vST:+g(tot,"vST")||0,vProd:+g(tot,"vProd")||0,vFrete:+g(tot,"vFrete")||0,vSeg:+g(tot,"vSeg")||0,
      vDesc:+g(tot,"vDesc")||0,vOutro:+g(tot,"vOutro")||0,vIPI:+g(tot,"vIPI")||0,vNF:+g(tot,"vNF")||0,vTotTrib:+g(tot,"vTotTrib")||0},
    transp:{mod:g(transp,"modFrete"),nome:g(todos(transp,"transporta")[0],"xNome"),doc:g(todos(transp,"transporta")[0],"CNPJ")||g(todos(transp,"transporta")[0],"CPF"),
      placa:g(todos(transp,"veicTransp")[0],"placa"),qVol:g(vol,"qVol"),esp:g(vol,"esp"),pesoB:+g(vol,"pesoB")||0,pesoL:+g(vol,"pesoL")||0},
    dups:todos(inf,"dup").map(d=>({n:g(d,"nDup"),venc:g(d,"dVenc"),v:+g(d,"vDup")||0})),
    infCpl:g(todos(inf,"infAdic")[0],"infCpl").replace(/_/g," "),infFisco:g(todos(inf,"infAdic")[0],"infAdFisco"),itens};
}

/* ---------- formatos ---------- */
const e=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const v2=n=>Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const q4=n=>Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:4});
const docF=d=>{d=String(d||"").replace(/\D/g,""); return d.length===14?d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5"):d.length===11?d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,"$1.$2.$3-$4"):d};
const cepF=c=>String(c||"").replace(/^(\d{5})(\d{3})$/,"$1-$2");
const dt=s=>{if(!s) return ""; const [d,h]=s.split("T"); const [y,m,dd]=d.split("-"); return `${dd}/${m}/${y}`};
const hr=s=>s&&s.includes("T")?s.split("T")[1].slice(0,8):"";
const nfF=n=>String(n||"").padStart(9,"0").replace(/^(\d{3})(\d{3})(\d{3})$/,"$1.$2.$3");
const chaveF=c=>String(c||"").replace(/(\d{4})(?=\d)/g,"$1 ");
const FRETE={"0":"0 - Emitente","1":"1 - Destinatário","2":"2 - Terceiros","3":"3 - Próprio Rem.","4":"4 - Próprio Dest.","9":"9 - Sem frete"};
const endTxt=x=>[x.lgr,x.nro,x.cpl].filter(Boolean).join(", ");

/* ---------- código de barras da chave (Code 128 C) ---------- */
const C128=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232"];
function barras(chave){
  if(!/^\d+$/.test(chave)||chave.length%2) return "";
  const vals=[105]; for(let i=0;i<chave.length;i+=2) vals.push(+chave.slice(i,i+2));
  let soma=105; for(let i=1;i<vals.length;i++) soma+=i*vals[i]; vals.push(soma%103);
  const pad=vals.map(v=>C128[v]).join("")+"2331112";
  let x=10, rects=""; [...pad].forEach((w,i)=>{w=+w; if(i%2===0) rects+=`<rect x="${x}" y="0" width="${w}" height="40"/>`; x+=w});
  return `<svg class="dn-bar" viewBox="0 0 ${x+10} 40" preserveAspectRatio="none" role="img" aria-label="Código de barras da chave de acesso">${rects}</svg>`;
}

/* ---------- DANFE ---------- */
function danfeHTML(n){
  const c=(rot,val,cls="")=>`<div class="dn-c ${cls}"><span>${rot}</span><b>${val||"&nbsp;"}</b></div>`;
  const ent=n.tpNF==="0";
  const canc=n.prot.cStat&&n.prot.cStat!=="100"&&n.prot.cStat!=="150";
  return `<div class="dn-folha">
  ${canc?`<div class="dn-marca">SEM VALOR FISCAL — situação ${e(n.prot.cStat)}</div>`:""}
  <div class="dn-canhoto">
    <div class="dn-c dn-g"><span>Recebemos de ${e(n.emit.nome)} os produtos constantes da nota fiscal indicada ao lado</span><b>&nbsp;</b></div>
    <div class="dn-c"><span>Data de recebimento</span><b>&nbsp;</b></div><div class="dn-c dn-g"><span>Identificação e assinatura do recebedor</span><b>&nbsp;</b></div>
    <div class="dn-c dn-nfe"><b>NF-e</b><b>Nº ${nfF(n.numero)}</b><b>Série ${e(n.serie)}</b></div>
  </div>
  <div class="dn-topo">
    <div class="dn-emit"><b class="dn-emit-n">${e(n.emit.nome)}</b><span>${e(endTxt(n.emit.end))}</span><span>${e([n.emit.end.bairro,n.emit.end.mun+(n.emit.end.uf?" - "+n.emit.end.uf:"")].filter(Boolean).join(" - "))}</span><span>${n.emit.end.cep?"CEP "+e(cepF(n.emit.end.cep)):""}${n.emit.end.fone?" · Fone "+e(n.emit.end.fone):""}</span></div>
    <div class="dn-tit"><b>DANFE</b><span>Documento Auxiliar da Nota Fiscal Eletrônica</span><div class="dn-es"><span>0 - Entrada<br>1 - Saída</span><b>${ent?"0":"1"}</b></div><b>Nº ${nfF(n.numero)}</b><b>Série ${e(n.serie)}</b><span>Folha 1/1</span></div>
    <div class="dn-chave">${barras(n.chave)}<div class="dn-c"><span>Chave de acesso</span><b class="dn-mono">${chaveF(n.chave)}</b></div><p>Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz autorizadora</p></div>
  </div>
  <div class="dn-l">${c("Natureza da operação",e(n.natOp),"dn-g")}${c("Protocolo de autorização de uso",n.prot.n?`${e(n.prot.n)} — ${dt(n.prot.data)} ${hr(n.prot.data)}`:"Sem protocolo no XML")}</div>
  <div class="dn-l">${c("Inscrição estadual",e(n.emit.ie))}${c("Insc. est. do subst. tributário","")}${c("CNPJ / CPF",docF(n.emit.doc))}</div>
  <h4>Destinatário / remetente</h4>
  <div class="dn-l">${c("Nome / razão social",e(n.dest.nome),"dn-g")}${c("CNPJ / CPF",docF(n.dest.doc))}${c("Data da emissão",dt(n.emissao))}</div>
  <div class="dn-l">${c("Endereço",e(endTxt(n.dest.end)),"dn-g")}${c("Bairro / distrito",e(n.dest.end.bairro))}${c("CEP",cepF(n.dest.end.cep))}${c("Data da saída/entrada",dt(n.saida))}</div>
  <div class="dn-l">${c("Município",e(n.dest.end.mun),"dn-g")}${c("Fone / fax",e(n.dest.end.fone))}${c("UF",e(n.dest.end.uf))}${c("Inscrição estadual",e(n.dest.ie))}${c("Hora da saída/entrada",hr(n.saida))}</div>
  ${n.dups.length?`<h4>Fatura / duplicatas</h4><div class="dn-dups">${n.dups.map(d=>`<div class="dn-dup"><span>Nº ${e(d.n)}</span><span>Venc. ${dt(d.venc)}</span><b>R$ ${v2(d.v)}</b></div>`).join("")}</div>`:""}
  <h4>Cálculo do imposto</h4>
  <div class="dn-l dn-num">${c("Base de cálculo do ICMS",v2(n.tot.vBC))}${c("Valor do ICMS",v2(n.tot.vICMS))}${c("Base cálc. ICMS subst.",v2(n.tot.vBCST))}${c("Valor do ICMS subst.",v2(n.tot.vST))}${c("Valor total dos produtos",v2(n.tot.vProd))}</div>
  <div class="dn-l dn-num">${c("Valor do frete",v2(n.tot.vFrete))}${c("Valor do seguro",v2(n.tot.vSeg))}${c("Desconto",v2(n.tot.vDesc))}${c("Outras despesas",v2(n.tot.vOutro))}${c("Valor do IPI",v2(n.tot.vIPI))}${c("Valor total da nota",v2(n.tot.vNF),"dn-total")}</div>
  <h4>Transportador / volumes transportados</h4>
  <div class="dn-l">${c("Razão social",e(n.transp.nome),"dn-g")}${c("Frete por conta",FRETE[n.transp.mod]||e(n.transp.mod))}${c("Placa",e(n.transp.placa))}${c("CNPJ / CPF",docF(n.transp.doc))}</div>
  <div class="dn-l">${c("Quantidade",e(n.transp.qVol))}${c("Espécie",e(n.transp.esp),"dn-g")}${c("Peso bruto",n.transp.pesoB?q4(n.transp.pesoB):"")}${c("Peso líquido",n.transp.pesoL?q4(n.transp.pesoL):"")}</div>
  <h4>Dados dos produtos / serviços</h4>
  <div class="dn-tab"><table><thead><tr><th>Código</th><th class="dn-desc">Descrição do produto / serviço</th><th>NCM/SH</th><th>CST</th><th>CFOP</th><th>Un</th><th>Quant.</th><th>Valor unit.</th><th>Valor total</th><th>BC ICMS</th><th>Valor ICMS</th><th>Valor IPI</th><th>Alíq. ICMS</th><th>Alíq. IPI</th></tr></thead>
    <tbody>${n.itens.map(i=>`<tr><td>${e(i.cod)}</td><td class="dn-desc">${e(i.desc)}${i.info?`<small>${e(i.info)}</small>`:""}</td><td>${e(i.ncm)}</td><td>${e(i.cst)}</td><td>${e(i.cfop)}</td><td>${e(i.un)}</td><td>${q4(i.q)}</td><td>${q4(i.vu)}</td><td>${v2(i.vt)}</td><td>${v2(i.bc)}</td><td>${v2(i.vicms)}</td><td>${v2(i.vipi)}</td><td>${q4(i.picms)}</td><td>${q4(i.pipi)}</td></tr>`).join("")}</tbody></table></div>
  <h4>Dados adicionais</h4>
  <div class="dn-l dn-adic">${c("Informações complementares",e(n.infCpl)+(n.tot.vTotTrib?`<br>Valor aproximado dos tributos: R$ ${v2(n.tot.vTotTrib)}`:""),"dn-g")}${c("Reservado ao fisco",e(n.infFisco))}</div>
  <p class="dn-rod">Gerada pelo Diário da Lavoura a partir do XML da NF-e. Para fins fiscais, vale o XML autorizado.</p>
</div>`;
}

/* ---------- tela ---------- */
function ajusta(){const ov=document.getElementById("danfe-ov"); if(!ov||ov.hidden) return; const f=ov.querySelector(".dn-folha"); if(!f) return;
  const w=ov.querySelector(".dn-area").clientWidth-16; f.style.zoom=Math.min(1,w/820)}
function abrirHTML(html,titulo){
  let ov=document.getElementById("danfe-ov");
  if(!ov){ov=document.createElement("div"); ov.id="danfe-ov"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); document.body.appendChild(ov)}
  ov.innerHTML=`<div class="dn-bar-top"><b>${e(titulo)}</b><span class="dn-acoes"><button type="button" class="btn ghost" id="dn-print">Imprimir / salvar PDF</button><button type="button" class="btn" id="dn-fechar">Fechar</button></span></div><div class="dn-area">${html}</div>`;
  ov.hidden=false; document.documentElement.classList.add("dn-aberta");
  ov.querySelector("#dn-fechar").onclick=fechar; ov.querySelector("#dn-print").onclick=()=>window.print();
  ov.querySelector("#dn-fechar").focus();
  requestAnimationFrame(ajusta);
}
function fechar(){const ov=document.getElementById("danfe-ov"); if(ov){ov.hidden=true; ov.innerHTML=""} document.documentElement.classList.remove("dn-aberta")}
addEventListener("resize",ajusta);
addEventListener("keydown",ev=>{if(ev.key==="Escape") fechar()});

window.danfeAbrir=function(xml){
  try{const n=ler(xml); abrirHTML(danfeHTML(n),`DANFE · NF ${n.numero} · ${window.finNomeEmit?window.finNomeEmit(n.emit.nome,n.emit.fant):n.emit.nome}`)}
  catch{abrirHTML(`<p class="dn-erro">Não consegui montar a DANFE: o arquivo não parece ser o XML de uma NF-e.</p>`,"DANFE")}
};
window.danfeGuardar=async function(xml){
  try{const n=ler(xml); if(!n.chave||typeof db==="undefined"||!db) return;
    if(nfeDocs.some(d=>d.id===n.chave)) return;
    await db.collection("nfe").doc(n.chave).set({xml,numero:n.numero,emit:n.emit.nome,data:(n.emissao||"").slice(0,10),criadoEm:new Date().toISOString()})}
  catch(err){console.warn("XML não guardado",err)}
};
window.danfeDeChave=async function(chave){
  const local=nfeDocs.find(d=>d.id===chave);
  if(local?.xml) return window.danfeAbrir(local.xml);
  try{const s=await db.collection("nfe").doc(chave).get(); if(s.exists&&s.data().xml) return window.danfeAbrir(s.data().xml)}catch{}
  abrirHTML(`<p class="dn-erro">O XML desta nota não está guardado no app (ela foi lançada antes da DANFE existir, ou à mão). Importe o XML de novo para ver a DANFE.</p>`,"DANFE");
};
window.danfeTem=chave=>!!chave&&nfeDocs.some(d=>d.id===chave);
window.danfeColecao=()=>nfeDocs;
window.danfeInicia=function(){
  if(window.danfeInicia.ok||typeof db==="undefined"||!db) return; window.danfeInicia.ok=true;
  db.collection("nfe").onSnapshot(s=>{nfeDocs=s.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.xml); window.finAgenda?.(); if(typeof renderEstoque==="function") try{renderEstoque()}catch{} window.nePintar()},()=>{});
};
if(typeof col!=="undefined"&&col) window.danfeInicia();
/* ---------- Notas recebidas por e-mail (o script do Google grava em nfe/{chave} com origem "email") ---------- */
function lancada(chave){
  if((typeof estoque!=="undefined"?estoque:[]).some(p=>(p.entradas||[]).some(x=>x.chave===chave))) return true;
  if((window.finColecoes?.().fin_lanc||[]).some(l=>l.chave===chave)) return true;
  if(nfeDocs.some(d=>d.id===chave&&d.registrada)) return true; // entrega de grãos no depósito guardada
  return typeof grMovs==="function"&&grMovs().some(m=>m.chave===chave); // venda de grãos pela nota
}
const pendentesTodas=()=>nfeDocs.filter(d=>d.origem==="email"&&!d.ignorada&&!lancada(d.id)).sort((a,b)=>String(b.data).localeCompare(String(a.data)));
/* notas com mais de 90 dias vão para "Notas antigas" (lançadas por mês, em lote-notas.js) e não contam na bolinha */
const corte=()=>{const d=new Date(); d.setDate(d.getDate()-90); return d.toISOString().slice(0,10)};
const pendentes=()=>{const c=corte(); return pendentesTodas().filter(d=>!d.data||d.data>=c)};
window.nePendentesAntigas=()=>{const c=corte(); return pendentesTodas().filter(d=>d.data&&d.data<c)};
window.neLancada=lancada;
const arquivo=d=>new File([d.xml],`NFe${d.id}.xml`,{type:"text/xml"});
function resumoNota(d){
  let fin=null; try{fin=window.finDadosXml?.(new DOMParser().parseFromString(d.xml,"application/xml"))}catch{}
  return {emit:fin?.emit||d.emit||"Fornecedor",razao:fin?.emitRazao||"",retirada:!!fin?.retirada,contrato:fin?.contrato||"",dest:fin?.dest||d.dest||"",total:fin?.total||d.total||0,parc:fin?.dups?.length||1,itens:fin?.itens?.length||0,
    venc:fin?.dups?.length?fin.dups.map(x=>x.venc).sort()[0]:"",vg:window.vgLe?.(d.xml)||null};
}
const ignoradas=()=>nfeDocs.filter(d=>d.origem==="email"&&d.ignorada&&!lancada(d.id)).sort((a,b)=>String(b.data).localeCompare(String(a.data)));
/* a ponte guarda uma cópia na Lixeira (Histórico) por 30 dias; fica um "marcador" sem o XML para o script do Gmail não trazer a nota de novo */
const excluirNota=async id=>{const d=nfeDocs.find(x=>x.id===id); await db.collection("nfe").doc(id).delete();
  try{await db.collection("nfe").doc(id).set({excluida:true,excluidaEm:new Date().toISOString(),numero:d?.numero||"",emit:d?.emit||"",data:d?.data||""})}catch{}};
function pintaIgnoradas(){
  const el=document.getElementById("ne-ign"); if(!el) return;
  const is=ignoradas(); el.hidden=!is.length; if(!is.length){el.innerHTML="";return}
  const aberto=el.open, br=x=>Number(x||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  el.innerHTML=`<summary>Notas ignoradas <span class="note">(${is.length})</span></summary>
    <p class="note">Notas que vocês marcaram para ignorar. "Trazer de volta" faz a nota voltar para a lista de lançar. "Excluir" tira a nota do app (fica 30 dias na Lixeira, em Histórico).</p>
    ${is.map(d=>{const r=resumoNota(d); return `<article class="ne-nota ne-ignorada">
      <div class="rec-top"><b>NF ${e(d.numero||"")} · ${e(r.emit)}</b><span class="mono">${br(r.total)}</span></div>
      <div class="rec-campos"><span>${d.data?dt(d.data):""}</span>${r.razao&&r.razao.toLowerCase().replace(/\W/g,"")!==String(r.emit).toLowerCase().replace(/\W/g,"")?`<span>${e(r.razao)}</span>`:""}${r.dest?`<span>Em nome de <b>${e(r.dest)}</b></span>`:""}<span>${r.itens} ite${r.itens===1?"m":"ns"}</span>${d.cancelada?`<span class="pill venc">Nota cancelada</span>`:""}</div>
      <div class="rec-actions"><button type="button" class="btn ghost fn-mini" data-nev="${d.id}">Trazer de volta</button><button type="button" class="link" data-danfe="${d.id}">DANFE</button><button type="button" class="link danger" data-nex="${d.id}">Excluir</button></div>
    </article>`}).join("")}`;
  el.open=aberto;
  const doc=id=>nfeDocs.find(x=>x.id===id);
  el.querySelectorAll("[data-nev]").forEach(b=>b.onclick=async()=>{b.disabled=true; const {id,ignorada,...d}=doc(b.dataset.nev); try{await db.collection("nfe").doc(id).set(d)}catch{b.disabled=false}});
  el.querySelectorAll("[data-nex]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar exclusão",()=>excluirNota(b.dataset.nex)));
}
window.nePintar=function(){
  const box=document.getElementById("ne-box"), av=document.getElementById("fn-ne"); if(!box) return;
  pintaIgnoradas();
  try{window.nePintarAntigas?.()}catch(e){console.error(e)}
  const ps=pendentes();
  box.hidden=!ps.length; if(av) av.hidden=!ps.length;
  window.marca?.("estoque:notas",ps.length);
  const qn=document.getElementById("es-ne-n"); if(qn){qn.hidden=!ps.length; qn.textContent=ps.length}
  if(av&&ps.length){av.innerHTML=`<span><b>${ps.length} nota${ps.length===1?"":"s"} recebida${ps.length===1?"":"s"} por e-mail</b> esperando lançamento.</span><button type="button" class="link" id="ne-ir">Ver em Estoque</button>`;
    av.querySelector("#ne-ir").onclick=()=>{show("estoque"); window.esAba?.("notas"); document.getElementById("es-abas")?.scrollIntoView({block:"start",behavior:"smooth"})}}
  if(!ps.length){box.innerHTML="";return}
  const br=x=>Number(x||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  box.innerHTML=`<div class="row" style="justify-content:space-between"><h3 class="sub-h">Notas recebidas por e-mail</h3><span class="note">${ps.length} para lançar</span></div>
    <p class="note">Chegaram com o XML anexado. Lance no estoque (entra também no Financeiro) ou só no Financeiro, quando não for produto de estoque.</p>
    ${ps.slice(0,30).map(d=>{const r=resumoNota(d); return `<article class="ne-nota${d.cancelada?" ne-canc":""}">
      <div class="rec-top"><b>NF ${e(d.numero||"")} · ${e(r.emit)}</b><span class="mono">${br(r.total)}</span></div>
      <div class="rec-campos"><span>${d.data?dt(d.data):""}</span>${r.razao&&r.razao.toLowerCase().replace(/\W/g,"")!==String(r.emit).toLowerCase().replace(/\W/g,"")?`<span>${e(r.razao)}</span>`:""}${r.dest?`<span>Em nome de <b>${e(r.dest)}</b></span>`:""}${r.vg?`<span class="ne-grao">${e(window.vgResumo(r.vg))}</span>`:`<span>${r.itens} ite${r.itens===1?"m":"ns"}</span>`}${r.retirada?`<span class="ne-ret">📦 Retirada do contrato ${e(r.contrato)} · já paga</span>`:`<span>${r.parc} parcela${r.parc===1?"":"s"}${r.venc?` · vence ${dt(r.venc)}`:""}</span>`}${d.cancelada?`<span class="pill venc">Nota cancelada</span>`:""}</div>
      <div class="rec-actions">${d.cancelada?"":r.vg&&r.vg.tipo!=="devolucao"?`<button type="button" class="btn fn-mini" data-nevg="${d.id}">${r.vg.tipo==="venda"?"🌾 Lançar venda de grãos":"📦 Conferir e guardar"}</button>`:`<button type="button" class="btn fn-mini" data-nee="${d.id}">Lançar no estoque</button><button type="button" class="btn ghost fn-mini" data-nef="${d.id}">Só no Financeiro</button>`}<button type="button" class="link" data-danfe="${d.id}">DANFE</button><button type="button" class="link" data-nei="${d.id}">Ignorar</button><button type="button" class="link danger" data-nex="${d.id}">Excluir</button></div>
    </article>`}).join("")}${ps.length>30?`<p class="note">Mostrando 30 de ${ps.length}.</p>`:""}`;
  const doc=id=>nfeDocs.find(x=>x.id===id);
  box.querySelectorAll("[data-nee]").forEach(b=>b.onclick=()=>{show("estoque"); window.nfImportarArquivo?.(arquivo(doc(b.dataset.nee))); setTimeout(()=>document.getElementById("nf-rev")?.scrollIntoView({block:"start",behavior:"smooth"}),300)});
  box.querySelectorAll("[data-nevg]").forEach(b=>b.onclick=()=>window.vgAbrir?.(doc(b.dataset.nevg).xml));
  box.querySelectorAll("[data-nef]").forEach(b=>b.onclick=()=>{show("fin_contas"); window.finImportarXml?.(arquivo(doc(b.dataset.nef)))});
  box.querySelectorAll("[data-nei]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar: ignorar",async()=>{const {id,...d}=doc(b.dataset.nei); await db.collection("nfe").doc(id).set({...d,ignorada:true})}));
  box.querySelectorAll("[data-nex]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar exclusão",()=>excluirNota(b.dataset.nex)));
};

/* abre a DANFE de qualquer botão com data-danfe="<chave>" */
document.addEventListener("click",ev=>{const b=ev.target.closest?.("[data-danfe]"); if(!b) return; ev.preventDefault(); window.danfeDeChave(b.dataset.danfe)});
})();
