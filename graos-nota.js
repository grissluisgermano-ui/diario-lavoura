/* Notas de grãos emitidas pela cooperativa/comprador (tpNF = 0, "nota de entrada"):
   - venda   ("FIXAÇÃO DE PREÇO", compra de produção — CFOP 1132, 1101, 1102…): sai do saldo de grãos da Lavoura (movimento `venda`)
             e entra no Financeiro como receita (bruto) + os descontos retidos na nota (Senar/Funrural/RAT = impostos; retenção de capital = cota capital, fora do custo);
   - remessa ("REMESSA PARA COOPERATIVA", depósito — CFOP 1131, 1905, 1934): é o grão entregue no depósito (o preço é só fiscal).
             Não mexe em saldo nem dinheiro: só confere com o romaneio e guarda a nota (`nfe.registrada`);
   - devolucao (devolução de compra): só é identificada (lançar como antes).
   window.vgLe(xml) lê; window.vgAbrir(xml,{nfeId}) abre a conferência; window.vgLancar(v,o) / window.vgGuardar(v,xml) gravam. */
(function(){
const $=s=>document.querySelector(s);
const e=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const br=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const nm=(v,d=2)=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:d});
const dt=iso=>iso?iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4):"";
const N=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
const dias=(a,b)=>Math.round((Date.parse(a)-Date.parse(b))/864e5);
const pn=s=>Number(String(s||"").replace(/\./g,"").replace(",","."))||0;
const hoje=()=>{const d=new Date(); return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const CULT=[[/SOJA/,"Soja"],[/MILHO/,"Milho"],[/TRIGO/,"Trigo"],[/FEIJ/,"Feijão"],[/AVEIA/,"Aveia"],[/CEVADA/,"Cevada"],[/CANOLA/,"Canola"],[/SORGO/,"Sorgo"],[/TRITICALE/,"Triticale"]];
const GRAO=/\b(SOJA|MILHO|TRIGO|FEIJ\w*|AVEIA|CEVADA|CANOLA|SORGO|TRITICALE)\b/;

/* depósito cadastrado que corresponde ao emitente (Coamo, C.Vale…) */
function localDe(emit,razao){
  const deps=(typeof propCfg!=="undefined"&&propCfg?.depositos)||[];
  const a=N(emit).replace(/\W/g,""), b=N(razao).replace(/\W/g,"");
  return deps.find(d=>{const k=N(d).replace(/\W/g,""); return k&&(a.includes(k)||k.includes(a)||b.includes(k))})||emit||"";
}
const cache=new Map();
function le(xml){
  if(!xml) return null;
  const ck=xml.length+":"+xml.slice(-120); if(cache.has(ck)) return cache.get(ck);
  let r=null;
  try{
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    const g=(t,el=doc)=>el.getElementsByTagNameNS("*",t)[0]?.textContent?.trim()||"";
    if(g("tpNF")!=="0"){cache.set(ck,null); return null}
    const fin=window.finDadosXml?.(doc)||{};
    const nat=N(g("natOp")), dets=[...doc.getElementsByTagNameNS("*","det")];
    const its=dets.map(d=>({cfop:g("CFOP",d),prod:N(g("xProd",d)),un:N(g("uCom",d)),q:Number(g("qCom",d))||0,v:Number(g("vProd",d))||0,ad:g("infAdProd",d)}));
    const cfops=its.map(i=>i.cfop), cf=re=>cfops.some(c=>re.test(c));
    const graos=its.filter(i=>GRAO.test(i.prod)&&!/SEMENTE|\bSTE\b|TRAT\./.test(i.prod));
    let tipo=null;
    if(/DEVOLU/.test(nat)||cf(/^[12](20[1-9]|21[06]|41[01]|50[34]|55[3-6]|66[0-2])$/)) tipo="devolucao";
    else if(graos.length){
      if(/RETORNO/.test(nat)||cf(/^[12]90[67]$/)) tipo=null;
      else if(/REMESSA|DEPOSITO/.test(nat)||cf(/^[12](131|905|934)$/)) tipo="remessa";
      else tipo="venda";
    }
    const cpl=g("infCpl"), CPL=N(cpl);
    r={tipo,natOp:g("natOp"),chave:fin.chave||"",numero:fin.numero||g("nNF"),data:fin.data||g("dhEmi").slice(0,10),emit:fin.emit||"",razao:fin.emitRazao||"",dest:fin.dest||"",total:Number(g("vNF"))||fin.total||0};
    if(tipo==="venda"||tipo==="remessa"){
      let kg=0, v=0; for(const i of graos){kg+=/^(T|TON|TONELADA)$/.test(i.un)?i.q*1000:/^(SC|SACA|SACAS)$/.test(i.un)?i.q*60:i.q; v+=i.v}
      const p0=graos[0]; r.cultura=(CULT.find(([re])=>re.test(p0.prod))||[0,""])[1]; r.produto=p0.prod;
      r.kg=kg; r.sacas=Math.round(kg/60*100)/100; r.local=localDe(r.emit,r.razao);
      const sc60=(CPL.match(/(?:UNITARIO PARA CALCULO EM SC60|UNITARIO EM SC60)\s*:?\s*R\$\s*([\d.]+,\d+)/)||N(p0.ad).match(/SC60\s*:?\s*R\$\s*([\d.]+,\d+)/)||[])[1];
      r.precoSc=sc60?pn(sc60):(r.sacas?v/r.sacas:0);
      const sf=(N(p0.ad+" "+cpl).match(/SAFRA\s*:?\s*(\d{4})\s*\/\s*(\d{4})/)||[]); if(sf[1]) r.safra=+sf[1];
      r.bruto=r.total||v;
      // descontos retidos no texto da nota — cada empresa escreve de um jeito:
      // Coamo "CONTRIBUIÇÃO SENAR : 9,16" · Casarão "… SENAR: 0,2%. R$ 48,07" (o valor é o último "R$" do trecho, nunca a %)
      r.descontos=[];
      for(const p0 of CPL.split(/[_\n|;]+|\s-\s/)){ const parte=p0.replace(/BASE[^:=]*[:=]\s*[\d.,]+-?/g,"");
        const m=parte.match(/CAPITAL|PREVIDENCIARIA|FUNRURAL|SENAR|GILRAT|\bRAT\b|\bINSS\b/); if(!m) continue;
        if(/APROX|IBPT|LIQUIDO|TOTAL/.test(parte)) continue;
        const rs=[...parte.matchAll(/R\$\s*([\d.]+,\d{2})(?!\s*%)/g)], cl=parte.match(/:\s*([\d.]+,\d{2})\s*$/);
        const val=rs.length?pn(rs[rs.length-1][1]):cl?pn(cl[1]):0; if(!(val>0)) continue;
        const k=/CAPITAL/.test(parte)?"capital":"impostos";
        const nome=k==="capital"?"Retenção para aumento de capital":/SENAR/.test(parte)?"Contribuição Senar":/GILRAT|\bRAT\b/.test(parte)?"Contribuição RAT":"Contribuição previdenciária rural (Funrural)";
        r.descontos.push({k,nome,valor:val});
      }
      // líquido: o que a nota diz ("LIQUIDO A PAGAR"), senão o líquido da fatura (cobr/fat/vLiq), senão bruto − descontos
      const liq=(CPL.match(/LIQUIDO A (?:PAGAR|RECEBER)\s*:?\s*R?\$?\s*([\d.]+,\d{2})/)||[])[1];
      const vLiq=Number(g("vLiq"))||0, somaD=r.descontos.reduce((s,d)=>s+d.valor,0);
      r.liquido=liq?pn(liq):vLiq>0&&vLiq<=r.bruto?vLiq:r.bruto-somaD;
      // desconto que a nota não explicou (ex.: líquido da fatura menor que bruto − descontos lidos): entra como imposto retido
      const resto=Math.round((r.bruto-somaD-r.liquido)*100)/100;
      if(resto>0.05) r.descontos.push({k:"impostos",nome:somaD?"Outros descontos da nota":"Descontos retidos (Funrural/Senar)",valor:resto});
      r.refNF=((CPL.match(/NOTA FISCAL DE ENTRADA NRO\/SERIE\/DATA\s*:\s*([\d.]+)/)||[])[1]||"").replace(/\./g,"");
      const imp=CPL.match(/IMPUREZA\s*:?\s*([\d.,]+%[^_]*)/); if(imp) r.impureza=imp[1].trim();
      const mot=CPL.match(/MOTORISTA\s*:\s*([A-Z ]+?)\s+(RG|CPF|_|$)/); if(mot) r.motorista=mot[1].trim();
      const pl=CPL.match(/PLACA DO VEICULO\s*:\s*([A-Z0-9-]+)/); if(pl) r.placa=pl[1];
    }
    if(tipo==="devolucao"){r.refNF=((CPL.match(/REF\.?\s*NF\s*(?:NR\.?)?\s*([\d.]+)/)||[])[1]||"").replace(/\./g,"")}
  }catch(err){console.error(err); r=null}
  cache.set(ck,r); return r;
}
window.vgLe=le;

/* ---------- o que já existe no app ---------- */
const movs=()=>typeof grMovs==="function"?grMovs():[];
const lanc=()=>window.finLig?.lanc?.()||[];
const mesmoLocal=(a,b)=>N(a).replace(/\W/g,"")===N(b).replace(/\W/g,"");
const perto=(a,b,tol)=>Math.abs(a-b)<=tol;
function existentes(v){
  const ms=movs(), ls=lanc();
  const grCh=ms.find(m=>m.chave&&m.chave===v.chave)||null;
  const grPar=grCh?null:ms.find(m=>m.tipo==="venda"&&!m.chave&&m.cultura===v.cultura&&mesmoLocal(m.local,v.local)&&Math.abs(dias(m.data,v.data))<=5&&perto(m.sacas,v.sacas,Math.max(.6,v.sacas*.01)))||null;
  const gr=grCh||grPar;
  let fin=ls.find(l=>l.chave&&l.chave===v.chave&&l.natureza==="receber")||(gr&&ls.find(l=>l.origem==="gr|"+gr.id))||null;
  if(!fin) fin=ls.find(l=>l.natureza==="receber"&&l.categoria==="graos"&&!l.chave&&!String(l.origem||"").startsWith("gr|")&&Math.abs(dias(l.competencia||l.vencimento,v.data))<=5&&(perto(l.valor,v.bruto,v.bruto*.01)||perto(l.valor,v.liquido,v.liquido*.01)))||null;
  return {grCh,grPar,gr,fin,lancada:!!grCh&&!!(fin&&fin.chave===v.chave)};
}
function romaneioDe(v){
  return movs().filter(m=>m.tipo==="romaneio"&&(!v.cultura||m.cultura===v.cultura)&&mesmoLocal(m.local,v.local)&&Math.abs(dias(m.data,v.data))<=4)
    .sort((a,b)=>Math.abs(a.sacas-v.sacas)-Math.abs(b.sacas-v.sacas)).find(m=>perto(m.sacas,v.sacas,Math.max(1,v.sacas*.03)))||null;
}
const saldoLav=(cult,local)=>{try{const s=grSaldosTit()[cult]?.lavoura||{}; const k=Object.keys(s).find(l=>mesmoLocal(l,local)); return k?s[k]:0}catch{return null}};
window.vgJaLancada=v=>v?.tipo==="venda"?existentes(v).lancada:v?.tipo==="remessa"?!!(window.danfeColecao?.()||[]).find(d=>d.id===v.chave&&d.registrada):false;
function contaPadrao(local){
  const cs=window.finLote?.contas?.()||[];
  return (cs.find(c=>c.tipo==="coop"&&mesmoLocal(c.nome,local))||cs.find(c=>N(c.nome).includes(N(local).split(" ")[0]))||{}).id||window.finLote?.contaPadrao?.()||"";
}

/* ---------- gravar ---------- */
async function guardaXml(v,xml,extra){
  if(!v.chave) return;
  const ex=(window.danfeColecao?.()||[]).find(d=>d.id===v.chave);
  const {id,...base}=ex||{};
  await db.collection("nfe").doc(v.chave).set({...(ex?base:{xml,numero:v.numero,emit:v.emit,data:v.data,criadoEm:new Date().toISOString()}),...(xml&&!base.xml?{xml}:{}),...extra});
}
async function vgLancar(v,o={}){
  const agora=new Date().toISOString(), ex=existentes(v), grupo="nfv_"+v.chave;
  const recebido=o.recebido!==false, conta=o.conta||"", venc=o.venc||v.data;
  // 1) Grãos: venda da Lavoura (ou completa a venda já lançada sem nota)
  const usar=o.usarGr!==false?ex.gr:null;
  const grId=usar?.id||grupo;
  const base={tipo:"venda",titular:"lavoura",data:v.data,cultura:v.cultura,local:o.local||v.local,sacas:v.sacas,valorTotal:+Number(v.bruto).toFixed(2),
    nf:v.numero,chave:v.chave,kg:v.kg,precoSc:+Number(v.precoSc||0).toFixed(4),...(v.safra?{safraNota:v.safra}:{})};
  if(usar){const {id,...d}=graos.find(g=>g.id===usar.id)||usar; await db.collection("graos").doc(id||usar.id).set({...d,...base,titular:d.titular||"lavoura",contrato:d.contrato||"",obs:[d.obs,`NF ${v.numero}`].filter(Boolean).join(" · ")})}
  else await db.collection("graos").doc(grId).set({...base,contrato:"",obs:`NF ${v.numero} (${String(v.natOp||"").toLowerCase().replace(/\s*\(\d+\)\s*$/,"")})`,criadoEm:agora});
  // 2) Financeiro: receita bruta + descontos retidos (mesma situação e mesma conta)
  const pag=recebido?{status:"pago",pagoEm:v.data,...(conta?{contaId:conta}:{})}:{status:"aberto"};
  const comum={competencia:v.data,vencimento:recebido?v.data:venc,titular:v.dest||"",grupo,criadoEm:agora};
  const descTxt=v.descontos.length?`Descontos na nota: ${v.descontos.map(d=>`${d.nome} ${br(d.valor)}`).join(" · ")} · líquido ${br(v.liquido)}`:"";
  let criarDesc=true;
  if(o.usarFin!==false&&ex.fin){
    const {id,...d}=ex.fin; criarDesc=perto(Number(d.valor),v.bruto,v.bruto*.01);
    await db.collection("fin_lanc").doc(id).set({...d,nf:v.numero,chave:v.chave,origem:"gr|"+grId,titular:d.titular||v.dest||"",...(criarDesc?{grupo}:{}),obs:[d.obs,descTxt].filter(Boolean).join(" · ")});
  }else{
    await db.collection("fin_lanc").doc(grupo+"_r").set({natureza:"receber",descricao:`Venda de ${nm(v.sacas)} sc de ${v.cultura} — NF ${v.numero}`,pessoa:o.local||v.local,categoria:"graos",
      valor:+Number(v.bruto).toFixed(2),nf:v.numero,chave:v.chave,origem:"gr|"+grId,itens:[{desc:`${v.cultura} ${nm(v.kg,0)} kg = ${nm(v.sacas)} sc`,qtd:v.sacas,un:"sc",vu:+Number(v.precoSc||0).toFixed(2),valor:+Number(v.bruto).toFixed(2)}],
      obs:descTxt,...comum,...pag});
  }
  if(criarDesc) for(const d of v.descontos)
    await db.collection("fin_lanc").doc(`${grupo}_${d.k}_${N(d.nome).replace(/\W/g,"").slice(0,12)}`).set({natureza:"pagar",descricao:`${d.nome} — retido na venda NF ${v.numero}`,pessoa:o.local||v.local,
      categoria:d.k==="capital"?"capital":"impostos",valor:+d.valor.toFixed(2),nfRef:v.numero,origem:"nfv|"+v.chave,...comum,...pag});
  if(recebido&&conta) window.finLote?.lembraConta?.(conta);
  // 3) guarda o XML (DANFE e relatório)
  if(o.xml) try{await guardaXml(v,o.xml,{})}catch{}
  return {grId,usouGr:!!usar,usouFin:o.usarFin!==false&&!!ex.fin};
}
async function vgGuardar(v,xml){await guardaXml(v,xml,{registrada:true,tipoGraos:"remessa",kg:v.kg,sacas:v.sacas,cultura:v.cultura,local:v.local})}
window.vgLancar=vgLancar; window.vgContaPadrao=contaPadrao; window.vgGuardar=vgGuardar; window.vgExistentes=existentes; window.vgRomaneio=romaneioDe;

/* texto curto para as listas */
window.vgResumo=v=>!v?"":v.tipo==="venda"?`🌾 Venda: ${nm(v.sacas)} sc de ${v.cultura} a ${br(v.precoSc)}/sc${v.descontos.length?` · líquido ${br(v.liquido)}`:""}`
  :v.tipo==="remessa"?`📦 Entrega no depósito: ${nm(v.sacas)} sc de ${v.cultura} (${nm(v.kg,0)} kg) — não é venda`
  :v.tipo==="devolucao"?`↩️ Devolução de compra${v.refNF?` (ref. NF ${v.refNF})`:""}`:"";

/* ---------- janela de conferência ---------- */
let atual=null;
function fechar(){const ov=$("#vg-ov"); if(ov) ov.hidden=true; document.body.classList.remove("vg-aberto"); atual=null}
window.vgAbrir=function(xml,o={}){
  const v=le(xml); if(!v||!v.tipo||v.tipo==="devolucao") return false;
  atual={v,xml,o};
  let ov=$("#vg-ov"); if(!ov){ov=document.createElement("div"); ov.id="vg-ov"; ov.className="vg-ov"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); document.body.appendChild(ov);
    ov.addEventListener("click",ev=>{if(ev.target===ov) fechar()}); document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&!ov.hidden&&!$("#danfe-ov:not([hidden])")) fechar()})}
  ov.hidden=false; document.body.classList.add("vg-aberto"); pinta(); return true;
};
function pinta(){
  const ov=$("#vg-ov"); if(!ov||!atual) return;
  const {v,xml}=atual, deps=(typeof propCfg!=="undefined"&&propCfg?.depositos)||[];
  const locOpts=[...new Set([v.local,...deps])].filter(Boolean);
  const cab=`<div class="vg-cab"><span>${v.tipo==="venda"?"🌾 Venda de grãos":"📦 Entrega de grãos no depósito"}</span><button type="button" class="vg-x" id="vg-x" aria-label="Fechar">✕</button></div>`;
  const info=`<div class="vg-nota"><b>NF ${e(v.numero)} · ${e(v.emit)}</b><small>${dt(v.data)} · ${e(v.natOp)}${v.dest?` · em nome de ${e(v.dest)}`:""}</small><button type="button" class="link" id="vg-danfe">Ver DANFE</button></div>`;
  if(v.tipo==="remessa"){
    const rm=romaneioDe(v), ja=window.vgJaLancada(v);
    ov.innerHTML=`<div class="vg-box">${cab}${info}
      <div class="vg-num"><div><span>Produto</span><b>${e(v.cultura||v.produto)}</b></div><div><span>Peso</span><b>${nm(v.kg,0)} kg</b></div><div><span>Sacas (60 kg)</span><b>${nm(v.sacas)} sc</b></div><div><span>Depósito</span><b>${e(v.local)}</b></div></div>
      ${v.impureza||v.motorista||v.placa?`<p class="note">${[v.impureza?"Impureza "+e(v.impureza):"",v.motorista?"Motorista "+e(v.motorista):"",v.placa?"Placa "+e(v.placa):""].filter(Boolean).join(" · ")}</p>`:""}
      <p class="vg-exp">Esta nota <b>não é venda</b>: é a ${e(v.local)} registrando o grão que vocês entregaram no depósito (o valor de ${br(v.total)} é só para a parte fiscal). Ela <b>não mexe</b> no saldo de grãos nem no Financeiro — o grão entra no saldo pelo romaneio da colheita.</p>
      ${rm?`<p class="vg-ok">✓ Confere com o romaneio${rm.numero?" nº "+e(rm.numero):""} de ${dt(rm.data)}: ${nm(rm.sacas)} sc na ${e(rm.local)}.</p>`
        :`<p class="vg-av">⚠️ Não achei um romaneio de ${e(v.cultura||"grão")} na ${e(v.local)} perto de ${dt(v.data)} com cerca de ${nm(v.sacas)} sc. Se essa carga ainda não está na Colheita, lance o romaneio lá (Lançar → Colheita).</p>`}
      <div class="vg-bt">${ja?`<span class="vg-ok">Nota já guardada.</span>`:`<button type="button" class="btn" id="vg-ok">Guardar a nota</button>`}<button type="button" class="btn ghost" id="vg-can">Fechar</button><span class="note" id="vg-st" role="status"></span></div>
    </div>`;
  }else{
    const ex=existentes(v), sal=saldoLav(v.cultura,v.local), cp=contaPadrao(v.local), cs=window.finLote?.contas?.()||[];
    const desc=v.descontos.reduce((s,d)=>s+d.valor,0);
    ov.innerHTML=`<div class="vg-box">${cab}${info}
      ${ex.lancada?`<p class="vg-ok">✓ Esta venda já está lançada nos Grãos e no Financeiro.</p>`:""}
      <div class="vg-num"><div><span>Produto</span><b>${e(v.cultura||v.produto)}</b></div><div><span>Peso</span><b>${nm(v.kg,0)} kg</b></div><div><span>Sacas (60 kg)</span><b>${nm(v.sacas)} sc</b></div><div><span>Preço</span><b>${br(v.precoSc)}/sc</b></div></div>
      <div class="vg-contas"><div><span>Valor da venda (bruto)</span><b>${br(v.bruto)}</b></div>
        ${v.descontos.map(d=>`<div class="vg-desc"><span>− ${e(d.nome)}${d.k==="capital"?" <small>(vira cota capital: fora do custo)</small>":" <small>(imposto)</small>"}</span><b>${br(d.valor)}</b></div>`).join("")}
        ${v.descontos.length?`<div class="vg-liq"><span>Líquido creditado</span><b>${br(v.liquido)}</b></div>`:""}
        ${v.descontos.length&&Math.abs(v.bruto-desc-v.liquido)>0.05?`<p class="note">A nota diz líquido ${br(v.liquido)}; bruto − descontos dá ${br(v.bruto-desc)}. Confira.</p>`:""}</div>
      <div class="grid2">
        <div class="field"><label for="vg-loc">Depósito (de onde sai o grão)</label><select id="vg-loc">${locOpts.map(l=>`<option ${mesmoLocal(l,v.local)?"selected":""}>${e(l)}</option>`).join("")}</select></div>
        <div class="field"><label for="vg-cul">Cultura</label><input id="vg-cul" value="${e(v.cultura)}"></div>
      </div>
      ${sal!=null?`<p class="${sal+1e-6<v.sacas&&!ex.gr?"vg-av":"note"}">Saldo da Lavoura em ${e(v.local)} hoje: <b>${nm(sal)} sc de ${e(v.cultura)}</b>${sal+1e-6<v.sacas&&!ex.gr?` — menor que a venda (${nm(v.sacas)} sc). Confira se os romaneios dessa safra estão lançados na Colheita; a venda entra mesmo assim.`:""}</p>`:""}
      ${ex.grCh?`<p class="note">Já está nos Grãos (venda de ${dt(ex.grCh.data)}).</p>`:ex.grPar?`<label class="nf-chk vg-mesma"><input type="checkbox" id="vg-usagr" checked> <span>Já existe nos Grãos uma venda de <b>${nm(ex.grPar.sacas)} sc</b> de ${e(ex.grPar.cultura)} em ${dt(ex.grPar.data)} (${e(ex.grPar.local||"")}), sem nota. É a mesma venda: completar com os dados da nota (não tira o grão de novo).</span></label>`:""}
      ${ex.fin?`<label class="nf-chk vg-mesma"><input type="checkbox" id="vg-usafin" checked> <span>Já existe no Financeiro: <b>${e(ex.fin.descricao)}</b> (${br(ex.fin.valor)}, ${dt(ex.fin.competencia||ex.fin.vencimento)}). É a mesma: ligar à nota em vez de lançar de novo.</span></label>`:""}
      <div class="vg-rec">
        <div class="field"><label for="vg-sit">No Financeiro</label><select id="vg-sit"><option value="pago">Já recebido (creditado na conta em ${dt(v.data)})</option><option value="aberto">A receber</option></select></div>
        <div class="field" id="vg-cf"><label for="vg-conta">Conta</label><select id="vg-conta">${cs.map(c=>`<option value="${c.id}" ${c.id===cp?"selected":""}>${e(c.nome)}</option>`).join("")||`<option value="">Sem conta (só histórico)</option>`}</select></div>
        <div class="field" id="vg-vf" hidden><label for="vg-venc">Receber até</label><input type="date" id="vg-venc" value="${e(v.data)}"></div>
      </div>
      <p class="vg-exp">Ao lançar: <b>Grãos</b> — sai ${nm(v.sacas)} sc de ${e(v.cultura)} do saldo da Lavoura na ${e(v.local)} (venda). <b>Financeiro</b> — entra a receita de ${br(v.bruto)} (venda de grãos)${v.descontos.length?` e saem os descontos retidos (${v.descontos.map(d=>e(d.nome.toLowerCase())).join(", ")}), ficando ${br(v.liquido)} na conta`:""}. O Resultado da safra conta a receita bruta.</p>
      <div class="vg-bt">${ex.lancada?"":`<button type="button" class="btn" id="vg-ok">Lançar a venda</button>`}<button type="button" class="btn ghost" id="vg-can">${ex.lancada?"Fechar":"Cancelar"}</button><span class="note" id="vg-st" role="status"></span></div>
    </div>`;
    const sit=$("#vg-sit"); if(sit) sit.onchange=()=>{$("#vg-cf").hidden=sit.value!=="pago"; $("#vg-vf").hidden=sit.value==="pago"};
  }
  $("#vg-x").onclick=fechar; $("#vg-can").onclick=fechar;
  $("#vg-danfe").onclick=ev=>{ev.preventDefault(); ev.stopPropagation(); window.danfeAbrir?.(xml)};
  const ok=$("#vg-ok"); if(ok) ok.onclick=async()=>{
    const st=t=>$("#vg-st").textContent=t;
    if(typeof db==="undefined"||!db){st("Sem conexão com o banco de dados."); return}
    ok.disabled=true; st("Gravando…");
    try{
      if(v.tipo==="remessa"){await vgGuardar(v,xml); window.ponte?.aviso?.(`NF ${v.numero}: entrega no depósito guardada.`,true)}
      else{
        const cul=$("#vg-cul").value.trim(); if(cul) v.cultura=typeof normCult==="function"?normCult(cul):cul;
        const o={local:$("#vg-loc").value,recebido:$("#vg-sit").value==="pago",conta:$("#vg-conta")?.value||"",venc:$("#vg-venc").value,usarGr:$("#vg-usagr")?$("#vg-usagr").checked:true,usarFin:$("#vg-usafin")?$("#vg-usafin").checked:true,xml};
        if(o.local) v.local=o.local;
        await vgLancar(v,o);
        window.ponte?.aviso?.(`Venda lançada: ${nm(v.sacas)} sc de ${v.cultura} (NF ${v.numero}).`,true);
      }
      atual?.o?.depois?.(); fechar();
    }catch(err){console.error(err); ok.disabled=false; st(err?.code==="quota_exceeded"?"Limite do banco de dados atingido.":"Não foi possível gravar. Tente de novo.")}
  };
}
})();
