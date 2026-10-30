/* Diário da Lavoura — módulo Financeiro.
   Caixa, contas bancárias, contas a pagar e a receber, fluxo de caixa, livro caixa e resultado da safra.
   Usa as funções e listas do index.html (db, estoque, graos, diesel, manut, bfServ, registros…).
   Coleções: fin_contas {nome,tipo,saldoInicial,dataInicial}
             fin_lanc   {natureza:pagar|receber|transf, descricao, pessoa, categoria, forma, competencia, vencimento,
                         valor, status:aberto|pago, pagoEm, valorPago, contaId, contaDestino, parcela, grupo,
                         nf, chave, titular, itens:[{desc,valor}], origem, quitGraos:{sacas,cultura,local,grId}, obs}
             config/financeiro {inicio, ignorados:[]} */
(function(){
"use strict";

const FN_CAT={
  pagar:{insumos:"Insumos (sementes, adubos, defensivos)",combustivel:"Diesel e combustível",manutencao:"Manutenção de máquinas",
    benfeitorias:"Benfeitorias",maoobra:"Mão de obra e salários",arrendamento:"Arrendamento",servicos:"Serviços de terceiros (frete, colheita…)",
    impostos:"Impostos e taxas (Funrural, ITR…)",financ:"Financiamentos (parcela — informe os juros)",seguro:"Seguros",energia:"Energia, água e telefone",
    investimento:"Investimentos (máquinas, equipamentos)",outras_d:"Outras despesas"},
  receber:{graos:"Venda de grãos",financ_r:"Financiamento recebido (custeio)",outras_r:"Outras receitas"}};
const FN_CAT_CURTO={insumos:"Insumos",combustivel:"Diesel",manutencao:"Manutenção",benfeitorias:"Benfeitorias",maoobra:"Mão de obra",arrendamento:"Arrendamento",
  servicos:"Serviços",impostos:"Impostos",financ:"Juros de financiamentos",seguro:"Seguros",energia:"Energia/água/tel.",investimento:"Investimentos",outras_d:"Outras despesas",
  graos:"Venda de grãos",financ_r:"Financiamento recebido",outras_r:"Outras receitas"};
const FN_FORMAS={avista:"À vista",prazo:"A prazo (boleto/duplicata)",safra:"Para a safra / troca por grãos",financ:"Financiamento / custeio",cartao:"Cartão de crédito"};
const FN_TIPOS={banco:"Conta bancária",coop:"Conta na cooperativa",especie:"Dinheiro (caixa)",cartao:"Cartão de crédito"};
const FN_NAT={pagar:"A pagar",receber:"A receber",transf:"Transferência"};
const FN_FILTROS={abertas:"Em aberto",pagar:"A pagar",receber:"A receber",vencidas:"Vencidas",pagas:"Pagas / recebidas",todas:"Todas"};
const NAO_CUSTO=new Set(["investimento"]);   // fica fora do custo da safra
/* Financiamento: só os juros (e o que for pago a mais, como multa ou mora) são custo; o resto da parcela é amortização */
const jurosDe=l=>Math.min(vp(l),(Number(l.juros)||0)+(l.status==="pago"&&l.valorPago!=null?Math.max(0,Number(l.valorPago)-Number(l.valor)):0));
const NAO_RECEITA=new Set(["financ_r"]);     // dinheiro emprestado não é receita

let fnContas=[], fnLanc=[], fnCfg={}, fnCarregou=false;
let fnPjAberto=null, fnPendModo="atual", fnNat="pagar", fnEdit=null, fnOrigem=null, fnChave=null, fnSit="aberto", fnFiltro="abertas", fnBaixa=null;

/* ---------- utilidades ---------- */
const hoje=()=>todayISO();
const dias=(a,b)=>Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/864e5);
const vp=l=>l.status==="pago"?(Number(l.valorPago??l.valor)||0):(Number(l.valor)||0);
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const f2=v=>Number.isFinite(v)?v.toFixed(2).replace(".",","):"";
const addMes=(iso,n)=>{const [y,m,d]=iso.split("-").map(Number);const t=new Date(y,m-1+n,1);const ult=new Date(t.getFullYear(),t.getMonth()+1,0).getDate();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(Math.min(d,ult)).padStart(2,"0")}`};
const MESES=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const mesLab=ym=>`${MESES[+ym.slice(5,7)-1]}/${ym.slice(2,4)}`;
const inicioPadrao=()=>`${safraDe(hoje())}-07-01`;
const inicio=()=>fnCfg.inicio||inicioPadrao();
const contaPadrao=()=>{let u=null; try{u=localStorage.getItem("fnUltConta")}catch{} return fnContas.find(c=>c.id===u)?.id||fnContas.find(c=>c.tipo==="banco")?.id||fnContas[0]?.id||""};
const lembraConta=id=>{try{localStorage.setItem("fnUltConta",id)}catch{}};
const nomeConta=id=>fnContas.find(c=>c.id===id)?.nome||(id?"Conta removida":"");
const catNome=k=>FN_CAT_CURTO[k]||k||"Sem categoria";
const dataLanc=l=>l.status==="pago"?(l.pagoEm||l.vencimento):l.vencimento;
const flash=(id,m)=>{const el=$(id); if(!el) return; el.textContent=m; clearTimeout(el._t); el._t=setTimeout(()=>el.textContent="",4000)};
const erroTxt=err=>err?.code==="quota_exceeded"?"Limite do banco de dados atingido.":"Não foi possível salvar. Tente de novo.";
const visivel=v=>{const el=$("#view-"+v); return el&&!el.hidden};

/* ---------- saldos ---------- */
function saldos(ate){
  const s={}, ini={};
  for(const c of fnContas){s[c.id]=(!ate||!c.dataInicial||c.dataInicial<=ate)?Number(c.saldoInicial)||0:0; ini[c.id]=c.dataInicial||""}
  const mexe=(id,d,v)=>{if(id in s&&d>=ini[id]&&(!ate||d<=ate)) s[id]+=v};
  for(const l of fnLanc){
    if(l.status!=="pago"||l.quitGraos) continue;
    const d=l.pagoEm||l.vencimento||"", v=vp(l);
    if(l.natureza==="transf"){mexe(l.contaId,d,-v); mexe(l.contaDestino,d,v)}
    else mexe(l.contaId,d,l.natureza==="receber"?v:-v);
  }
  return s;
}
const caixaTotal=s=>fnContas.filter(c=>c.tipo!=="cartao").reduce((t,c)=>t+(s[c.id]||0),0);
const cartaoTotal=s=>fnContas.filter(c=>c.tipo==="cartao").reduce((t,c)=>t+(s[c.id]||0),0);

/* ---------- pendências: o que já está lançado no Diário e ainda não entrou no Financeiro ---------- */
function pendencias(modo){ // modo: "atual" (a partir do início), "retro" (antes do início) ou "todas"
  const ini=inicio(), ign=new Set(fnCfg.ignorados||[]);
  const origens=new Set(fnLanc.map(l=>l.origem).filter(Boolean));
  const chaves=new Set(fnLanc.map(l=>l.chave).filter(Boolean));
  const nfs=new Set(fnLanc.filter(l=>l.nf).map(l=>l.nf.replace(/^0+/,"")+"|"+norm(l.pessoa).split(" ")[0]));
  const naFaixa=d=>modo==="todas"||(modo==="retro"?d<ini:d>=ini);
  const out=[], livre=(k,d)=>d&&naFaixa(d)&&!ign.has(k)&&!origens.has(k);
  // Estoque: entradas da mesma nota viram uma conta só, com os produtos discriminados
  const g=new Map();
  for(const e of (typeof estoque!=="undefined"?estoque:[])) for(const x of e.entradas||[]){
    if(!(Number(x.valorTotal)>0)||!x.data) continue;
    if(x.chave&&chaves.has(x.chave)) continue;
    if(x.nf&&nfs.has(String(x.nf).replace(/^0+/,"")+"|"+norm(x.origem).split(" ")[0])) continue;
    const k=`est|${norm(x.origem)}|${x.nf?String(x.nf).replace(/^0+/,""):x.data}`;
    const p=g.get(k)||{k,natureza:"pagar",data:x.data,nf:x.nf||"",pessoa:x.origem||"",categoria:"insumos",fonte:"Estoque",itens:[],valor:0,chave:x.chave||""};
    p.itens.push({desc:`${e.comercial} — ${num(x.quantidade)} ${e.unidade}`,valor:Number(x.valorTotal)}); p.valor+=Number(x.valorTotal);
    if(x.data<p.data) p.data=x.data; g.set(k,p);
  }
  for(const p of g.values()){p.descricao=`Compra de insumos${p.nf?" — NF "+p.nf:""}`; if(livre(p.k,p.data)) out.push(p)}
  for(const d of (typeof diesel!=="undefined"?diesel:[])) if(d.tipo==="entrada"&&Number(d.valorTotal)>0){
    const k="ds|"+d.id; if(livre(k,d.data)) out.push({k,natureza:"pagar",data:d.data,descricao:`Diesel — ${num(d.litros)} L no tanque`,pessoa:d.fornecedor||"",nf:d.nf||"",valor:Number(d.valorTotal),categoria:"combustivel",fonte:"Abastecimento",itens:[]})}
  for(const x of (typeof manut!=="undefined"?manut:[])) if(Number(x.custoTotal)>0){
    const k="mq|"+x.id; if(livre(k,x.data)) out.push({k,natureza:"pagar",data:x.data,descricao:`Manutenção — ${nomeMaq(x.maquinaId)}${(x.servicos||[]).length?" ("+x.servicos.join(", ")+")":""}`,pessoa:x.oficina||"",nf:"",valor:Number(x.custoTotal),categoria:"manutencao",fonte:"Máquinas",itens:(x.itens||[]).filter(i=>i.desc||i.valor).map(i=>({desc:i.desc||"Item",valor:i.valor}))})}
  for(const x of (typeof bfServ!=="undefined"?bfServ:[])) if(Number(x.custoTotal)>0&&x.status!=="pendente"){
    const k="bf|"+x.id; if(livre(k,x.data)) out.push({k,natureza:"pagar",data:x.data,descricao:`${nomeBf(x.benfId)}${(x.servicos||[]).length?" — "+x.servicos.join(", "):""}`,pessoa:x.responsavel||"",nf:"",valor:Number(x.custoTotal),categoria:"benfeitorias",fonte:"Benfeitorias",itens:(x.itens||[]).filter(i=>i.desc||i.valor).map(i=>({desc:i.desc||"Item",valor:i.valor}))})}
  for(const m of (typeof graos!=="undefined"?graos:[])) if(m.tipo==="venda"&&Number(m.valorTotal)>0&&!m.finId){
    const k="gr|"+m.id; if(livre(k,m.data)) out.push({k,natureza:"receber",data:m.data,descricao:`Venda de ${num(m.sacas)} sc de ${m.cultura}`,pessoa:m.contrato||m.local||"",nf:"",valor:Number(m.valorTotal),categoria:"graos",fonte:"Grãos",itens:[{desc:`${num(m.sacas)} sc de ${m.cultura} (${m.local||"sem local"}) a ${brl(m.valorTotal/m.sacas)}/sc`,valor:Number(m.valorTotal)}]})}
  return out.sort((a,b)=>b.data.localeCompare(a.data));
}

/* ---------- RESUMO ---------- */
function renderResumo(){
  const s=saldos(), h=hoje(), em30=addMes(h,1);
  const abertos=fnLanc.filter(l=>l.status!=="pago"&&l.natureza!=="transf");
  const soma=a=>a.reduce((t,l)=>t+vp(l),0);
  const pag30=abertos.filter(l=>l.natureza==="pagar"&&l.vencimento<=em30), rec30=abertos.filter(l=>l.natureza==="receber"&&l.vencimento<=em30);
  const venc=abertos.filter(l=>l.vencimento<h);
  const kpi=(l,v,sub,cls)=>`<div class="kpi${cls?" "+cls:""}"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:""}</div>`;
  const cart=cartaoTotal(s);
  $("#fn-kpis").innerHTML=[
    kpi("Saldo em caixa",brl(caixaTotal(s)),fnContas.length?`${fnContas.filter(c=>c.tipo!=="cartao").length} conta(s) e caixa`:"cadastre as contas abaixo"),
    kpi("A pagar em 30 dias",brl(soma(pag30)),`${pag30.length} conta${pag30.length===1?"":"s"}`),
    kpi("A receber em 30 dias",brl(soma(rec30)),`${rec30.length} conta${rec30.length===1?"":"s"}`),
    kpi(cart<0?"Fatura de cartão":"Vencidas",cart<0?brl(-cart):brl(soma(venc)),cart<0?`vencidas: ${brl(soma(venc))}`:`${venc.length} em atraso`,venc.length?"fn-neg":"")
  ].join("");
  const al=[];
  if(venc.length) al.push(`<div class="falta fn-al">${venc.length} conta${venc.length===1?"":"s"} vencida${venc.length===1?"":"s"} (${brl(soma(venc))}). <button type="button" class="link" data-fnir="vencidas">Ver</button></div>`);
  const pendA=pendencias("atual"), pendR=pendencias("retro"), pend=fnPendModo==="retro"?pendR:pendA;
  $("#fn-alertas").innerHTML=al.join("");
  $("#fn-alertas").querySelectorAll("[data-fnir]").forEach(b=>b.onclick=()=>{fnFiltro=b.dataset.fnir;show("fin_contas")});
  // contas
  $("#fn-contas").innerHTML=fnContas.length?fnContas.map(c=>`<article class="fn-conta" style="--c:var(${c.tipo==="cartao"?"--s2":c.tipo==="coop"?"--t-colheita":c.tipo==="especie"?"--s4":"--accent"})">
      <div class="rec-top"><b>${esc(c.nome)}</b><span class="note">${FN_TIPOS[c.tipo]||""}</span></div>
      <div class="fn-saldo ${(s[c.id]||0)<0?"neg":""}">${brl(s[c.id]||0)}</div>
      <div class="rec-actions"><button type="button" class="link" data-fcext="${c.id}">Extrato</button><button type="button" class="link" data-fced="${c.id}">Editar</button><button type="button" class="link danger" data-fcdel="${c.id}">Excluir</button></div>
    </article>`).join(""):`<div class="empty">Nenhuma conta cadastrada.<br>Cadastre a conta do banco, a da cooperativa, o caixinha em dinheiro e o cartão.</div>`;
  $("#fn-contas").querySelectorAll("[data-fced]").forEach(b=>b.onclick=()=>contaForm(fnContas.find(c=>c.id===b.dataset.fced)));
  $("#fn-contas").querySelectorAll("[data-fcext]").forEach(b=>b.onclick=()=>{lcConta=b.dataset.fcext; show("fin_caixa")});
  $("#fn-contas").querySelectorAll("[data-fcdel]").forEach(b=>b.onclick=()=>{
    const usos=fnLanc.filter(l=>l.contaId===b.dataset.fcdel||l.contaDestino===b.dataset.fcdel).length;
    if(usos){b.textContent=`Tem ${usos} lançamento(s): não dá para excluir`; return}
    confirmar(b,"Confirmar exclusão",async()=>{await db.collection("fin_contas").doc(b.dataset.fcdel).delete()})});
  renderFluxo(s);
  // pendências
  const retro=fnPendModo==="retro";
  $("#fn-pend-modo").innerHTML=[["atual",`A partir de ${brDate(inicio())}`,pendA.length],["retro","Retroativos",pendR.length]].map(([k,l,n])=>`<button type="button" class="chip" aria-pressed="${k===fnPendModo}" data-k="${k}">${l}${n?` <b>${n}</b>`:""}</button>`).join("");
  $("#fn-pend-modo").querySelectorAll("button").forEach(b=>b.onclick=()=>{fnPendModo=b.dataset.k; renderResumo()});
  $("#fn-pend-txt").innerHTML=retro?
    `Lançamentos do Diário <b>anteriores a ${brDate(inicio())}</b>. Para o histórico, o mais rápido é <b>Já pago</b>: entra no livro caixa e no resultado da safra na data do Diário, sem mexer no saldo atual das contas (que conta a partir da data do saldo de cada conta). Se algum ainda estiver em aberto, use <b>Lançar</b>.`:
    `Compras, vendas e serviços lançados no Diário a partir de <b>${brDate(inicio())}</b> que ainda não estão no Financeiro. Toque em <b>Lançar</b> para escolher vencimento e forma de pagamento — nada é digitado de novo. <button type="button" class="link" id="fn-ini-ed">Mudar a data</button>`;
  $("#fn-ini-ed")?.addEventListener("click",iniEditar);
  $("#fn-pend-n").textContent=pend.length?`${pend.length} para lançar`:"";
  $("#fn-lote").hidden=!(retro&&pend.length>1);
  if(retro&&pend.length>1){
    const v=$("#fn-lote-c")?.value;
    $("#fn-lote").innerHTML=`<span>Lançar os <b>${pend.length}</b> como já pagos/recebidos na conta</span><select id="fn-lote-c" style="width:auto">${fnContas.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join("")||`<option value="">Cadastre uma conta acima</option>`}</select><button type="button" class="btn fn-mini" id="fn-lote-ok">Lançar todos</button><span class="note" id="fn-lote-st"></span>`;
    $("#fn-lote-c").value=v&&fnContas.some(c=>c.id===v)?v:contaPadrao();
    $("#fn-lote-ok").onclick=()=>confirmar($("#fn-lote-ok"),`Confirmar: lançar ${pend.length}`,async()=>{
      const c=$("#fn-lote-c").value; if(!c){$("#fn-lote-st").textContent="Cadastre uma conta primeiro.";return}
      let n=0; for(const p of pend){await jaPago(p,c); n++; if(n%5===0) $("#fn-lote-st").textContent=`Lançando… ${n} de ${pend.length}`}
    });
  }
  const max=40;
  $("#fn-pend").innerHTML=pend.length?pend.slice(0,max).map((p,i)=>`<article class="rec" style="--c:var(${p.natureza==="receber"?"--accent":"--t-aplicacao"})">
      <div class="rec-top"><span class="rec-tipo">${esc(p.descricao)}</span><span class="mov-q ${p.natureza==="receber"?"in":"out"}">${p.natureza==="receber"?"+":"−"}${brl(p.valor)}</span></div>
      <div class="rec-campos"><span>${brDate(p.data)}</span><span>De <b>${esc(p.fonte)}</b></span>${p.pessoa?`<span>${p.natureza==="receber"?"Comprador":"Fornecedor"} <b>${esc(p.pessoa)}</b></span>`:""}${p.itens.length>1?`<span>${p.itens.length} itens</span>`:""}</div>
      <div class="fn-baixa" id="pj-${i}" hidden></div>
      <div class="rec-actions"><button type="button" class="btn fn-mini" data-pdl="${i}">Lançar</button><button type="button" class="btn ghost fn-mini" data-pdp="${i}">${p.natureza==="receber"?"Já recebido":"Já pago"}</button><button type="button" class="link" data-pdi="${i}">Ignorar</button></div>
    </article>`).join("")+(pend.length>max?`<p class="note">Mostrando ${max} de ${pend.length}. Lance ou ignore estes para ver os outros.</p>`:""):
    `<div class="empty">${retro?"Nenhum lançamento antigo do Diário esperando.":"Tudo em dia: nada do Diário esperando para entrar no Financeiro."}</div>`;
  $("#fn-pend").querySelectorAll("[data-pdl]").forEach(b=>b.onclick=()=>{const p=pend[+b.dataset.pdl]; show("fin_contas"); formDePendencia(p)});
  const abrePj=i=>{
    const p=pend[i], box=$("#pj-"+i); fnPjAberto=p.k;
    box.hidden=false;
    box.innerHTML=`<div class="grid2"><div class="field"><label>${p.natureza==="receber"?"Recebido":"Pago"} em</label><input type="date" class="pj-d" value="${p.data}"></div>
      <div class="field"><label>Conta</label><select class="pj-c">${fnContas.map(c=>`<option value="${c.id}"${c.id===contaPadrao()?" selected":""}>${esc(c.nome)}</option>`).join("")||`<option value="">Cadastre uma conta acima</option>`}</select></div></div>
      <div class="row"><button type="button" class="btn fn-mini pj-ok">Confirmar</button><span class="falta pj-st"></span></div>`;
    box.querySelector(".pj-ok").onclick=async()=>{const c=box.querySelector(".pj-c").value; if(!c){box.querySelector(".pj-st").textContent="Cadastre uma conta primeiro.";return}
      box.querySelector(".pj-ok").disabled=true; fnPjAberto=null; try{await jaPago(p,c,box.querySelector(".pj-d").value||p.data); lembraConta(c)}catch(err){box.querySelector(".pj-st").textContent=erroTxt(err); box.querySelector(".pj-ok").disabled=false}};
  };
  $("#fn-pend").querySelectorAll("[data-pdp]").forEach(b=>b.onclick=()=>{const i=+b.dataset.pdp; if(!$("#pj-"+i).hidden){$("#pj-"+i).hidden=true; fnPjAberto=null; return} abrePj(i)});
  {const i=pend.slice(0,max).findIndex(p=>p.k===fnPjAberto); if(i>=0) abrePj(i)}
  $("#fn-pend").querySelectorAll("[data-pdi]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar: não lançar",async()=>{
    const p=pend[+b.dataset.pdi]; await salvaCfg({ignorados:[...(fnCfg.ignorados||[]),p.k]})}));
}
/* Lança uma pendência do Diário direto como já paga/recebida (histórico) */
async function jaPago(p,conta,data){
  const d=data||p.data, b={natureza:p.natureza,descricao:p.descricao,pessoa:p.pessoa||"",categoria:p.categoria,forma:"avista",competencia:p.data,vencimento:d,
    valor:+Number(p.valor).toFixed(2),status:"pago",pagoEm:d,contaId:conta,nf:p.nf||"",titular:"",itens:p.itens||[],origem:p.k,obs:"",criadoEm:new Date().toISOString()};
  if(p.chave) b.chave=p.chave;
  await db.collection("fin_lanc").add(b);
}
async function salvaCfg(mud){fnCfg={...fnCfg,...mud}; await db.collection("config").doc("financeiro").set({inicio:fnCfg.inicio||null,ignorados:fnCfg.ignorados||[]})}
function iniEditar(){
  const box=$("#fn-pend-txt");
  box.innerHTML=`<span class="row">Trazer do Diário o que foi lançado a partir de <input type="date" id="fn-ini" value="${inicio()}" style="width:auto"> <button type="button" class="btn fn-mini" id="fn-ini-ok">Salvar</button></span>`;
  $("#fn-ini-ok").onclick=async()=>{const v=$("#fn-ini").value; if(!v) return; try{await salvaCfg({inicio:v})}catch{} renderResumo()};
}

/* Fluxo de caixa mensal: realizado (pago/recebido) para trás, previsto (em aberto) para frente */
function renderFluxo(s){
  const h=hoje(), ymH=h.slice(0,7);
  const meses=Array.from({length:12},(_,i)=>addMes(h.slice(0,7)+"-01",i-5).slice(0,7));
  const M=Object.fromEntries(meses.map(m=>[m,{ent:0,sai:0,pEnt:0,pSai:0}]));
  for(const l of fnLanc){
    if(l.natureza==="transf"||l.quitGraos) continue;
    if(l.status==="pago"){const ym=(l.pagoEm||l.vencimento||"").slice(0,7); if(M[ym]) M[ym][l.natureza==="receber"?"ent":"sai"]+=vp(l)}
    else{let ym=(l.vencimento||"").slice(0,7); if(ym<ymH) ym=ymH; if(M[ym]) M[ym][l.natureza==="receber"?"pEnt":"pSai"]+=vp(l)}
  }
  // saldo no fim de cada mês: hoje para trás (tirando o realizado) e para frente (somando o previsto)
  const atual=caixaTotal(s)+cartaoTotal(s), fim={};
  let acc=atual;
  for(let i=meses.indexOf(ymH);i>=0;i--){const m=meses[i]; fim[m]=acc; acc-=M[m].ent-M[m].sai}
  // o mês atual ainda tem o previsto pela frente
  acc=atual+M[ymH].pEnt-M[ymH].pSai; fim[ymH]=acc;
  for(let i=meses.indexOf(ymH)+1;i<meses.length;i++){const m=meses[i]; acc+=M[m].pEnt-M[m].pSai; fim[m]=acc}
  $("#fn-fluxo-leg").innerHTML=`<span><i style="background:var(--s3)"></i>Entradas</span><span><i style="background:var(--s2)"></i>Saídas</span><span><i class="fn-prev"></i>Previsto (em aberto)</span><span><i class="p" style="border-top-color:var(--s1);border-top-style:solid"></i>Saldo no fim do mês</span>`;
  const el=$("#fn-fluxo"), W=Math.max(300,el.clientWidth||600), H=W<500?220:260, L=50,R=6,T=12,B=26, cw=(W-L-R)/12, bw=Math.min(16,cw*.32);
  const vals=meses.flatMap(m=>[M[m].ent+M[m].pEnt,M[m].sai+M[m].pSai,Math.abs(fim[m])]); const mx=Math.max(1,...vals);
  const mn=Math.min(0,...meses.map(m=>fim[m]));
  const passo=(()=>{const r=(mx-mn)/4,p=10**Math.floor(Math.log10(r||1));return [1,2,2.5,5,10].map(x=>x*p).find(x=>x>=r)})();
  const top=Math.ceil(mx/passo)*passo, bot=Math.floor(mn/passo)*passo;
  const y=v=>T+(H-T-B)*(top-v)/(top-bot||1);
  const k=v=>Math.abs(v)>=1e6?num(v/1e6)+"mi":Math.abs(v)>=1000?num(v/1000)+"k":num(v);
  let g=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fluxo de caixa mês a mês">`;
  for(let v=bot;v<=top+1e-9;v+=passo) g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L-6}" y="${y(v)+4}" text-anchor="end">${k(v)}</text>`;
  const pts=[];
  meses.forEach((m,i)=>{const x0=L+cw*i, cx=x0+cw/2, d=M[m];
    const tip=`<b>${mesLab(m)}</b>${m===ymH?" (este mês)":""}<br>Entradas: <b>${brl(d.ent)}</b>${d.pEnt?` + previsto ${brl(d.pEnt)}`:""}<br>Saídas: <b>${brl(d.sai)}</b>${d.pSai?` + previsto ${brl(d.pSai)}`:""}<br>Saldo no fim: <b>${brl(fim[m])}</b>`;
    g+=`<rect class="hit" x="${x0}" y="${T}" width="${cw}" height="${H-T-B}" data-tip="${esc(tip)}"/><g class="mk">`;
    const barra=(xx,real,prev,cor)=>{let s2=""; if(real>0) s2+=`<rect x="${xx}" y="${y(real)}" width="${bw}" height="${Math.max(1,y(0)-y(real))}" rx="2" style="fill:var(${cor})"/>`;
      if(prev>0) s2+=`<rect x="${xx}" y="${y(real+prev)}" width="${bw}" height="${Math.max(1,y(real)-y(real+prev)-(real>0?1:0))}" rx="2" style="fill:var(${cor});opacity:.35"/>`; return s2};
    g+=barra(cx-bw-1,d.ent,d.pEnt,"--s3")+barra(cx+1,d.sai,d.pSai,"--s2")+`</g>`;
    const rot=cw<46?MESES[+m.slice(5,7)-1]+(i===0||m.endsWith("-01")?"/"+m.slice(2,4):""):mesLab(m);
    if(cw>=30||i%2===0||m===ymH) g+=`<text class="ax" x="${cx}" y="${H-8}" text-anchor="middle"${m===ymH?' style="font-weight:700;fill:var(--ink)"':""}>${rot}</text>`;
    pts.push([cx,y(fim[m])]);
  });
  g+=`<line x1="${L+cw*meses.indexOf(ymH)}" x2="${L+cw*meses.indexOf(ymH)}" y1="${T}" y2="${H-B}" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
  g+=`<polyline points="${pts.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--s1)" stroke-width="2" pointer-events="none"/>`+pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="var(--s1)" pointer-events="none"/>`).join("");
  el.innerHTML=g+"</svg>";
  ligaTips(el.parentElement);
  $("#fn-fluxo-tbl").innerHTML=`<table class="tbl"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo no fim</th></tr></thead><tbody>${meses.map(m=>{const d=M[m];
    return `<tr${m===ymH?' class="fn-hoje"':""}><td>${mesLab(m)}${m>ymH?" (previsto)":m===ymH?" (este mês)":""}</td><td>${brl(d.ent+d.pEnt)}</td><td>${brl(d.sai+d.pSai)}</td><td class="${fim[m]<0?"fn-neg":""}">${brl(fim[m])}</td></tr>`}).join("")}</tbody></table>`;
}

/* ---------- cadastro de contas ---------- */
let fcEdit=null;
function contaForm(c){
  fcEdit=c?.id||null; $("#fn-conta-form").hidden=false;
  $("#fn-conta-tit").textContent=c?"Editar conta":"Nova conta";
  $("#fc-nome").value=c?.nome||""; $("#fc-tipo").value=c?.tipo||"banco"; $("#fc-saldo").value=c?f2(Number(c.saldoInicial)||0):""; $("#fc-data").value=c?.dataInicial||inicio();
  $("#fc-nome").focus();
}
function contaFecha(){fcEdit=null; $("#fn-conta-form").hidden=true}

/* ---------- formulário de lançamento ---------- */
function fnSetNat(n){
  fnNat=n;
  $("#fn-nat").innerHTML=Object.entries(FN_NAT).filter(([k])=>!fnEdit||k===n).map(([k,l])=>`<button type="button" class="chip" aria-pressed="${k===n}" data-k="${k}">${l}</button>`).join("");
  $("#fn-nat").querySelectorAll("button").forEach(b=>b.onclick=()=>fnSetNat(b.dataset.k));
  const tr=n==="transf";
  document.querySelectorAll('#fn-form [data-fn="norm"]').forEach(e=>e.hidden=tr);
  document.querySelectorAll('#fn-form [data-fn="transf"]').forEach(e=>e.hidden=!tr);
  $("#fn-xml-box").hidden=n!=="pagar"||!!fnEdit;
  $("#fn-pessoa-l").textContent=n==="receber"?"Comprador / pagador":"Fornecedor";
  const cats=FN_CAT[n==="receber"?"receber":"pagar"], atual=$("#fn-cat").value;
  $("#fn-cat").innerHTML=Object.entries(cats).map(([k,l])=>`<option value="${k}">${l}</option>`).join("");
  if(atual in cats) $("#fn-cat").value=atual;
  jurosVis();
  $("#fn-venc-l").textContent=n==="receber"?"Recebimentos":"Vencimentos";
  fnSetSit(fnSit);
  $("#fn-salvar").textContent=fnEdit?"Salvar alterações":tr?"Lançar transferência":n==="receber"?"Lançar conta a receber":"Lançar conta a pagar";
}
function jurosVis(){$("#fn-juros-box").hidden=$("#fn-cat").value!=="financ"}
function fnSetSit(s){
  fnSit=s;
  const r=fnNat==="receber";
  $("#fn-sit").innerHTML=[["aberto",r?"A receber":"A pagar"],["pago",r?"Já recebido":"Já pago"]].map(([k,l])=>`<button type="button" class="chip" aria-pressed="${k===s}" data-k="${k}">${l}</button>`).join("");
  $("#fn-sit").querySelectorAll("button").forEach(b=>b.onclick=()=>fnSetSit(b.dataset.k));
  $("#fn-pago-box").hidden=s!=="pago";
  if(s==="pago"&&!$("#fn-pago-em").value) $("#fn-pago-em").value=$("#fn-data").value||hoje();
  if(s==="pago"&&!fnEdit&&contaPadrao()) $("#fn-conta").value=contaPadrao();
}
function opcoesConta(sel,val,vazio){
  $(sel).innerHTML=(vazio?`<option value="">${vazio}</option>`:"")+fnContas.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join("");
  if(val) $(sel).value=val;
}
function itensRender(list){
  $("#fn-itens").innerHTML=(list||[]).map(i=>`<div class="item fn-item"><input class="i-desc" placeholder="Produto / item" value="${esc(i.desc||"")}" aria-label="Item"><input class="i-val" inputmode="decimal" placeholder="R$" value="${i.valor!=null?f2(Number(i.valor)):""}" aria-label="Valor"><button type="button" class="rm" aria-label="Remover item">×</button></div>`).join("");
  $("#fn-itens").querySelectorAll(".rm").forEach(b=>b.onclick=()=>{b.parentElement.remove(); totalSt()});
  $("#fn-itens").querySelectorAll(".i-val").forEach(i=>i.addEventListener("input",totalSt));
}
const itensLer=()=>[...document.querySelectorAll("#fn-itens .fn-item")].map(r=>{const v=parseNum(r.querySelector(".i-val").value);return {desc:r.querySelector(".i-desc").value.trim(),valor:Number.isFinite(v)?v:null}}).filter(i=>i.desc||i.valor!=null);
function parcsRender(list){
  const n=list.length;
  $("#fn-parcs").innerHTML=list.map((p,i)=>`<div class="fn-parc-row"><span class="note">${n>1?`${i+1}/${n}`:"Data"}</span><input type="date" class="pc-d" value="${p.venc||""}" aria-label="Vencimento"><input class="pc-v" inputmode="decimal" placeholder="Valor R$" value="${p.valor!=null?f2(Number(p.valor)):""}" aria-label="Valor"></div>`).join("");
  $("#fn-parcs").querySelectorAll(".pc-v").forEach(i=>i.addEventListener("input",totalSt));
  $("#fn-np").value=n; totalSt();
}
const parcsLer=()=>[...document.querySelectorAll("#fn-parcs .fn-parc-row")].map(r=>({venc:r.querySelector(".pc-d").value,valor:parseNum(r.querySelector(".pc-v").value)}));
function totalSt(){
  const t=parcsLer().reduce((s,p)=>s+(p.valor>0?p.valor:0),0), it=itensLer().reduce((s,i)=>s+(i.valor>0?i.valor:0),0);
  $("#fn-total-st").innerHTML=t>0?`Total: <b>${brl(t)}</b>${it>0&&Math.abs(it-t)>0.05?` <span class="falta">· itens somam ${brl(it)}</span>`:""}`:"";
}
function dividir(){
  const n=Math.max(1,Math.min(60,parseInt($("#fn-np").value)||1)), atual=parcsLer();
  const total=atual.reduce((s,p)=>s+(p.valor>0?p.valor:0),0)||itensLer().reduce((s,i)=>s+(i.valor>0?i.valor:0),0);
  const v0=atual[0]?.venc||$("#fn-data").value||hoje(), cada=Math.floor(total/n*100)/100;
  parcsRender(Array.from({length:n},(_,i)=>({venc:addMes(v0,i),valor:total>0?(i===n-1?+(total-cada*(n-1)).toFixed(2):cada):null})));
}
function fnReset(){
  fnEdit=null; fnOrigem=null; fnChave=null; fnSit="aberto"; document.querySelector("#fn-np").closest(".fn-parc").hidden=false;
  ["#fn-desc","#fn-pessoa","#fn-nf","#fn-tit","#fn-obs","#fn-tval","#fn-tdesc","#fn-pago-em","#fn-juros"].forEach(s=>$(s).value="");
  $("#fn-data").value=hoje(); $("#fn-tdata").value=hoje(); $("#fn-forma").value="prazo";
  $("#fn-form-tit").textContent="Novo lançamento"; $("#fn-cancel").hidden=true; $("#fn-origem").hidden=true;
  itensRender([]); parcsRender([{venc:hoje(),valor:null}]);
  opcoesConta("#fn-conta"); opcoesConta("#fn-de"); opcoesConta("#fn-para");
  fnSetNat(fnNat==="transf"&&!fnContas.length?"pagar":fnNat);
}
function origemTxt(t){$("#fn-origem").hidden=!t; $("#fn-origem").innerHTML=t||""}
function formDePendencia(p){
  fnReset(); fnSetNat(p.natureza);
  fnOrigem=p.k; fnChave=p.chave||null;
  $("#fn-desc").value=p.descricao; $("#fn-pessoa").value=p.pessoa||""; $("#fn-cat").value=p.categoria; $("#fn-data").value=p.data; $("#fn-nf").value=p.nf||"";
  $("#fn-forma").value=p.natureza==="receber"?"avista":"prazo";
  itensRender(p.itens.length>1||p.natureza!=="receber"?p.itens:[]);
  parcsRender([{venc:p.data,valor:p.valor}]);
  origemTxt(`Vindo de <b>${esc(p.fonte)}</b> (${brDate(p.data)}). Ajuste o vencimento, as parcelas e a forma, e salve.`);
  $("#fn-form").scrollIntoView({block:"start",behavior:"smooth"});
}
function formEditar(l){
  fnReset(); fnEdit=l.id; fnOrigem=l.origem||null; fnChave=l.chave||null;
  $("#fn-form-tit").textContent=`Editar ${l.parcela?"parcela "+l.parcela:"lançamento"}`; $("#fn-cancel").hidden=false;
  fnSit=l.status==="pago"?"pago":"aberto";
  fnSetNat(l.natureza);
  if(l.natureza==="transf"){opcoesConta("#fn-de",l.contaId); opcoesConta("#fn-para",l.contaDestino); $("#fn-tdata").value=l.pagoEm||l.vencimento; $("#fn-tval").value=f2(Number(l.valor)); $("#fn-tdesc").value=l.descricao||""}
  else{
    $("#fn-desc").value=l.descricao||""; $("#fn-pessoa").value=l.pessoa||""; $("#fn-cat").value=l.categoria||""; $("#fn-data").value=l.competencia||l.vencimento;
    $("#fn-forma").value=l.forma||"prazo"; $("#fn-nf").value=l.nf||""; $("#fn-tit").value=l.titular||""; $("#fn-juros").value=l.juros!=null?f2(Number(l.juros)):""; jurosVis();
    itensRender(l.itens||[]); parcsRender([{venc:l.vencimento,valor:l.valor}]);
    if(l.status==="pago"){$("#fn-pago-em").value=l.pagoEm||""; opcoesConta("#fn-conta",l.contaId)}
    fnSetSit(fnSit);
  }
  $("#fn-obs").value=l.obs||"";
  if(l.quitGraos) origemTxt(`Quitada com <b>${num(l.quitGraos.sacas)} sc de ${esc(l.quitGraos.cultura)}</b>.`);
  document.querySelector("#fn-np").closest(".fn-parc").hidden=true;
  $("#fn-form").scrollIntoView({block:"start",behavior:"smooth"});
}

async function salvarLanc(ev){
  ev.preventDefault();
  if(!db){flash("#fn-toast","Sem conexão com o banco de dados.");return}
  const agora=new Date().toISOString(), obs=$("#fn-obs").value.trim();
  if(fnNat==="transf"){
    const de=$("#fn-de").value, para=$("#fn-para").value, v=parseNum($("#fn-tval").value), d=$("#fn-tdata").value||hoje();
    if(!de||!para||de===para){flash("#fn-toast","Escolha duas contas diferentes.");return}
    if(!(v>0)){flash("#fn-toast","Informe o valor.");$("#fn-tval").focus();return}
    const body={natureza:"transf",descricao:$("#fn-tdesc").value.trim()||"Transferência",contaId:de,contaDestino:para,valor:v,status:"pago",pagoEm:d,vencimento:d,competencia:d,obs};
    $("#fn-salvar").disabled=true;
    try{ if(fnEdit){const o=fnLanc.find(x=>x.id===fnEdit); await db.collection("fin_lanc").doc(fnEdit).set({...body,criadoEm:o?.criadoEm||agora})} else await db.collection("fin_lanc").add({...body,criadoEm:agora});
      flash("#fn-toast",fnEdit?"Transferência atualizada.":"Transferência lançada."); fnReset()}
    catch(err){flash("#fn-toast",erroTxt(err))} finally{$("#fn-salvar").disabled=false}
    return;
  }
  const descricao=$("#fn-desc").value.trim(), parcs=parcsLer();
  if(!descricao){flash("#fn-toast","Escreva a descrição.");$("#fn-desc").focus();return}
  for(const p of parcs){ if(!p.venc){flash("#fn-toast","Informe a data de todas as parcelas.");return} if(!(p.valor>0)){flash("#fn-toast","Informe o valor de todas as parcelas.");return} }
  if(fnSit==="pago"&&!$("#fn-conta").value){flash("#fn-toast",fnContas.length?"Escolha a conta.":"Cadastre uma conta no Resumo primeiro.");return}
  const comp=$("#fn-data").value||parcs[0].venc;
  const base={natureza:fnNat,descricao,pessoa:$("#fn-pessoa").value.trim(),categoria:$("#fn-cat").value,forma:$("#fn-forma").value,competencia:comp,
    nf:$("#fn-nf").value.trim(),titular:$("#fn-tit").value.trim(),itens:itensLer(),obs};
  if(fnOrigem) base.origem=fnOrigem; if(fnChave) base.chave=fnChave;
  if(base.categoria==="financ"){const j=parseNum($("#fn-juros").value); base.juros=j>=0?+j.toFixed(2):null} else base.juros=null;
  const pago=fnSit==="pago"?{status:"pago",pagoEm:$("#fn-pago-em").value||parcs[0].venc,contaId:$("#fn-conta").value}:{status:"aberto"};
  $("#fn-salvar").disabled=true;
  try{
    if(fnEdit){
      const o=fnLanc.find(x=>x.id===fnEdit)||{}, {id:_,...resto}=o;
      const body={...resto,...base,vencimento:parcs[0].venc,valor:parcs[0].valor,...pago};
      if(pago.status!=="pago"){delete body.pagoEm; delete body.contaId; delete body.valorPago}
      else if(o.status==="pago"&&o.valorPago!=null) body.valorPago=o.valorPago;
      await db.collection("fin_lanc").doc(fnEdit).set(body); flash("#fn-toast","Lançamento atualizado.");
    }else{
      const grupo=parcs.length>1?rid():null;
      for(let i=0;i<parcs.length;i++){
        const b={...base,vencimento:parcs[i].venc,valor:+parcs[i].valor.toFixed(2),...pago,criadoEm:agora};
        if(pago.status==="pago"&&parcs.length>1) b.pagoEm=parcs[i].venc;
        if(grupo){b.grupo=grupo; b.parcela=`${i+1}/${parcs.length}`}
        await db.collection("fin_lanc").add(b);
      }
      flash("#fn-toast",parcs.length>1?`${parcs.length} parcelas lançadas.`:"Lançamento salvo.");
    }
    fnReset();
  }catch(err){flash("#fn-toast",erroTxt(err))}
  finally{$("#fn-salvar").disabled=false}
}

/* ---------- XML da NF-e ---------- */
window.finDadosXml=function(doc){
  try{
    const g=(el,n)=>el?.getElementsByTagNameNS("*",n)[0]?.textContent?.trim()||"";
    const inf=doc.getElementsByTagNameNS("*","infNFe")[0], ide=doc.getElementsByTagNameNS("*","ide")[0];
    const emit=doc.getElementsByTagNameNS("*","emit")[0], dest=doc.getElementsByTagNameNS("*","dest")[0], tot=doc.getElementsByTagNameNS("*","ICMSTot")[0];
    const chave=(g(doc,"chNFe")||inf?.getAttribute("Id")||"").replace(/\D/g,"");
    const dups=[...doc.getElementsByTagNameNS("*","dup")].map(d=>({n:g(d,"nDup"),venc:g(d,"dVenc"),valor:+g(d,"vDup")||0})).filter(d=>d.valor>0);
    const itens=[...doc.getElementsByTagNameNS("*","det")].map(d=>{const p=d.getElementsByTagNameNS("*","prod")[0];const q=+g(p,"qCom")||0;
      return {desc:`${g(p,"xProd")} — ${num(q)} ${g(p,"uCom")}`,valor:+(((+g(p,"vProd")||0)-(+g(p,"vDesc")||0)).toFixed(2))}});
    return {chave,numero:g(ide,"nNF"),data:(g(ide,"dhEmi")||g(ide,"dEmi")).slice(0,10),emit:g(emit,"xFant")||g(emit,"xNome"),
      dest:g(dest,"xNome"),total:+g(tot,"vNF")||itens.reduce((s,i)=>s+i.valor,0),dups,itens};
  }catch{return null}
};
const jaLancada=chave=>chave&&fnLanc.find(l=>l.chave===chave);
window.finNfOpcao=function(fin){
  if(!fin) return "";
  const ja=jaLancada(fin.chave);
  if(ja) return `<p class="note">Esta nota já está no Financeiro (${esc(ja.descricao)}).</p>`;
  const p=fin.dups.length?fin.dups.map(d=>`${brDate(d.venc)} ${brl(d.valor)}`).join(" · "):"sem parcelas na nota (vence na data da nota)";
  return `<label class="nf-chk fn-nfopt"><input type="checkbox" id="nf-fin" checked> Lançar também no Financeiro (contas a pagar)</label>
    <p class="note">Total da nota ${brl(fin.total)}${fin.dest?` · em nome de ${esc(fin.dest)}`:""} · ${p}</p>`;
};
function parcelasDaNota(fin,data){
  return fin.dups.length?fin.dups.map(d=>({venc:d.venc,valor:d.valor})):[{venc:data||fin.data,valor:fin.total}];
}
window.finDaNota=async function(fin,{data,nf,origem}){
  if(!db||!fin) return "";
  if(jaLancada(fin.chave)) return "";
  const parcs=parcelasDaNota(fin,data), agora=new Date().toISOString(), grupo=parcs.length>1?rid():null;
  for(let i=0;i<parcs.length;i++){
    const b={natureza:"pagar",descricao:`Compra de insumos — NF ${nf||fin.numero}`,pessoa:origem||fin.emit,categoria:"insumos",forma:fin.dups.length?"prazo":"avista",
      competencia:data||fin.data,vencimento:parcs[i].venc,valor:parcs[i].valor,status:"aberto",nf:nf||fin.numero,titular:fin.dest||"",chave:fin.chave,itens:fin.itens,obs:"",criadoEm:agora};
    if(grupo){b.grupo=grupo; b.parcela=`${i+1}/${parcs.length}`}
    await db.collection("fin_lanc").add(b);
  }
  return ` ${parcs.length>1?parcs.length+" parcelas lançadas":"Conta a pagar lançada"} no Financeiro.`;
};
async function importarXml(file){
  try{
    const doc=new DOMParser().parseFromString(await file.text(),"application/xml");
    if(doc.querySelector("parsererror")) throw 0;
    const fin=window.finDadosXml(doc); if(!fin||!fin.itens.length) throw 0;
    const ja=jaLancada(fin.chave);
    fnReset(); fnSetNat("pagar"); fnChave=fin.chave||null;
    $("#fn-desc").value=`Nota ${fin.numero} — ${fin.emit}`; $("#fn-pessoa").value=fin.emit; $("#fn-data").value=fin.data; $("#fn-nf").value=fin.numero; $("#fn-tit").value=fin.dest;
    $("#fn-forma").value=fin.dups.length?"prazo":"avista";
    itensRender(fin.itens); parcsRender(parcelasDaNota(fin));
    const noEst=(typeof estoque!=="undefined"?estoque:[]).some(e=>(e.entradas||[]).some(x=>x.chave&&x.chave===fin.chave));
    origemTxt(ja?`<span class="falta">Atenção: esta nota já foi lançada (${esc(ja.descricao)}).</span>`:
      `Nota ${esc(fin.numero)} lida: ${fin.itens.length} ite${fin.itens.length===1?"m":"ns"}, ${fin.dups.length||1} parcela(s). Escolha a categoria e salve.`+
      (noEst?"":` <span class="note">Se forem insumos para o estoque, importe pela aba <b>Estoque</b>: lá entra no estoque e no Financeiro de uma vez.</span>`));
  }catch{flash("#fn-toast","Não consegui ler o XML. Confira se é o XML da NF-e.")}
}

/* Várias notas de uma vez (histórico): só no Financeiro, sem mexer no estoque */
let loteNotas=[];
async function importarLote(files){
  const box=$("#fn-lxml"); box.hidden=false; box.innerHTML=`<p class="note">Lendo ${files.length} notas…</p>`;
  const vistas=new Set(); loteNotas=[];
  for(const f of files){
    let fin=null; try{const doc=new DOMParser().parseFromString(await f.text(),"application/xml"); if(!doc.querySelector("parsererror")) fin=window.finDadosXml(doc)}catch{}
    if(!fin||!fin.itens.length){loteNotas.push({arq:f.name,erro:"não é XML de NF-e"});continue}
    if(fin.chave&&vistas.has(fin.chave)){loteNotas.push({arq:f.name,fin,erro:"repetida na seleção"});continue}
    vistas.add(fin.chave);
    if(jaLancada(fin.chave)){loteNotas.push({arq:f.name,fin,erro:"já está no Financeiro"});continue}
    loteNotas.push({arq:f.name,fin});
  }
  loteNotas.sort((a,b)=>String(a.fin?.data||"").localeCompare(String(b.fin?.data||"")));
  const boas=loteNotas.filter(x=>!x.erro), tot=boas.reduce((t,x)=>t+x.fin.total,0);
  box.innerHTML=`<div class="row" style="justify-content:space-between"><b>${boas.length} nota${boas.length===1?"":"s"} para lançar · ${brl(tot)}</b><button type="button" class="link" id="lx-fecha">Cancelar</button></div>
    <div class="fn-lx-lista">${loteNotas.map(x=>`<div class="fn-lx${x.erro?" off":""}"><div><b>${x.fin?`NF ${esc(x.fin.numero)} · ${esc(x.fin.emit)}`:esc(x.arq)}</b>
      <small>${x.erro?`<span class="falta">${esc(x.erro)}</span>`:`${x.fin.data?brDate(x.fin.data):""}${x.fin.dest?" · "+esc(x.fin.dest):""} · ${x.fin.dups.length||1} parcela${(x.fin.dups.length||1)===1?"":"s"}`}</small></div>
      <span class="mono">${x.fin?brl(x.fin.total):""}</span></div>`).join("")}</div>
    <div class="grid2">
      <div class="field"><label for="lx-cat">Categoria</label><select id="lx-cat">${Object.entries(FN_CAT.pagar).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></div>
      <div class="field"><label for="lx-sit">Situação</label><select id="lx-sit"><option value="pago">Já pagas na data do vencimento (as que vencem depois de hoje ficam em aberto)</option><option value="aberto">Em aberto</option></select></div>
      <div class="field" id="lx-conta-box"><label for="lx-conta">Conta</label><select id="lx-conta">${fnContas.map(c=>`<option value="${c.id}"${c.id===contaPadrao()?" selected":""}>${esc(c.nome)}</option>`).join("")||`<option value="">Cadastre uma conta no Resumo</option>`}</select></div>
    </div>
    <p class="note">Vão só para o Financeiro (contas e livro caixa), com os produtos discriminados. O estoque não muda — notas novas de insumo continuam sendo importadas pela aba Estoque.</p>
    <div class="row"><button type="button" class="btn" id="lx-ok"${boas.length?"":" disabled"}>Lançar ${boas.length} nota${boas.length===1?"":"s"}</button><span class="note" id="lx-st"></span></div>`;
  $("#lx-fecha").onclick=()=>{box.hidden=true;box.innerHTML="";loteNotas=[]};
  $("#lx-sit").onchange=()=>{$("#lx-conta-box").hidden=$("#lx-sit").value!=="pago"};
  $("#lx-ok").onclick=async()=>{
    const cat=$("#lx-cat").value, pago=$("#lx-sit").value==="pago", conta=$("#lx-conta").value;
    if(pago&&!conta){$("#lx-st").textContent="Cadastre uma conta no Resumo primeiro.";return}
    $("#lx-ok").disabled=true; let n=0;
    try{
      for(const x of loteNotas.filter(x=>!x.erro)){
        const fin=x.fin, parcs=parcelasDaNota(fin), grupo=parcs.length>1?rid():null, agora=new Date().toISOString();
        for(let i=0;i<parcs.length;i++){
          const b={natureza:"pagar",descricao:`Nota ${fin.numero} — ${fin.emit}`,pessoa:fin.emit,categoria:cat,forma:fin.dups.length?"prazo":"avista",competencia:fin.data,
            vencimento:parcs[i].venc,valor:parcs[i].valor,status:pago&&parcs[i].venc<=hoje()?"pago":"aberto",nf:fin.numero,titular:fin.dest||"",chave:fin.chave,itens:fin.itens,obs:"",criadoEm:agora};
          if(b.status==="pago"){b.pagoEm=parcs[i].venc; b.contaId=conta}
          if(grupo){b.grupo=grupo; b.parcela=`${i+1}/${parcs.length}`}
          await db.collection("fin_lanc").add(b);
        }
        n++; $("#lx-st").textContent=`Lançando… ${n} de ${loteNotas.filter(x=>!x.erro).length}`;
      }
      if(pago) lembraConta(conta);
      box.innerHTML=`<p class="toast">${n} nota${n===1?"":"s"} lançada${n===1?"":"s"} no Financeiro.</p>`; setTimeout(()=>{box.hidden=true},5000); loteNotas=[];
    }catch(err){$("#lx-st").textContent=`Parei em ${n} notas: ${erroTxt(err)} Escolha os arquivos de novo — as já lançadas são puladas.`; $("#lx-ok").disabled=false}
  };
}

/* ---------- LISTA de contas a pagar e a receber ---------- */
function situacao(l){
  const h=hoje();
  if(l.status==="pago") return l.quitGraos?`<span class="pill ok">Quitada em grãos</span>`:`<span class="pill ok">${l.natureza==="receber"?"Recebido":"Pago"} ${brDate(l.pagoEm||l.vencimento)}</span>`;
  const d=dias(h,l.vencimento);
  return d<0?`<span class="pill venc">Vencida há ${-d} dia${d===-1?"":"s"}</span>`:d===0?`<span class="pill venc">Vence hoje</span>`:d<=7?`<span class="pill prox">Vence em ${d} dia${d===1?"":"s"}</span>`:`<span class="pill">Vence ${brDate(l.vencimento)}</span>`;
}
function renderContas(){
  const h=hoje();
  const ab=fnLanc.filter(l=>l.status!=="pago"&&l.natureza!=="transf");
  const sm=a=>a.reduce((t,l)=>t+vp(l),0);
  $("#fn-s-pagar").textContent=brlC(sm(ab.filter(l=>l.natureza==="pagar")));
  $("#fn-s-receber").textContent=brlC(sm(ab.filter(l=>l.natureza==="receber")));
  const v=ab.filter(l=>l.vencimento<h); $("#fn-s-venc").textContent=v.length?brlC(sm(v)):"0";
  $("#fn-filtro").innerHTML=Object.entries(FN_FILTROS).map(([k,l])=>`<button type="button" class="chip" aria-pressed="${k===fnFiltro}" data-k="${k}">${l}</button>`).join("");
  $("#fn-filtro").querySelectorAll("button").forEach(b=>b.onclick=()=>{fnFiltro=b.dataset.k;renderContas()});
  const q=norm($("#fn-busca").value);
  let vis=fnLanc.filter(l=>{
    switch(fnFiltro){case "abertas":return l.status!=="pago"&&l.natureza!=="transf"; case "pagar":return l.status!=="pago"&&l.natureza==="pagar";
      case "receber":return l.status!=="pago"&&l.natureza==="receber"; case "vencidas":return l.status!=="pago"&&l.natureza!=="transf"&&l.vencimento<h;
      case "pagas":return l.status==="pago"; default:return true}});
  if(q) vis=vis.filter(l=>norm([l.descricao,l.pessoa,l.nf,l.titular,l.obs,catNome(l.categoria),...(l.itens||[]).map(i=>i.desc)].join(" ")).includes(q));
  vis.sort(fnFiltro==="pagas"||fnFiltro==="todas"?(a,b)=>dataLanc(b).localeCompare(dataLanc(a)):(a,b)=>a.vencimento.localeCompare(b.vencimento));
  $("#fn-lista").innerHTML=vis.length?vis.slice(0,300).map(l=>{
    const tr=l.natureza==="transf", r=l.natureza==="receber";
    const cor=tr?"--muted":l.status==="pago"?"--line":l.vencimento<h?"--danger":r?"--accent":"--t-aplicacao";
    return `<article class="rec fn-rec" style="--c:var(${cor})">
      <div class="rec-top"><span class="rec-tipo">${esc(l.descricao)}${l.parcela?` <small class="note">parcela ${esc(l.parcela)}</small>`:""}</span><span class="mov-q ${r?"in":"out"}">${tr?"":r?"+":"−"}${brl(vp(l))}</span></div>
      <div class="rec-top">${tr?`<span>${esc(nomeConta(l.contaId))} → ${esc(nomeConta(l.contaDestino))} · ${brDate(l.pagoEm)}</span>`:situacao(l)}<span class="note">${tr?"Transferência":esc(catNome(l.categoria))}</span></div>
      ${tr?"":`<div class="rec-campos">${l.pessoa?`<span>${r?"Comprador":"Fornecedor"} <b>${esc(l.pessoa)}</b></span>`:""}${l.nf?`<span>NF <b>${esc(l.nf)}</b></span>`:""}${l.forma?`<span>${esc(FN_FORMAS[l.forma]||l.forma)}</span>`:""}${l.categoria==="financ"?`<span>Juros <b>${l.juros!=null?brl(l.juros):"não informado"}</b></span>`:""}${l.titular?`<span>Em nome de <b>${esc(l.titular)}</b></span>`:""}${l.status==="pago"&&l.contaId?`<span>Conta <b>${esc(nomeConta(l.contaId))}</b></span>`:""}${l.quitGraos?`<span>Quitada com <b>${num(l.quitGraos.sacas)} sc de ${esc(l.quitGraos.cultura)}</b></span>`:""}${l.valorPago!=null&&l.status==="pago"&&Math.abs(l.valorPago-l.valor)>0.004?`<span>Previsto <b>${brl(l.valor)}</b></span>`:""}</div>`}
      ${(l.itens||[]).length?`<details class="fn-det"><summary>${l.itens.length} ite${l.itens.length===1?"m":"ns"}</summary>${l.itens.map(i=>`<div class="fn-it"><span>${esc(i.desc)}</span><span class="mono">${i.valor!=null?brl(i.valor):""}</span></div>`).join("")}</details>`:""}
      ${l.obs?`<p class="rec-desc">${esc(l.obs)}</p>`:""}
      ${assinatura(l)}
      <div class="fn-baixa" id="bx-${l.id}" hidden></div>
      <div class="rec-actions">${!tr&&l.status!=="pago"?`<button type="button" class="btn fn-mini" data-fbx="${l.id}">${r?"Receber":"Pagar"}</button>`:""}${!tr&&l.status==="pago"?`<button type="button" class="link" data-fdes="${l.id}">Desfazer ${r?"recebimento":"pagamento"}</button>`:""}<button type="button" class="link" data-fed="${l.id}">Editar</button><button type="button" class="link danger" data-fdel="${l.id}">Excluir</button></div>
    </article>`}).join("")+(vis.length>300?`<p class="note">Mostrando 300 de ${vis.length}. Use a busca para achar os outros.</p>`:""):
    `<div class="empty">${fnLanc.length?"Nada com esse filtro.":"Nenhuma conta lançada ainda.<br>Use o formulário, importe o XML de uma nota ou traga do Diário pelo Resumo."}</div>`;
  const L=$("#fn-lista");
  L.querySelectorAll("[data-fed]").forEach(b=>b.onclick=()=>formEditar(fnLanc.find(x=>x.id===b.dataset.fed)));
  L.querySelectorAll("[data-fdel]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar exclusão",async()=>{await db.collection("fin_lanc").doc(b.dataset.fdel).delete()}));
  L.querySelectorAll("[data-fbx]").forEach(b=>b.onclick=()=>abreBaixa(fnLanc.find(x=>x.id===b.dataset.fbx)));
  L.querySelectorAll("[data-fdes]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar: voltar para em aberto",async()=>{
    const l=fnLanc.find(x=>x.id===b.dataset.fdes), {id,...d}=l;
    delete d.pagoEm; delete d.contaId; delete d.valorPago; d.status="aberto";
    if(d.quitGraos?.grId) await db.collection("graos").doc(d.quitGraos.grId).delete().catch(()=>{});
    delete d.quitGraos;
    await db.collection("fin_lanc").doc(id).set(d)}));
  if(fnBaixa){const l=fnLanc.find(x=>x.id===fnBaixa); if(l&&l.status!=="pago") abreBaixa(l,true); else fnBaixa=null}
}
function abreBaixa(l,manter){
  document.querySelectorAll(".fn-baixa").forEach(x=>{if(x.id!=="bx-"+l.id){x.hidden=true;x.innerHTML=""}});
  const box=$("#bx-"+l.id); if(!box) return;
  if(!manter&&!box.hidden){box.hidden=true;box.innerHTML="";fnBaixa=null;return}
  fnBaixa=l.id; const r=l.natureza==="receber";
  if(box.innerHTML&&manter){box.hidden=false;return}
  const cults=[...new Set(["Soja","Milho","Trigo",...((typeof graos!=="undefined"?graos:[]).map(g=>g.cultura))].filter(Boolean))];
  const locs=[...new Set([...(typeof DEPOSITOS!=="undefined"?DEPOSITOS:[]),...((typeof graos!=="undefined"?graos:[]).map(g=>g.local))].filter(Boolean))];
  box.hidden=false;
  box.innerHTML=`<div class="chips fn-bx-modo">${[["dinheiro",r?"Recebi na conta":"Paguei com dinheiro / conta"],...(r?[]:[["graos","Paguei com grãos"]])].map(([k,t],i)=>`<button type="button" class="chip" aria-pressed="${i===0}" data-m="${k}">${t}</button>`).join("")}</div>
    <div class="grid2" data-bx="dinheiro">
      <div class="field"><label>Data</label><input type="date" class="bx-d" value="${hoje()}"></div>
      <div class="field"><label>Conta</label><select class="bx-c">${fnContas.length?fnContas.map(c=>`<option value="${c.id}"${c.id===contaPadrao()?" selected":""}>${esc(c.nome)}</option>`).join(""):`<option value="">Cadastre uma conta no Resumo</option>`}</select></div>
      <div class="field"><label>Valor ${r?"recebido":"pago"} (R$)</label><input class="bx-v" inputmode="decimal" value="${f2(Number(l.valor))}"></div>
    </div>
    <div class="grid2" data-bx="graos" hidden>
      <div class="field"><label>Data</label><input type="date" class="bg-d" value="${hoje()}"></div>
      <div class="field"><label>Sacas</label><input class="bg-sc" inputmode="decimal" placeholder="0"></div>
      <div class="field"><label>Cultura</label><select class="bg-cult">${cults.map(c=>`<option>${esc(c)}</option>`).join("")}</select></div>
      <div class="field"><label>Depósito de onde saíram</label><select class="bg-loc">${locs.map(c=>`<option>${esc(c)}</option>`).join("")}</select></div>
      <label class="nf-chk" style="grid-column:1/-1"><input type="checkbox" class="bg-gr" checked> Tirar as sacas do saldo em Grãos (lança como venda pelo valor da conta)</label>
    </div>
    <p class="note">${r?"":"Juros ou desconto? Ajuste o valor pago; o previsto fica guardado."}</p>
    <div class="row"><button type="button" class="btn fn-mini bx-ok">Confirmar</button><button type="button" class="link bx-no">Cancelar</button><span class="falta bx-st"></span></div>`;
  let modo="dinheiro";
  box.querySelectorAll(".fn-bx-modo .chip").forEach(b=>b.onclick=()=>{modo=b.dataset.m; box.querySelectorAll(".fn-bx-modo .chip").forEach(c=>c.setAttribute("aria-pressed",c===b)); box.querySelectorAll("[data-bx]").forEach(x=>x.hidden=x.dataset.bx!==modo)});
  box.querySelector(".bx-no").onclick=()=>{box.hidden=true;box.innerHTML="";fnBaixa=null};
  box.querySelector(".bx-ok").onclick=async()=>{
    const st=t=>box.querySelector(".bx-st").textContent=t, {id,...d}=l;
    try{
      if(modo==="dinheiro"){
        const c=box.querySelector(".bx-c").value, v=parseNum(box.querySelector(".bx-v").value), dt=box.querySelector(".bx-d").value||hoje();
        if(!c){st("Cadastre uma conta no Resumo.");return} if(!(v>0)){st("Informe o valor.");return}
        Object.assign(d,{status:"pago",pagoEm:dt,contaId:c}); lembraConta(c); if(Math.abs(v-Number(l.valor))>0.004) d.valorPago=v; else delete d.valorPago;
      }else{
        const sc=parseNum(box.querySelector(".bg-sc").value), dt=box.querySelector(".bg-d").value||hoje(), cult=box.querySelector(".bg-cult").value, loc=box.querySelector(".bg-loc").value;
        if(!(sc>0)){st("Informe as sacas.");return}
        const q={sacas:sc,cultura:cult,local:loc};
        if(box.querySelector(".bg-gr").checked){
          const ref=await db.collection("graos").add({tipo:"venda",titular:"lavoura",data:dt,cultura:cult,local:loc,sacas:sc,valorTotal:Number(l.valor)||null,contrato:`Troca: ${l.descricao}`.slice(0,120),obs:`Pagamento de conta no Financeiro${l.pessoa?" ("+l.pessoa+")":""}`,finId:id,criadoEm:new Date().toISOString()});
          q.grId=ref?.id||null;
        }
        Object.assign(d,{status:"pago",pagoEm:dt,quitGraos:q}); delete d.contaId; delete d.valorPago;
      }
      box.querySelector(".bx-ok").disabled=true;
      fnBaixa=null; await db.collection("fin_lanc").doc(id).set(d);
    }catch(err){st(erroTxt(err)); box.querySelector(".bx-ok").disabled=false}
  };
}

/* ---------- LIVRO CAIXA ---------- */
let lcConta="";
function periodos(){
  const h=hoje(), out=[["mes:"+h.slice(0,7),"Este mês"],["mes:"+addMes(h.slice(0,7)+"-01",-1).slice(0,7),"Mês passado"]];
  const sy=safraDe(h), anos=new Set([sy]);
  for(const l of fnLanc) if(l.status==="pago") anos.add(safraDe(l.pagoEm||l.vencimento));
  for(const y of [...anos].sort((a,b)=>b-a)) out.push(["safra:"+y,"Safra "+safraLab(y)]);
  const cal=new Set([+h.slice(0,4)]); for(const l of fnLanc) if(l.status==="pago") cal.add(+(l.pagoEm||l.vencimento).slice(0,4));
  for(const y of [...cal].sort((a,b)=>b-a)) out.push(["ano:"+y,"Ano "+y]);
  out.push(["tudo","Tudo"]);
  return out;
}
function faixa(p){
  if(p.startsWith("mes:")){const m=p.slice(4); return [m+"-01",addMes(m+"-01",1).slice(0,8)+"00"]}
  if(p.startsWith("safra:")){const y=+p.slice(6); return [`${y}-07-01`,`${y+1}-06-30`]}
  if(p.startsWith("ano:")){const y=p.slice(4); return [`${y}-01-01`,`${y}-12-31`]}
  return ["0000","9999"];
}
function lcLinhas(){
  const per=$("#lc-per").value||"mes:"+hoje().slice(0,7), [a,b]=faixa(per), conta=$("#lc-conta").value, tit=$("#lc-tit").value;
  const movs=[];
  for(const l of fnLanc){
    if(l.status!=="pago"||l.quitGraos) continue;
    const d=l.pagoEm||l.vencimento, v=vp(l);
    if(l.natureza==="transf"){
      if(!conta) continue; // transferências entre contas não mudam o caixa total
      if(l.contaId===conta) movs.push({l,d,v:-v,c:conta}); if(l.contaDestino===conta) movs.push({l,d,v,c:conta});
      continue;
    }
    if(conta&&l.contaId!==conta) continue;
    if(tit&&norm(l.titular)!==tit) continue;
    movs.push({l,d,v:l.natureza==="receber"?v:-v,c:l.contaId});
  }
  movs.sort((x,y)=>x.d.localeCompare(y.d)||String(x.l.criadoEm).localeCompare(String(y.l.criadoEm)));
  // saldo antes do período (só faz sentido sem filtro de nome)
  let saldo=null;
  if(!tit){
    // o saldo só existe a partir da data do saldo inicial das contas; antes disso (histórico) a coluna some
    const cs=fnContas.filter(c=>!conta||c.id===conta), ini=Object.fromEntries(cs.map(c=>[c.id,c.dataInicial||""]));
    const primeiro=cs.map(c=>c.dataInicial||"").sort()[0];
    if(cs.length&&a>=(primeiro||"")){
      saldo=cs.reduce((t,c)=>t+(Number(c.saldoInicial)||0),0)+movs.filter(m=>m.d<a&&m.c in ini&&m.d>=ini[m.c]).reduce((t,m)=>t+m.v,0);
    }
  }
  const dentro=movs.filter(m=>m.d>=a&&m.d<=b);
  return {dentro,saldo,per,a,b};
}
function renderCaixa(){
  const keep=(id,html,def)=>{const v=$(id).value; $(id).innerHTML=html; if([...$(id).options].some(o=>o.value===v)) $(id).value=v; else if(def!=null) $(id).value=def};
  keep("#lc-per",periodos().map(([k,l])=>`<option value="${k}">${l}</option>`).join(""),"mes:"+hoje().slice(0,7));
  keep("#lc-conta",`<option value="">Todas as contas</option>`+fnContas.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join(""));
  if(lcConta){$("#lc-conta").value=lcConta; lcConta=""}
  const tits=[...new Map(fnLanc.filter(l=>l.titular).map(l=>[norm(l.titular),l.titular])).entries()];
  keep("#lc-tit",`<option value="">Todos</option>`+tits.map(([k,t])=>`<option value="${esc(k)}">${esc(t)}</option>`).join(""));
  const {dentro,saldo}=lcLinhas();
  const ent=dentro.filter(m=>m.v>0).reduce((t,m)=>t+m.v,0), sai=-dentro.filter(m=>m.v<0).reduce((t,m)=>t+m.v,0);
  $("#lc-ent").textContent=brlC(ent); $("#lc-sai").textContent=brlC(sai); $("#lc-res").textContent=brlC(ent-sai);
  let acc=saldo;
  const linhas=dentro.map(m=>{const l=m.l; if(acc!=null) acc+=m.v;
    const hist=l.natureza==="transf"?`${esc(l.descricao||"Transferência")} <small class="note">${esc(nomeConta(l.contaId))} → ${esc(nomeConta(l.contaDestino))}</small>`:
      `${esc(l.descricao)}${l.parcela?` <small class="note">(${esc(l.parcela)})</small>`:""}<small class="note fn-lc-sub">${[l.pessoa,catNome(l.categoria),nomeConta(l.contaId),l.nf?"NF "+l.nf:"",l.titular].filter(Boolean).map(esc).join(" · ")}</small>`+
      ((l.itens||[]).length?`<details class="fn-det"><summary>${l.itens.length} ite${l.itens.length===1?"m":"ns"}</summary>${l.itens.map(i=>`<div class="fn-it"><span>${esc(i.desc)}</span><span>${i.valor!=null?brl(i.valor):""}</span></div>`).join("")}</details>`:"");
    return `<tr><td class="fn-lc-d">${brDate(m.d).slice(0,5)}<small class="note">${m.d.slice(0,4)}</small></td><td class="fn-lc-h">${hist}</td><td class="fn-lc-v"><span class="${m.v>0?"fn-pos":"fn-neg"}">${m.v>0?"+":"−"}${brl(Math.abs(m.v))}</span>${acc!=null?`<small class="${acc<0?"fn-neg":""}">saldo ${brl(acc)}</small>`:""}</td></tr>`});
  $("#lc-tbl").innerHTML=dentro.length?`<thead><tr><th>Data</th><th style="text-align:left">Histórico</th><th>Valor${saldo!=null?" / saldo":""}</th></tr></thead><tbody>
    ${saldo!=null?`<tr class="fn-lc-ini"><td></td><td class="fn-lc-h">Saldo anterior</td><td class="fn-lc-v"><small>${brl(saldo)}</small></td></tr>`:""}${linhas.join("")}</tbody>`:
    `<tbody><tr><td class="empty" style="text-align:center">Nenhum pagamento ou recebimento neste período.</td></tr></tbody>`;
}
async function lcPlanilha(){
  const st=t=>$("#lc-st").textContent=t;
  if(typeof downloads==="undefined"||!downloads){st("Download indisponível neste aparelho.");return}
  const {dentro,saldo,per}=lcLinhas(); let acc=saldo;
  const rows=dentro.flatMap(m=>{const l=m.l; if(acc!=null) acc+=m.v;
    const base={"Data":brDate(m.d),"Histórico":l.descricao||"","Parcela":l.parcela||"","Fornecedor / comprador":l.pessoa||"","Categoria":l.natureza==="transf"?"Transferência":catNome(l.categoria),
      "Conta":l.natureza==="transf"?`${nomeConta(l.contaId)} → ${nomeConta(l.contaDestino)}`:nomeConta(l.contaId),"NF":l.nf||"","Em nome de":l.titular||"",
      "Entrada (R$)":m.v>0?+m.v.toFixed(2):"","Saída (R$)":m.v<0?+(-m.v).toFixed(2):"","Saldo (R$)":acc!=null?+acc.toFixed(2):"","Produto / item":"","Valor do item (R$)":""};
    return [base,...(l.itens||[]).map(i=>({...Object.fromEntries(Object.keys(base).map(k=>[k,""])),"Data":brDate(m.d),"Histórico":l.descricao||"","NF":l.nf||"","Produto / item":i.desc,"Valor do item (R$)":i.valor??""}))]});
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"Sem lançamentos":""}]);
  ws["!cols"]=Object.keys(rows[0]||{a:1}).map(k=>({wch:Math.min(50,Math.max(12,k.length+2,...rows.slice(0,200).map(r=>String(r[k]??"").length)))}));
  XLSX.utils.book_append_sheet(wb,ws,"Livro caixa");
  const nome=`Livro caixa - ${$("#lc-per").selectedOptions[0]?.textContent||"periodo"}.xlsx`.replace(/[\/\\:*?"<>|]/g,"-");
  try{const r=await downloads.save({filename:nome,data:new Blob([XLSX.write(wb,{bookType:"xlsx",type:"array"})])}); st(r?.status==="saved"?"Planilha salva.":"")}
  catch(e){st(e?.code==="declined"?"":"Não foi possível salvar o arquivo.")}
}

/* ---------- RESULTADO DA SAFRA ---------- */
function renderSafra(){
  const sy0=safraDe(hoje());
  const anos=new Set([sy0]); for(const l of fnLanc) if(l.competencia) anos.add(safraDe(l.competencia));
  for(const r of registros) if(r.tipo==="colheita") anos.add(safraDe(r.data));
  const keep=$("#rs-safra").value;
  $("#rs-safra").innerHTML=[...anos].sort((a,b)=>b-a).map(y=>`<option value="${y}">${safraLab(y)}</option>`).join("");
  if([...$("#rs-safra").options].some(o=>o.value===keep)) $("#rs-safra").value=keep;
  const sy=+$("#rs-safra").value, naS=d=>d&&safraDe(d)===sy, rateio=$("#rs-rateio").value==="area";
  const lan=fnLanc.filter(l=>l.natureza!=="transf"&&naS(l.competencia||l.vencimento));
  // receitas: vendas lançadas no Diário + outras receitas do Financeiro
  const vendas=grMovs().filter(m=>m.tipo==="venda"&&naS(m.data)&&Number(m.valorTotal)>0);
  const recGraos=vendas.reduce((t,m)=>t+Number(m.valorTotal),0);
  const outrasRec=lan.filter(l=>l.natureza==="receber"&&l.categoria!=="graos"&&!NAO_RECEITA.has(l.categoria));
  const recOutras=outrasRec.reduce((t,l)=>t+vp(l),0);
  // preço médio por cultura (desta safra; se não houver, de todas as vendas)
  const preco=c=>{const f=a=>{const v=a.filter(m=>m.cultura===c&&Number(m.valorTotal)>0); const sc=v.reduce((t,m)=>t+m.sacas,0); return sc>0?v.reduce((t,m)=>t+Number(m.valorTotal),0)/sc:null};
    return f(vendas)??f(grMovs().filter(m=>m.tipo==="venda"))};
  // custos por categoria (competência)
  const cat={};
  let amort=0, semJuros=0;
  for(const l of lan){
    if(l.natureza!=="pagar"||NAO_CUSTO.has(l.categoria)) continue;
    let v=vp(l);
    if(l.categoria==="financ"){const j=jurosDe(l); amort+=v-j; v=j; if(l.juros==null) semJuros++}
    if(v>0) cat[l.categoria]=(cat[l.categoria]||0)+v;
  }
  const invest=lan.filter(l=>l.natureza==="pagar"&&NAO_CUSTO.has(l.categoria)).reduce((t,l)=>t+vp(l),0);
  // arrendamento pago em sacas (Grãos), avaliado pelo preço médio, se não houver lançamento em dinheiro
  const arr=grMovs().filter(m=>m.tipo==="arrendamento"&&naS(m.data));
  let arrTxt="";
  if(!cat.arrendamento&&arr.length){const v=arr.reduce((t,m)=>t+m.sacas*(preco(m.cultura)||0),0), sc=arr.reduce((t,m)=>t+m.sacas,0);
    if(v>0){cat.arrendamento=v; arrTxt=`${num(sc)} sc pagas ao ${titNome("pai")} valendo ${brlC(v)} pelo preço médio de venda`}}
  const custo=Object.values(cat).reduce((t,v)=>t+v,0), receita=recGraos+recOutras;
  const area=TALHOES.reduce((t,x)=>t+x.ha,0);
  const kpi=(l,v,sub,cls)=>`<div class="kpi${cls?" "+cls:""}"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:""}</div>`;
  $("#rsf-kpis").innerHTML=[kpi("Receitas",brlC(receita),`${vendas.length} venda${vendas.length===1?"":"s"} de grãos`),kpi("Custos",brlC(custo),area?`${brl(custo/area)}/ha`:""),
    kpi("Resultado",brlC(receita-custo),receita?`${num((receita-custo)/receita*100)}% da receita`:"",receita-custo<0?"fn-neg":""),kpi("Fora do custo",brlC(invest+amort),"investimentos e amortizações")].join("");
  const pend=pendencias("todas").filter(p=>naS(p.data)), al=[];
  if(pend.length) al.push(`<div class="falta fn-al">${pend.length} lançamento${pend.length===1?"":"s"} do Diário desta safra ainda não ${pend.length===1?"está":"estão"} no Financeiro — os custos podem estar incompletos. <button type="button" class="link" data-fnres>Ver no Resumo</button></div>`);
  if(semJuros) al.push(`<p class="note">${semJuros} parcela${semJuros===1?"":"s"} de financiamento desta safra sem os juros informados: ${semJuros===1?"conta":"contam"} como amortização (fora do custo). Edite a parcela em Contas e informe os juros.</p>`);
  if(arrTxt) al.push(`<p class="note">Arrendamento: ${esc(arrTxt)}.</p>`);
  $("#rsf-alertas").innerHTML=al.join(""); $("#rsf-alertas").querySelector("[data-fnres]")?.addEventListener("click",()=>show("fin_resumo"));
  const cores=["--s1","--s2","--s3","--s4","--t-adubacao","--t-mecanizacao","--t-diesel","--t-benf","--t-maquina","--t-chuva"];
  hbars("rsf-cat",Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(([k,v],i)=>({l:catNome(k),v,cor:cores[i%cores.length],extra:area?`${brl(v/area)}/ha`:""})),{fmt:brlC});
  const recC={}; for(const m of vendas) recC["Venda de "+m.cultura]=(recC["Venda de "+m.cultura]||0)+Number(m.valorTotal); for(const l of outrasRec) recC[catNome(l.categoria)]=(recC[catNome(l.categoria)]||0)+vp(l);
  hbars("rsf-rec",Object.entries(recC).map(([l,v])=>({l,v,cor:"--s3"})),{fmt:brlC});
  // por talhão: insumos aplicados (registros executados) + demais custos rateados por área + produção × preço médio
  const ins={}; for(const r of registros) if(!ehProg(r)&&naS(r.data)&&r.custoHa>0) for(const t of r.talhoes||[]) ins[t]=(ins[t]||0)+(Number(r.custoHa)||0)*(Number(r.areas?.[t])||haDe(t));
  const gerais=Object.entries(cat).filter(([k])=>k!=="insumos").reduce((t,[,v])=>t+v,0);
  const prod={}; for(const p of grProducao(sy)){const x=prod[p.talhao]||={sc:0,area:0,rec:0,cults:new Set()}; x.sc+=p.sacas; x.area+=p.area; x.rec+=p.sacas*(preco(p.cultura)||0); x.cults.add(p.cultura)}
  let tot={a:0,i:0,g:0,sc:0,r:0};
  const rows=TALHOES.map(t=>{const i=ins[t.n]||0, g=rateio&&area?gerais*t.ha/area:0, p=prod[t.n]||{sc:0,area:0,rec:0,cults:new Set()}, c=i+g;
    tot.a+=t.ha; tot.i+=i; tot.g+=g; tot.sc+=p.sc; tot.r+=p.rec;
    return `<tr><td>${esc(t.n)}${p.cults.size?` <small class="note">${esc([...p.cults].join(", "))}</small>`:""}</td><td>${num(t.ha)}</td><td>${brlC(i)}</td>${rateio?`<td>${brlC(g)}</td>`:""}<td>${brl(t.ha?c/t.ha:0)}</td><td>${p.sc?num(p.sc):"–"}</td><td>${p.area?num(p.sc/p.area):"–"}</td><td>${p.rec?brlC(p.rec):"–"}</td><td class="${p.rec-c<0?"fn-neg":""}">${p.rec?brlC(p.rec-c):"–"}</td></tr>`});
  const ct=tot.i+tot.g;
  $("#rsf-tal").innerHTML=`<thead><tr><th>Talhão</th><th>ha</th><th>Insumos</th>${rateio?"<th>Gerais</th>":""}<th>Custo/ha</th><th>Sacas</th><th>sc/ha</th><th>Receita</th><th>Resultado</th></tr></thead><tbody>${rows.join("")}</tbody>
    <tfoot><tr><td>Total</td><td>${num(tot.a)}</td><td>${brlC(tot.i)}</td>${rateio?`<td>${brlC(tot.g)}</td>`:""}<td>${brl(tot.a?ct/tot.a:0)}</td><td>${num(tot.sc)}</td><td>–</td><td>${brlC(tot.r)}</td><td class="${tot.r-ct<0?"fn-neg":""}">${brlC(tot.r-ct)}</td></tr></tfoot>`;
  $("#rsf-tal-nota").textContent=`Insumos: o que foi aplicado em cada talhão (registros executados). ${rateio?`Gerais: diesel, máquinas, benfeitorias, mão de obra, arrendamento e outros custos da safra (${brlC(gerais)}) divididos pela área.`:"Custos gerais não divididos."} Receita: sacas colhidas × preço médio de venda.`;
}

/* ---------- ligação com o app ---------- */
window.finColecoes=()=>({fin_contas:fnContas,fin_lanc:fnLanc});
window.finPlanilha=function(add,dt){
  const ord=[...fnLanc].sort((a,b)=>String(a.vencimento).localeCompare(String(b.vencimento)));
  add("Financeiro",ord.map(l=>({"Tipo":FN_NAT[l.natureza]||l.natureza,"Descrição":l.descricao||"","Parcela":l.parcela||"","Fornecedor / comprador":l.pessoa||"",
    "Categoria":l.natureza==="transf"?"Transferência":catNome(l.categoria),"Forma":FN_FORMAS[l.forma]||"","Data da compra/venda":dt(l.competencia),"Vencimento":dt(l.vencimento),
    "Valor (R$)":Number(l.valor)||0,"Situação":l.status==="pago"?(l.quitGraos?"Quitada em grãos":l.natureza==="receber"?"Recebido":"Pago"):(l.vencimento<hoje()?"Vencida":"Em aberto"),
    "Pago/recebido em":dt(l.pagoEm),"Valor pago (R$)":l.status==="pago"?vp(l):"","Conta":l.natureza==="transf"?`${nomeConta(l.contaId)} → ${nomeConta(l.contaDestino)}`:nomeConta(l.contaId),
    "Grãos (sc)":l.quitGraos?`${l.quitGraos.sacas} sc ${l.quitGraos.cultura}`:"","NF":l.nf||"","Em nome de":l.titular||"",
    "Juros (R$)":l.categoria==="financ"?jurosDe(l):"","Itens":(l.itens||[]).map(i=>`${i.desc}${i.valor!=null?" "+brl(i.valor):""}`).join("; "),"Observação":l.obs||"","Lançado por":quem(l.criadoPor)})));
  const s=saldos();
  add("Contas bancárias",fnContas.map(c=>({"Conta":c.nome,"Tipo":FN_TIPOS[c.tipo]||c.tipo,"Saldo inicial (R$)":Number(c.saldoInicial)||0,"Data do saldo inicial":dt(c.dataInicial),"Saldo atual (R$)":+(s[c.id]||0).toFixed(2)})));
};
window.finConfig=()=>({inicio:fnCfg.inicio||null,ignorados:fnCfg.ignorados||[]});
window.finRender=function(view){
  if(!fnCarregou&&db) return;
  if(view==="fin_resumo") renderResumo();
  else if(view==="fin_contas"){renderContas(); if(!fnEdit){opcoesConta("#fn-conta",$("#fn-conta").value); opcoesConta("#fn-de",$("#fn-de").value); opcoesConta("#fn-para",$("#fn-para").value)}}
  else if(view==="fin_caixa") renderCaixa();
  else if(view==="fin_safra") renderSafra();
};
window.finAgenda=()=>{clearTimeout(window.finAgenda.t); window.finAgenda.t=setTimeout(()=>{
  for(const v of ["fin_resumo","fin_contas","fin_caixa","fin_safra"]) if(visivel(v)){try{window.finRender(v)}catch(e){console.error(e)}}
  const dl=[...new Set(fnLanc.map(l=>l.pessoa).filter(Boolean))]; $("#dl-fn-pessoa").innerHTML=dl.map(p=>`<option value="${esc(p)}">`).join("");
  $("#dl-fn-tit").innerHTML=[...new Set(fnLanc.map(l=>l.titular).filter(Boolean))].map(p=>`<option value="${esc(p)}">`).join("");
},200)};
let fnIniciou=false;
window.finInicia=function(){
  if(fnIniciou||!db) return; fnIniciou=true;
  let n=0; const pronto=()=>{if(++n>=3){fnCarregou=true; window.finAgenda()}};
  let a=false,b=false,c=false;
  db.collection("fin_contas").onSnapshot(s=>{fnContas=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.nome).sort((x,y)=>x.nome.localeCompare(y.nome,"pt-BR")); if(!a){a=true;pronto()} else window.finAgenda()},()=>{});
  db.collection("fin_lanc").onSnapshot(s=>{fnLanc=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.natureza&&(x.vencimento||x.pagoEm)); if(!b){b=true;pronto()} else window.finAgenda()},()=>{});
  db.collection("config").onSnapshot(s=>{const d=s.docs.find(x=>x.id==="financeiro")?.data(); fnCfg=d||{}; if(!c){c=true;pronto()} else window.finAgenda()},()=>{});
};

/* ---------- eventos fixos ---------- */
$("#fn-cat").innerHTML=""; $("#fn-forma").innerHTML=Object.entries(FN_FORMAS).map(([k,l])=>`<option value="${k}">${l}</option>`).join("");
$("#fc-tipo").innerHTML=Object.entries(FN_TIPOS).map(([k,l])=>`<option value="${k}">${l}</option>`).join("");
$("#fn-form").addEventListener("submit",salvarLanc);
$("#fn-cancel").onclick=()=>fnReset();
{const tip=$("#pn-tip"); if(tip&&tip.parentElement!==document.body) document.body.appendChild(tip)}
$("#fn-item-add").onclick=()=>{itensRender([...itensLer(),{desc:"",valor:null}]); const r=[...document.querySelectorAll("#fn-itens .i-desc")].pop(); r?.focus()};
$("#fn-dividir").onclick=dividir;
$("#fn-cat").addEventListener("change",jurosVis);
$("#fn-np").addEventListener("change",dividir);
$("#fn-xml").addEventListener("change",e=>{const fs=[...e.target.files]; e.target.value=""; if(fs.length===1) importarXml(fs[0]); else if(fs.length>1) importarLote(fs)});
$("#fn-busca").addEventListener("input",renderContas);
$("#fn-data").addEventListener("change",()=>{const r=parcsLer(); if(r.length===1&&!r[0].valor&&!fnEdit) parcsRender([{venc:$("#fn-data").value,valor:null}])});
$("#fn-conta-nova").onclick=()=>contaForm(null);
$("#fn-conta-cancel").onclick=contaFecha;
$("#fn-conta-form").addEventListener("submit",async ev=>{
  ev.preventDefault(); if(!db){flash("#fc-toast","Sem conexão com o banco de dados.");return}
  const nome=$("#fc-nome").value.trim(); if(!nome){flash("#fc-toast","Dê um nome para a conta.");$("#fc-nome").focus();return}
  const sv=parseNum($("#fc-saldo").value);
  const body={nome,tipo:$("#fc-tipo").value,saldoInicial:Number.isFinite(sv)?sv:0,dataInicial:$("#fc-data").value||hoje()};
  $("#fc-salvar").disabled=true;
  try{ if(fcEdit){const o=fnContas.find(c=>c.id===fcEdit); await db.collection("fin_contas").doc(fcEdit).set({...body,criadoEm:o?.criadoEm||new Date().toISOString()})}
       else await db.collection("fin_contas").add({...body,criadoEm:new Date().toISOString()});
       contaFecha() }
  catch(err){flash("#fc-toast",erroTxt(err))} finally{$("#fc-salvar").disabled=false}
});
["#lc-per","#lc-conta","#lc-tit"].forEach(s=>$(s).addEventListener("change",renderCaixa));
$("#lc-xlsx").onclick=lcPlanilha;
["#rs-safra","#rs-rateio"].forEach(s=>$(s).addEventListener("change",renderSafra));
addEventListener("resize",()=>{if(visivel("fin_resumo")) window.finAgenda()});
fnReset();
if(typeof col!=="undefined"&&col) window.finInicia(); // o banco já abriu antes deste arquivo carregar
})();
