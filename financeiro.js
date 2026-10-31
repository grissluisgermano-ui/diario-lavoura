/* Diário da Lavoura — módulo Financeiro.
   Caixa, contas bancárias, contas a pagar e a receber, fluxo de caixa, livro caixa e resultado da safra.
   Usa as funções e listas do index.html (db, estoque, graos, diesel, manut, bfServ, registros…).
   Coleções: fin_contas {nome,tipo,saldoInicial,dataInicial}
             fin_lanc   {natureza:pagar|receber|transf, descricao, pessoa, categoria, forma, competencia, vencimento,
                         valor, status:aberto|pago, pagoEm, valorPago, contaId, contaDestino, parcela, grupo,
                         nf, chave, titular, itens:[{desc,valor}], origem, quitGraos:{sacas,cultura,local,grId}, obs}
                         contrato, safra, cultura, talhoes:[], tags, juros}
             config/financeiro {inicio, ignorados:[], categorias:{pagar:[{k,l,papel}],receber:[…]}, recorrentes:[…], apelidos:{nomeNormalizado:nomeCurto}} */
(function(){
"use strict";

/* Categorias: as do Aegro de vocês + as do app. "papel" diz como cada uma entra no Resultado:
   custo (custo da lavoura) · invest (investimento, fora do custo) · financ (só os juros são custo) ·
   familia (contas com a família, fora do custo) · pecuaria (separada da lavoura) · receita · naoreceita (empréstimo recebido) */
const CAT_PADRAO={
  pagar:[["defensivos","Defensivos","custo"],["fertilizantes","Fertilizantes e corretivos","custo"],["sementes","Sementes","custo"],["insumos","Insumos (outros)","custo"],
    ["combustivel","Combustível","custo"],["manutencao","Manutenção de máquinas e equipamentos","custo"],["benfeitorias","Manutenção de benfeitorias","custo"],
    ["maoobra","Salários, ordenados e comissões","custo"],["prolabore","Pró-labore","custo"],["medtrab","Medicina do trabalho","custo"],
    ["arrendamento","Arrendamento","custo"],["servicos","Serviços terceirizados (frete, colheita…)","custo"],["impostos","Impostos (Funrural, FGTS, DARF, ITR…)","custo"],
    ["impveiculo","Imposto de veículo","custo"],["seguro","Seguros","custo"],["energia","Luz","custo"],["comunicacao","Comunicação (telefone, internet)","custo"],
    ["outras_d","Despesas diversas","custo"],["financ","Financiamentos (parcela — informe os juros)","financ"],["consorcio","Consórcio","invest"],
    ["investimento","Aquisição de máquinas e implementos","invest"],["familia_pai","Finanças Nestor Griss","familia"],["emprestimo","Empréstimos (família)","familia"],
    ["animais","Animais (pecuária)","pecuaria"]],
  receber:[["graos","Venda agrícola (grãos)","receita"],["outras_r","Outras receitas","receita"],["financ_r","Financiamento recebido (custeio)","naoreceita"],
    ["familia_r","Recebido da família / empréstimo","familia"],["animais_r","Venda de animais","pecuaria"]]};
const PAPEIS={pagar:{custo:"Custo da lavoura",invest:"Investimento (fora do custo)",financ:"Financiamento: só os juros são custo",familia:"Contas com a família (fora do custo)",pecuaria:"Pecuária (separada da lavoura)"},
  receber:{receita:"Receita da lavoura",naoreceita:"Não é receita (empréstimo)",familia:"Contas com a família",pecuaria:"Pecuária"}};
const CURTO={defensivos:"Defensivos",fertilizantes:"Fertilizantes",sementes:"Sementes",insumos:"Insumos",combustivel:"Combustível",manutencao:"Manutenção",benfeitorias:"Benfeitorias",
  maoobra:"Salários e comissões",prolabore:"Pró-labore",medtrab:"Medicina do trabalho",arrendamento:"Arrendamento",servicos:"Serviços",impostos:"Impostos",impveiculo:"Imposto de veículo",
  seguro:"Seguros",energia:"Luz",comunicacao:"Telefone e internet",outras_d:"Despesas diversas",financ:"Juros de financiamentos",consorcio:"Consórcio",investimento:"Máquinas e implementos",
  familia_pai:"Finanças Nestor Griss",emprestimo:"Empréstimos",animais:"Animais",graos:"Venda de grãos",outras_r:"Outras receitas",financ_r:"Financiamento recebido",familia_r:"Recebido da família",animais_r:"Venda de animais"};
const INSUMO_CATS=new Set(["defensivos","fertilizantes","sementes","insumos"]);
/* lista em uso: a salva em config/financeiro.categorias (editável) ou a padrão */
function cats(nat){
  const sal=fnCfg.categorias?.[nat];
  if(Array.isArray(sal)&&sal.length){const ks=new Set(sal.map(c=>c.k)); return [...sal,...CAT_PADRAO[nat].filter(([k])=>!ks.has(k)).map(([k,l,papel])=>({k,l,papel}))]}
  return CAT_PADRAO[nat].map(([k,l,papel])=>({k,l,papel}));
}
const catInfo=k=>cats("pagar").find(c=>c.k===k)||cats("receber").find(c=>c.k===k);
const papel=k=>catInfo(k)?.papel||"custo";
/* Categoria da nota pela classe do produto no estoque ou pela descrição */
function classeCat(classe,desc){
  const c=String(classe||""), d=norm(desc);
  if(/Fertilizante|Corretivo/.test(c)) return "fertilizantes";
  if(/Semente|Inoculante/.test(c)) return "sementes";
  if(/Herbicida|Fungicida|Inseticida|Acaricida|Nematicida|Adjuvante|Tratamento/.test(c)) return "defensivos";
  if(/^(ste |semente)|\bsemente\b|\bsoja\b.*\b(ipro|i2x|rr|tsi)\b|\bmilho\b.*\b(vyh|pro|tsi)\b/.test(d)) return "sementes";
  if(/\b(fert|ureia|calcario|kcl|adubo|npk|super|map|gesso|cloreto)\b|\b\d{2} \d{2} \d{2}\b/.test(d)) return "fertilizantes";
  const e=(typeof estoque!=="undefined"?estoque:[]).find(x=>d.includes(norm(x.comercial)));
  if(e) return classeCat(e.classe,"")||"insumos";
  return "";
}
/* categoria com mais valor entre os itens */
function catDosItens(itens,padrao="insumos"){
  const t={}; for(const i of itens||[]){const k=classeCat(i.classe,i.desc)||padrao; t[k]=(t[k]||0)+(Number(i.valor)||1)}
  return Object.entries(t).sort((a,b)=>b[1]-a[1])[0]?.[0]||padrao;
}
const FN_FORMAS={avista:"À vista",prazo:"A prazo (boleto/duplicata)",safra:"Para a safra / troca por grãos",financ:"Financiamento / custeio",cartao:"Cartão de crédito"};
const FN_TIPOS={banco:"Conta bancária",coop:"Conta na cooperativa",especie:"Dinheiro (caixa)",cartao:"Cartão de crédito"};
const FN_NAT={pagar:"A pagar",receber:"A receber",transf:"Transferência"};
const FN_FILTROS={abertas:"Em aberto",pagar:"A pagar",receber:"A receber",vencidas:"Vencidas",pagas:"Pagas / recebidas",todas:"Todas"};
/* Financiamento: só os juros (e o que for pago a mais, como multa ou mora) são custo; o resto da parcela é amortização */
const jurosDe=l=>Math.min(vp(l),(Number(l.juros)||0)+(l.status==="pago"&&l.valorPago!=null?Math.max(0,Number(l.valorPago)-Number(l.valor)):0));

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
const catNome=k=>CURTO[k]||catInfo(k)?.l||k||"Sem categoria";
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
  const nfs=new Set(fnLanc.filter(l=>l.nf).map(l=>nfKey(l.nf,l.pessoa)));
  const naFaixa=d=>modo==="todas"||(modo==="retro"?d<ini:d>=ini);
  const out=[], livre=(k,d)=>d&&naFaixa(d)&&!ign.has(k)&&!origens.has(k);
  // Estoque: entradas da mesma nota viram uma conta só, com os produtos discriminados
  const g=new Map();
  for(const e of (typeof estoque!=="undefined"?estoque:[])) for(const x of e.entradas||[]){
    if(!(Number(x.valorTotal)>0)||!x.data) continue;
    if(x.chave&&chaves.has(x.chave)) continue;
    if(x.nf&&nfs.has(nfKey(x.nf,x.origem))) continue;
    const k=`est|${norm(x.origem)}|${x.nf?String(x.nf).replace(/^0+/,""):x.data}`;
    const p=g.get(k)||{k,natureza:"pagar",data:x.data,nf:x.nf||"",pessoa:x.origem||"",categoria:"insumos",fonte:"Estoque",itens:[],valor:0,chave:x.chave||""};
    p.itens.push({desc:`${e.comercial} — ${num(x.quantidade)} ${e.unidade}`,valor:Number(x.valorTotal),classe:e.classe}); p.valor+=Number(x.valorTotal);
    if(x.data<p.data) p.data=x.data; g.set(k,p);
  }
  for(const p of g.values()){p.categoria=catDosItens(p.itens); p.itens=p.itens.map(({classe,...i})=>i); p.descricao=`Compra de ${catNome(p.categoria).toLowerCase()}${p.nf?" — NF "+p.nf:""}`; if(livre(p.k,p.data)) out.push(p)}
  for(const d of (typeof diesel!=="undefined"?diesel:[])) if(d.tipo==="entrada"&&Number(d.valorTotal)>0){
    const k="ds|"+d.id; if(livre(k,d.data)) out.push({k,natureza:"pagar",data:d.data,descricao:`Diesel — ${num(d.litros)} L no tanque`,pessoa:d.fornecedor||"",nf:d.nf||"",valor:Number(d.valorTotal),categoria:"combustivel",fonte:"Abastecimento",itens:[]})}
  for(const x of (typeof manut!=="undefined"?manut:[])) if(Number(x.custoTotal)>0){
    const k="mq|"+x.id; if(livre(k,x.data)) out.push({k,natureza:"pagar",data:x.data,descricao:`Manutenção — ${nomeMaq(x.maquinaId)}${(x.servicos||[]).length?" ("+x.servicos.join(", ")+")":""}`,pessoa:x.oficina||"",nf:"",valor:Number(x.custoTotal),categoria:"manutencao",fonte:"Máquinas",itens:(x.itens||[]).filter(i=>i.desc||i.valor).map(i=>({desc:i.desc||"Item",valor:i.valor}))})}
  for(const x of (typeof bfServ!=="undefined"?bfServ:[])) if(Number(x.custoTotal)>0&&x.status!=="pendente"){
    const k="bf|"+x.id; if(livre(k,x.data)) out.push({k,natureza:"pagar",data:x.data,descricao:`${nomeBf(x.benfId)}${(x.servicos||[]).length?" — "+x.servicos.join(", "):""}`,pessoa:x.responsavel||"",nf:"",valor:Number(x.custoTotal),categoria:"benfeitorias",fonte:"Benfeitorias",itens:(x.itens||[]).filter(i=>i.desc||i.valor).map(i=>({desc:i.desc||"Item",valor:i.valor}))})}
  const recG=fnLanc.filter(l=>l.natureza==="receber"&&l.categoria==="graos");
  const vendaNoFin=m=>recG.some(l=>Math.abs(vp(l)-m.valorTotal)<=m.valorTotal*.01&&Math.abs(dias(l.competencia||l.vencimento,m.data))<=5);
  for(const m of (typeof graos!=="undefined"?graos:[])) if(m.tipo==="venda"&&Number(m.valorTotal)>0&&!m.finId&&!vendaNoFin(m)){
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
  renderFluxo(s); renderFamilia(); renderContratos(); renderRecs();
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
/* ---------- Contas com a família ---------- */
const NOMES_FAM=[[/nestor|\bpai\b/,"Nestor Griss"],[/mariang|\bmari\b|irma/,"Mariangélica Griss Livi"],[/\bluis\b/,"Luis Germano Griss"]];
const pessoaFam=l=>{const t=norm([l.pessoa,l.descricao].join(" ")); for(const [re,n] of NOMES_FAM) if(re.test(t)) return n; return l.pessoa||(l.categoria==="familia_pai"?"Nestor Griss":"Outros")};
function renderFamilia(){
  const fam=fnLanc.filter(l=>l.natureza!=="transf"&&papel(l.categoria)==="familia"&&l.status==="pago");
  $("#fn-fam-box").hidden=!fam.length; if(!fam.length) return;
  const P={};
  for(const l of fam){const n=pessoaFam(l), x=P[n]||={saiu:0,entrou:0,n:0,ult:""}; x[l.natureza==="receber"?"entrou":"saiu"]+=vp(l); x.n++; const d=l.pagoEm||l.vencimento; if(d>x.ult) x.ult=d}
  $("#fn-fam").innerHTML=Object.entries(P).sort((a,b)=>(b[1].saiu+b[1].entrou)-(a[1].saiu+a[1].entrou)).map(([n,x])=>{const sal=x.saiu-x.entrou;
    return `<article class="fn-conta" style="--c:var(--t-benf)"><div class="rec-top"><b>${esc(n)}</b><span class="note">${x.n} lançamento${x.n===1?"":"s"}</span></div>
      <div class="fn-fam-l"><span>Saiu da lavoura</span><b class="mono">${brl(x.saiu)}</b></div><div class="fn-fam-l"><span>Entrou na lavoura</span><b class="mono">${brl(x.entrou)}</b></div>
      <div class="fn-fam-l fn-fam-t"><span>${sal>=0?"Lavoura repassou a mais":"Lavoura recebeu a mais"}</span><b class="mono">${brl(Math.abs(sal))}</b></div>
      <div class="rec-actions"><button type="button" class="link" data-famv="${esc(n)}">Ver lançamentos</button></div></article>`}).join("");
  $("#fn-fam").querySelectorAll("[data-famv]").forEach(b=>b.onclick=()=>{fnFiltro="todas"; show("fin_contas"); $("#fn-busca").value=b.dataset.famv.split(" ")[0]; renderContas()});
}
/* ---------- Contratos e pedidos ---------- */
function renderContratos(){
  const G={};
  for(const l of fnLanc) if(l.contrato&&l.natureza!=="transf"){const x=G[l.contrato]||={pessoa:l.pessoa,total:0,aberto:0,prox:"",n:0,cats:new Set()}; x.total+=vp(l); x.n++; x.cats.add(catNome(l.categoria));
    if(l.status!=="pago"){x.aberto+=vp(l); if(!x.prox||l.vencimento<x.prox) x.prox=l.vencimento}}
  const ab=Object.entries(G).filter(([,x])=>x.aberto>0.004).sort((a,b)=>a[1].prox.localeCompare(b[1].prox));
  $("#fn-ctr-box").hidden=!ab.length; if(!ab.length) return;
  $("#fn-ctr-n").textContent=`${ab.length} em aberto · ${brl(ab.reduce((t,[,x])=>t+x.aberto,0))}`;
  $("#fn-ctr").innerHTML=ab.slice(0,30).map(([c,x])=>`<button type="button" class="fn-lx fn-ctr-i" data-ctr="${esc(c)}"><div><b>${esc(ctrTxt(c))}${x.pessoa?` · ${esc(x.pessoa)}`:""}</b>
      <small>${esc([...x.cats].join(", "))} · vence ${brDate(x.prox)}</small></div><span class="mono">${brl(x.aberto)}<small>de ${brl(x.total)}</small></span></button>`).join("");
  $("#fn-ctr").querySelectorAll("[data-ctr]").forEach(b=>b.onclick=()=>{fnFiltro="todas"; show("fin_contas"); $("#fn-busca").value=b.dataset.ctr; renderContas()});
}
/* ---------- Contas que se repetem todo mês ---------- */
function renderRecs(){
  const rs=(fnCfg.recorrentes||[]).filter(r=>r.ativa!==false);
  $("#fn-recs-box").hidden=!rs.length; if(!rs.length) return;
  $("#fn-recs").innerHTML=rs.map(r=>`<article class="rec" style="--c:var(--muted)"><div class="rec-top"><span class="rec-tipo">${esc(r.descricao)}</span><span class="mov-q ${r.natureza==="receber"?"in":"out"}">${brl(r.valor)}</span></div>
    <div class="rec-campos"><span>Todo dia <b>${r.dia}</b></span><span>${esc(catNome(r.categoria))}</span>${r.pessoa?`<span>${esc(r.pessoa)}</span>`:""}<span>desde ${mesLab(r.inicio)}</span></div>
    <div class="rec-actions"><button type="button" class="link danger" data-recp="${r.id}">Parar de repetir</button></div></article>`).join("");
  $("#fn-recs").querySelectorAll("[data-recp]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar: parar",async()=>{
    await salvaCfg({recorrentes:(fnCfg.recorrentes||[]).map(r=>r.id===b.dataset.recp?{...r,ativa:false}:r)})}));
}
let gerando=false;
async function gerarRecorrentes(){
  if(gerando||!db||!fnCarregou) return;
  const rs=fnCfg.recorrentes||[], ate=addMes(hoje().slice(0,7)+"-01",1).slice(0,7); // cria até o mês que vem
  if(!rs.some(r=>r.ativa!==false&&r.geradoAte<ate)) return;
  gerando=true;
  try{
    const novos=[];
    for(const r of rs){
      if(r.ativa===false||r.geradoAte>=ate){novos.push(r);continue}
      let m=addMes(r.geradoAte+"-01",1).slice(0,7);
      while(m<=ate){
        const ult=new Date(+m.slice(0,4),+m.slice(5,7),0).getDate(), v=`${m}-${String(Math.min(r.dia,ult)).padStart(2,"0")}`;
        await db.collection("fin_lanc").doc(`rec_${r.id}_${m.replace("-","")}`).set({natureza:r.natureza||"pagar",descricao:r.descricao,pessoa:r.pessoa||"",categoria:r.categoria,forma:r.forma||"avista",
          competencia:v,vencimento:v,valor:r.valor,status:"aberto",nf:"",titular:"",itens:[],obs:"",contrato:r.contrato||"",cultura:r.cultura||"",talhoes:r.talhoes||[],safra:null,origem:`rec|${r.id}|${m}`,criadoEm:new Date().toISOString()});
        m=addMes(m+"-01",1).slice(0,7);
      }
      novos.push({...r,geradoAte:ate});
    }
    await salvaCfg({recorrentes:novos});
  }catch(e){console.error(e)} finally{gerando=false}
}
/* ---------- Editor de categorias ---------- */
let catsRascunho=null;
function renderCats(){
  const box=$("#fn-cats"); if(!box) return;
  catsRascunho={pagar:cats("pagar").map(c=>({...c})),receber:cats("receber").map(c=>({...c}))};
  const usadas=new Set(fnLanc.map(l=>l.categoria));
  const bloco=nat=>`<h4 class="fn-cat-h">${nat==="pagar"?"Despesas (a pagar)":"Receitas (a receber)"}</h4>`+catsRascunho[nat].map((c,i)=>`<div class="fn-cat-row" data-nat="${nat}" data-i="${i}">
      <input class="fc-l" value="${esc(c.l)}" aria-label="Nome da categoria">
      <select class="fc-p" aria-label="Como entra no resultado">${Object.entries(PAPEIS[nat]).map(([k,l])=>`<option value="${k}"${k===c.papel?" selected":""}>${l}</option>`).join("")}</select>
      <button type="button" class="rm" aria-label="Apagar categoria" ${usadas.has(c.k)||CAT_PADRAO[nat].some(([k])=>k===c.k)?"disabled title='Em uso ou padrão'":""}>×</button></div>`).join("")+
    `<button type="button" class="link" data-addcat="${nat}">+ Nova categoria de ${nat==="pagar"?"despesa":"receita"}</button>`;
  box.innerHTML=bloco("pagar")+bloco("receber");
  box.querySelectorAll(".fn-cat-row").forEach(r=>{const c=catsRascunho[r.dataset.nat][+r.dataset.i];
    r.querySelector(".fc-l").oninput=e=>c.l=e.target.value; r.querySelector(".fc-p").onchange=e=>c.papel=e.target.value;
    r.querySelector(".rm").onclick=()=>{c.apagar=true; r.remove()}});
  box.querySelectorAll("[data-addcat]").forEach(b=>b.onclick=()=>{const nat=b.dataset.addcat;
    const row=document.createElement("div"); row.className="fn-cat-row"; const c={k:"c_"+rid(),l:"",papel:nat==="pagar"?"custo":"receita",nova:true}; catsRascunho[nat].push(c);
    row.innerHTML=`<input class="fc-l" placeholder="Nome da nova categoria" aria-label="Nome da categoria"><select class="fc-p" aria-label="Como entra no resultado">${Object.entries(PAPEIS[nat]).map(([k,l])=>`<option value="${k}"${k===c.papel?" selected":""}>${l}</option>`).join("")}</select><button type="button" class="rm" aria-label="Apagar categoria">×</button>`;
    row.querySelector(".fc-l").oninput=e=>c.l=e.target.value; row.querySelector(".fc-p").onchange=e=>c.papel=e.target.value; row.querySelector(".rm").onclick=()=>{c.apagar=true; row.remove()};
    b.before(row); row.querySelector(".fc-l").focus()});
}
async function salvarCats(){
  if(!catsRascunho) return;
  const limpa=a=>a.filter(c=>!c.apagar&&c.l.trim()).map(({k,l,papel})=>({k,l:l.trim(),papel}));
  try{await salvaCfg({categorias:{pagar:limpa(catsRascunho.pagar),receber:limpa(catsRascunho.receber)}}); flash("#fn-cats-st","Categorias salvas."); renderCats(); fnSetNat(fnNat)}
  catch(err){flash("#fn-cats-st",erroTxt(err))}
}

/* Lança uma pendência do Diário direto como já paga/recebida (histórico) */
async function jaPago(p,conta,data){
  const d=data||p.data, b={natureza:p.natureza,descricao:p.descricao,pessoa:p.pessoa||"",categoria:p.categoria,forma:"avista",competencia:p.data,vencimento:d,
    valor:+Number(p.valor).toFixed(2),status:"pago",pagoEm:d,contaId:conta,nf:p.nf||"",titular:"",itens:p.itens||[],origem:p.k,obs:"",criadoEm:new Date().toISOString()};
  if(p.chave) b.chave=p.chave;
  await db.collection("fin_lanc").add(b);
}
const cfgDoc=()=>({inicio:fnCfg.inicio||null,ignorados:fnCfg.ignorados||[],categorias:fnCfg.categorias||null,recorrentes:fnCfg.recorrentes||[],apelidos:fnCfg.apelidos||{}});
async function salvaCfg(mud){fnCfg={...fnCfg,...mud}; await db.collection("config").doc("financeiro").set(cfgDoc())}
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
  const lista=cats(n==="receber"?"receber":"pagar"), atual=$("#fn-cat").value;
  $("#fn-cat").innerHTML=lista.map(c=>`<option value="${c.k}">${esc(c.l)}</option>`).join("");
  if(lista.some(c=>c.k===atual)) $("#fn-cat").value=atual;
  $("#fn-rec-box").hidden=tr||!!fnEdit;
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
/* ---------- destino do gasto: safra, cultura, talhões ---------- */
function culturasLista(){
  const base=(typeof propCfg!=="undefined"&&propCfg.culturas?.length?propCfg.culturas:[]).concat(typeof CAMPOS!=="undefined"?CAMPOS.cultura.opts:["Soja","Milho","Trigo","Feijão"]);
  const usadas=[...registros.map(r=>r.campos?.cultura),...fnLanc.map(l=>l.cultura)].filter(Boolean).map(c=>typeof normCult==="function"?normCult(c):c);
  return [...new Set([...base,...usadas,"Soja","Milho","Trigo","Feijão","Aveia"])].filter(c=>c&&c!=="Pastagem");
}
function safrasLista(){
  const y=safraDe(hoje()), s=new Set([y+1,y,y-1,y-2,y-3]); for(const l of fnLanc) if(l.safra) s.add(+l.safra);
  return [...s].sort((a,b)=>b-a);
}
const safraLanc=l=>l.safra!=null&&l.safra!==""?+l.safra:safraDe(l.competencia||l.vencimento||hoje());
function destinoRender(d={}){
  $("#fn-safra").innerHTML=`<option value="">Pela data da compra</option>`+safrasLista().map(y=>`<option value="${y}">${safraLab(y)}</option>`).join("");
  $("#fn-safra").value=d.safra!=null?String(d.safra):"";
  $("#fn-cult").innerHTML=`<option value="">Todas / geral</option>`+culturasLista().map(c=>`<option>${esc(c)}</option>`).join("");
  $("#fn-cult").value=d.cultura||"";
  const sel=new Set(d.talhoes||[]);
  $("#fn-tal").innerHTML=TALHOES.map(t=>`<button type="button" class="chip" aria-pressed="${sel.has(t.n)}" data-t="${esc(t.n)}">${esc(t.n)}</button>`).join("");
  $("#fn-tal").querySelectorAll("button").forEach(b=>b.onclick=()=>b.setAttribute("aria-pressed",b.getAttribute("aria-pressed")!=="true"));
}
const destinoLer=()=>({safra:$("#fn-safra").value?+$("#fn-safra").value:null,cultura:$("#fn-cult").value||"",talhoes:[...$("#fn-tal").querySelectorAll('[aria-pressed="true"]')].map(b=>b.dataset.t)});
const ctrTxt=c=>!c?"":/^\d[\d.\/-]*$/.test(c)?"Contrato "+c:c;
const destTxt=l=>[l.cultura,(l.talhoes||[]).join(", "),l.safra!=null&&l.safra!==""?"safra "+safraLab(+l.safra):""].filter(Boolean).join(" · ");
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
  ["#fn-desc","#fn-pessoa","#fn-nf","#fn-tit","#fn-obs","#fn-tval","#fn-tdesc","#fn-pago-em","#fn-juros","#fn-contrato"].forEach(s=>$(s).value="");
  $("#fn-rec").checked=false; destinoRender(); delete $("#fn-conta").dataset.ok;
  $("#fn-data").value=hoje(); $("#fn-tdata").value=hoje(); $("#fn-forma").value="prazo";
  $("#fn-form-tit").textContent="Novo lançamento"; $("#fn-cancel").hidden=true; $("#fn-origem").hidden=true;
  itensRender([]); parcsRender([{venc:hoje(),valor:null}]);
  opcoesConta("#fn-conta",null,"Sem conta (só histórico)"); opcoesConta("#fn-de"); opcoesConta("#fn-para");
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
  if(p.cultura) destinoRender({cultura:p.cultura});
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
    $("#fn-contrato").value=l.contrato||""; destinoRender(l);
    itensRender(l.itens||[]); parcsRender([{venc:l.vencimento,valor:l.valor}]);
    if(l.status==="pago"){$("#fn-pago-em").value=l.pagoEm||""; opcoesConta("#fn-conta",l.contaId||"","Sem conta (só histórico)")}
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
  if(fnSit==="pago"&&!$("#fn-conta").value&&!fnEdit&&fnContas.length&&!$("#fn-conta").dataset.ok){$("#fn-conta").dataset.ok="1";flash("#fn-toast","Sem conta, não mexe no saldo. Toque em salvar de novo para confirmar, ou escolha a conta.");return}
  const comp=$("#fn-data").value||parcs[0].venc;
  const base={natureza:fnNat,descricao,pessoa:$("#fn-pessoa").value.trim(),categoria:$("#fn-cat").value,forma:$("#fn-forma").value,competencia:comp,
    nf:$("#fn-nf").value.trim(),titular:$("#fn-tit").value.trim(),itens:itensLer(),obs,contrato:$("#fn-contrato").value.trim().replace(/^contrato\s*/i,""),...destinoLer()};
  if(fnOrigem) base.origem=fnOrigem; if(fnChave) base.chave=fnChave;
  if(base.categoria==="financ"){const j=parseNum($("#fn-juros").value); base.juros=j>=0?+j.toFixed(2):null} else base.juros=null;
  const pago=fnSit==="pago"?{status:"pago",pagoEm:$("#fn-pago-em").value||parcs[0].venc,contaId:$("#fn-conta").value||null}:{status:"aberto"};
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
      if($("#fn-rec").checked&&parcs.length===1){
        const rec={id:rid(),natureza:fnNat,descricao,pessoa:base.pessoa,categoria:base.categoria,forma:base.forma,valor:+parcs[0].valor.toFixed(2),dia:+parcs[0].venc.slice(8,10),
          inicio:parcs[0].venc.slice(0,7),geradoAte:parcs[0].venc.slice(0,7),contrato:base.contrato,cultura:base.cultura,talhoes:base.talhoes,ativa:true};
        base.origem=`rec|${rec.id}|${rec.inicio}`;
        await salvaCfg({recorrentes:[...(fnCfg.recorrentes||[]),rec]});
      }
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
const titulo=t=>String(t||"").toLowerCase().replace(/(^|[\s\/(-])([a-zà-ú])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g,x=>x.toLowerCase());
/* Nome do fornecedor: a Coamo põe a unidade (ex.: "S.DOMINGOS") no nome fantasia, então reconhece os depósitos cadastrados pela razão social */
window.finNomeEmit=function(xNome,xFant){
  const n=norm(xNome), deps=(typeof DEPOSITOS!=="undefined"?DEPOSITOS:[]);
  const d=deps.find(x=>{const k=norm(x); return k&&(n===k||n.startsWith(k+" ")||n.includes(" "+k+" "))});
  if(d) return d;
  const ap=fnCfg.apelidos?.[n]; if(ap) return ap;
  return titulo(xFant&&norm(xFant).length>3&&norm(xFant)!==n?xFant:xNome).replace(/\s+(Ltda|Ltda\.?|S\.?a\.?|Me|Eireli|Epp)$/i,"")
    .replace(/\b([B-DF-HJ-NP-TV-Zb-df-hj-np-tv-z]{2,4})\b/g,w=>w.toUpperCase()).replace(/\b(Hdi|Gga|Mec)\b/g,w=>w.toUpperCase());
};
/* reconhece o depósito também quando o nome termina nele ("Cooperativa Agroindustrial Alfa") */
const nomeCurto=x=>{const n=norm(x); if(!n) return ""; const deps=(typeof DEPOSITOS!=="undefined"?DEPOSITOS:[]);
  return deps.find(d=>{const k=norm(d); return n===k||n.startsWith(k+" ")||n.includes(" "+k+" ")||n.endsWith(" "+k)})||fnCfg.apelidos?.[n]||window.finNomeEmit(x,"")};
/* contrato ou pedido escrito nas informações complementares da nota */
function contratoDoTexto(t){
  t=String(t||"").replace(/_/g," ");
  let m=t.match(/CONTRATO[^0-9]{0,60}?(\d[\d.]*\d)/i); if(m) return m[1].replace(/\./g,"");
  m=t.match(/PEDIDO\s*(?:N[RºO°.]*\s*:?\s*)?(\d+)/i); if(m) return "Pedido "+m[1];
  return "";
}
const prazoLongo=(emi,venc)=>emi&&venc&&dias(emi,venc)>90;
window.finDadosXml=function(doc){
  try{
    const g=(el,n)=>el?.getElementsByTagNameNS("*",n)[0]?.textContent?.trim()||"";
    const inf=doc.getElementsByTagNameNS("*","infNFe")[0], ide=doc.getElementsByTagNameNS("*","ide")[0];
    const emit=doc.getElementsByTagNameNS("*","emit")[0], dest=doc.getElementsByTagNameNS("*","dest")[0], tot=doc.getElementsByTagNameNS("*","ICMSTot")[0];
    const chave=(g(doc,"chNFe")||inf?.getAttribute("Id")||"").replace(/\D/g,"");
    const dups=[...doc.getElementsByTagNameNS("*","dup")].map(d=>({n:g(d,"nDup"),venc:g(d,"dVenc"),valor:+g(d,"vDup")||0})).filter(d=>d.valor>0);
    const itens=[...doc.getElementsByTagNameNS("*","det")].map(d=>{const p=d.getElementsByTagNameNS("*","prod")[0];const q=+g(p,"qCom")||0;
      return {desc:`${g(p,"xProd")} — ${num(q)} ${g(p,"uCom")}`,valor:+(((+g(p,"vProd")||0)-(+g(p,"vDesc")||0)).toFixed(2))}});
    return {chave,numero:g(ide,"nNF"),data:(g(ide,"dhEmi")||g(ide,"dEmi")).slice(0,10),emit:window.finNomeEmit(g(emit,"xNome"),g(emit,"xFant")),
      dest:titulo(g(dest,"xNome")),total:+g(tot,"vNF")||itens.reduce((s,i)=>s+i.valor,0),dups,itens,
      contrato:contratoDoTexto(g(doc,"infCpl")),categoria:catDosItens(itens)};
  }catch{return null}
};
const formaNota=fin=>!fin.dups.length?"avista":fin.dups.some(d=>prazoLongo(fin.data,d.venc))?"safra":"prazo";
const nfKey=(nf,pessoa)=>String(nf||"").replace(/\D/g,"").replace(/^0+/,"")+"|"+norm(nomeCurto(pessoa)).split(" ")[0];
const jaLancada=(chave,nf,emit)=>(chave&&fnLanc.find(l=>l.chave===chave))||(nf&&emit&&fnLanc.find(l=>l.nf&&l.natureza==="pagar"&&nfKey(l.nf,l.pessoa)===nfKey(nf,emit)))||null;
window.finNfOpcao=function(fin){
  if(!fin) return "";
  const ja=jaLancada(fin.chave,fin.numero,fin.emit);
  if(ja) return `<p class="note">Esta nota já está no Financeiro (${esc(ja.descricao)}).</p>`;
  const p=fin.dups.length?fin.dups.map(d=>`${brDate(d.venc)} ${brl(d.valor)}`).join(" · "):"sem parcelas na nota (vence na data da nota)";
  return `<label class="nf-chk fn-nfopt"><input type="checkbox" id="nf-fin" checked> Lançar também no Financeiro (contas a pagar)</label>
    <p class="note">Total da nota ${brl(fin.total)}${fin.dest?` · em nome de ${esc(fin.dest)}`:""} · ${p}</p>`;
};
function parcelasDaNota(fin,data){
  return fin.dups.length?fin.dups.map(d=>({venc:d.venc,valor:d.valor})):[{venc:data||fin.data,valor:fin.total}];
}
window.finDaNota=async function(fin,{data,nf,origem,itens}){
  if(!db||!fin) return "";
  if(jaLancada(fin.chave,nf||fin.numero,origem||fin.emit)) return "";
  const cat=itens?.length?catDosItens(itens.map(i=>({classe:i.classe,desc:i.nome,valor:i.v}))):fin.categoria;
  const parcs=parcelasDaNota(fin,data), agora=new Date().toISOString(), grupo=parcs.length>1?rid():null;
  for(let i=0;i<parcs.length;i++){
    const b={natureza:"pagar",descricao:`Compra de ${catNome(cat).toLowerCase()} — NF ${nf||fin.numero}`,pessoa:origem||fin.emit,categoria:cat,forma:formaNota(fin),
      competencia:data||fin.data,vencimento:parcs[i].venc,valor:parcs[i].valor,status:"aberto",nf:nf||fin.numero,titular:fin.dest||"",chave:fin.chave,itens:fin.itens,obs:"",contrato:fin.contrato||"",criadoEm:agora};
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
    const ja=jaLancada(fin.chave,fin.numero,fin.emit);
    fnReset(); fnSetNat("pagar"); fnChave=fin.chave||null;
    $("#fn-desc").value=`Nota ${fin.numero} — ${fin.emit}`; $("#fn-pessoa").value=fin.emit; $("#fn-data").value=fin.data; $("#fn-nf").value=fin.numero; $("#fn-tit").value=fin.dest;
    $("#fn-cat").value=fin.categoria; jurosVis(); $("#fn-contrato").value=fin.contrato||"";
    $("#fn-forma").value=formaNota(fin);
    itensRender(fin.itens); parcsRender(parcelasDaNota(fin));
    const noEst=(typeof estoque!=="undefined"?estoque:[]).some(e=>(e.entradas||[]).some(x=>x.chave&&x.chave===fin.chave));
    origemTxt(ja?`<span class="falta">Atenção: esta nota já foi lançada (${esc(ja.descricao)}).</span>`:
      `Nota ${esc(fin.numero)} lida: ${fin.itens.length} ite${fin.itens.length===1?"m":"ns"}, ${fin.dups.length||1} parcela(s). Confira a categoria e salve.`+
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
    if(jaLancada(fin.chave,fin.numero,fin.emit)){loteNotas.push({arq:f.name,fin,erro:"já está no Financeiro"});continue}
    loteNotas.push({arq:f.name,fin});
  }
  loteNotas.sort((a,b)=>String(a.fin?.data||"").localeCompare(String(b.fin?.data||"")));
  const boas=loteNotas.filter(x=>!x.erro), tot=boas.reduce((t,x)=>t+x.fin.total,0);
  box.innerHTML=`<div class="row" style="justify-content:space-between"><b>${boas.length} nota${boas.length===1?"":"s"} para lançar · ${brl(tot)}</b><button type="button" class="link" id="lx-fecha">Cancelar</button></div>
    <div class="fn-lx-lista">${loteNotas.map(x=>`<div class="fn-lx${x.erro?" off":""}"><div><b>${x.fin?`NF ${esc(x.fin.numero)} · ${esc(x.fin.emit)}`:esc(x.arq)}</b>
      <small>${x.erro?`<span class="falta">${esc(x.erro)}</span>`:`${x.fin.data?brDate(x.fin.data):""}${x.fin.dest?" · "+esc(x.fin.dest):""} · ${x.fin.dups.length||1} parcela${(x.fin.dups.length||1)===1?"":"s"}`}</small></div>
      <span class="mono">${x.fin?brl(x.fin.total):""}</span></div>`).join("")}</div>
    <div class="grid2">
      <div class="field"><label for="lx-cat">Categoria</label><select id="lx-cat"><option value="">Pela classe dos produtos (automático)</option>${cats("pagar").map(c=>`<option value="${c.k}">${esc(c.l)}</option>`).join("")}</select></div>
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
          const b={natureza:"pagar",descricao:`Nota ${fin.numero} — ${fin.emit}`,pessoa:fin.emit,categoria:cat||fin.categoria,forma:formaNota(fin),competencia:fin.data,
            vencimento:parcs[i].venc,valor:parcs[i].valor,status:pago&&parcs[i].venc<=hoje()?"pago":"aberto",nf:fin.numero,titular:fin.dest||"",chave:fin.chave,itens:fin.itens,obs:"",contrato:fin.contrato||"",criadoEm:agora};
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

/* ---------- Importar a planilha "Consolidado" do Aegro ---------- */
const AEGRO_CAT={"manutencao de maquinas e equipamentos":"manutencao","defensivos":"defensivos","impostos":"impostos","salarios ordenados e comissoes":"maoobra",
  "fertilizantes":"fertilizantes","combustivel":"combustivel","despesas diversas":"outras_d","comunicacao telefone internet":"comunicacao","consorcio":"consorcio",
  "animais":"animais","pro labore":"prolabore","seguros":"seguro","financas nestor griss":"familia_pai","luz":"energia","manutencoes de benfeitorias":"benfeitorias",
  "sementes":"sementes","imposto de veiculo":"impveiculo","med trabalho":"medtrab","servicos tercerizados":"servicos","servicos terceirizados":"servicos",
  "aquisicao de maquinas e implementos":"investimento","emprestimos":"emprestimo","arrendamento":"arrendamento","financiamentos":"financ"};
const APELIDO_PADRAO={"abastecedora de combustiveis griss ltda":"Posto Griss"};
const hashTxt=t=>{let h1=0xdeadbeef,h2=0x41c6ce57; for(let i=0;i<t.length;i++){const c=t.charCodeAt(i); h1=Math.imul(h1^c,2654435761); h2=Math.imul(h2^c,1597334677)}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909); h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(36)};
const xlsData=v=>{if(v==null||v==="") return "";
  if(typeof v==="number") return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);
  if(v instanceof Date) return v.toISOString().slice(0,10);
  const m=String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/); if(m) return `${m[3]}-${m[2]}-${m[1]}`;
  const m2=String(v).match(/(\d{4})-(\d{2})-(\d{2})/); return m2?m2[0]:""};
const xlsNum=v=>typeof v==="number"?v:v==null||v===""?0:(parseNum(String(v).replace(/[R$\s]/g,""))||0);
/* agrupadores do Aegro: "Contrato 80668", "SAFRA MILHO 25/26", "Trigo 25 - Talhão 2", "Pedido Casarão 3754"… */
function lerAgrupador(txt){
  const out={contrato:"",cultura:"",safra:null,talhoes:[],tags:[]};
  for(const p0 of String(txt||"").split(",").map(x=>x.trim()).filter(Boolean)){
    let p=p0, m;
    if((m=p.match(/contrato\s*n?[ºo°.]*\s*([\d.]+)/i))){out.contrato=out.contrato||m[1].replace(/\./g,""); continue}
    if((m=p.match(/pedido\D*(\d+)/i))){out.contrato=out.contrato||"Pedido "+m[1]; continue}
    const c=cultDoTexto(p); if(c&&!out.cultura) out.cultura=c;
    if((m=p.match(/\b(\d{2})\s*\/\s*(\d{2})\b/))&&+m[2]===(+m[1]+1)%100) out.safra=out.safra??2000+(+m[1]);
    if((m=norm(p).match(/talhao\s*(\d+)/))){const n=TALHOES.find(t=>norm(t.n)===norm("talhao "+m[1])); if(n&&!out.talhoes.includes(n.n)) out.talhoes.push(n.n)}
    if(!c&&!/talh/i.test(p)) out.tags.push(p0);
  }
  return out;
}
let aeg=null;
async function importarAegro(file){
  const box=$("#fn-aeg"); box.hidden=false; box.innerHTML=`<p class="note">Lendo ${esc(file.name)}…</p>`;
  try{
    if(typeof XLSX==="undefined") throw new Error("Não consegui abrir o leitor de planilhas. Verifique a internet.");
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
    const ws=wb.Sheets[wb.SheetNames.find(n=>/consolid/i.test(n))||wb.SheetNames[0]];
    const linhas=XLSX.utils.sheet_to_json(ws,{raw:true,defval:null});
    if(!linhas.length) throw new Error("A planilha está vazia.");
    const cab=Object.keys(linhas[0]), col=re=>cab.find(k=>re.test(norm(k)));
    const C={tipo:col(/^tipo$/),lanc:col(/lancamento/),venc:col(/vencimento/),pag:col(/pagamento/),nf:col(/nota fiscal/),forn:col(/fornecedor|origem/),prod:col(/produtor/),
      cat:col(/categoria/),agr:col(/agrupador/),desc:col(/descri/),parc:col(/parcela/),ent:col(/valor de entrada/),sai:col(/valor de saida/),real:col(/realizado/)};
    if(!C.tipo||!C.venc||!(C.ent||C.sai)) throw new Error("Esta planilha não tem as colunas do Aegro (Tipo, Data de Vencimento, Valor de Entrada/Saída).");
    const tx=v=>String(v??"").normalize("NFC").trim();
    const R=linhas.map((r,i)=>{
      const tipo=norm(r[C.tipo]), ent=xlsNum(r[C.ent]), sai=xlsNum(r[C.sai]), real=xlsNum(r[C.real]);
      return {i,nat:tipo.startsWith("entr")?"receber":"pagar",lanc:xlsData(r[C.lanc]),venc:xlsData(r[C.venc]),pag:xlsData(r[C.pag]),nf:tx(r[C.nf]),
        forn:tx(r[C.forn]),prod:tx(r[C.prod]),catA:tx(r[C.cat]),agr:tx(r[C.agr]),desc:tx(r[C.desc]),parc:tx(r[C.parc]),valor:tipo.startsWith("entr")?ent:(sai||real)}}).filter(r=>r.valor>0&&(r.venc||r.lanc));
    // categorias do Aegro → do app
    const catsA={}; for(const r of R){const k=r.catA||"(sem categoria)"; const x=catsA[k]||={n:0,v:0,nat:r.nat}; x.n++; x.v+=r.valor}
    const mapa={}; for(const [k,x] of Object.entries(catsA)){const nk=norm(k);
      mapa[k]=nk==="entradas"?"auto_r":AEGRO_CAT[nk]||[...cats("pagar"),...cats("receber")].find(c=>norm(c.l)===nk||norm(CURTO[c.k])===nk)?.k||(x.nat==="receber"?"outras_r":"novo")}
    const forns={}; for(const r of R) if(r.forn){const x=forns[r.forn]||={n:0,v:0}; x.n++; x.v+=r.valor}
    aeg={R,mapa,catsA,forns,arq:file.name};
    aegTela();
  }catch(e){box.innerHTML=`<p class="falta">${esc(e?.message||"Não consegui ler a planilha. Confira se é o .xlsx exportado do Aegro.")}</p><button type="button" class="link" id="aeg-x">Fechar</button>`; $("#aeg-x").onclick=()=>{box.hidden=true}}
}
const aegNome=f=>{const n=norm(f); return fnCfg.apelidos?.[n]||APELIDO_PADRAO[n]||nomeCurto(f).replace(/\s+\d{8,}$/,"")};
/* monta os lançamentos a partir das linhas (agrupa por nota/parcela) */
function aegMontar(){
  const {R,mapa}=aeg, ap={...APELIDO_PADRAO,...(fnCfg.apelidos||{})};
  document.querySelectorAll("#aeg-forn input").forEach(i=>{const v=i.value.trim(); if(v) ap[norm(i.dataset.f)]=v});
  document.querySelectorAll("#aeg-cats select").forEach(sel=>{mapa[sel.dataset.c]=sel.value});
  const nome=f=>f?(ap[norm(f)]||nomeCurto(f).replace(/\s+\d{8,}$/,"")):"";
  const titVar={}; for(const r of R) if(r.prod){const k=norm(r.prod); const t=titulo(r.prod); if(!titVar[k]||/[^\x00-\x7f]/.test(t)) titVar[k]=t}
  const catDe=r=>{const m=mapa[r.catA||"(sem categoria)"];
    if(m==="auto_r") return /venda agr/i.test(r.agr)||(/venda/i.test(r.desc)&&cultDoTexto(r.desc))?"graos":"outras_r";
    if(m==="novo") return "c_"+hashTxt(norm(r.catA)).slice(0,6);
    return m};
  const G=new Map(), ocorr={};
  for(const r of R){
    const cat=catDe(r), pm=r.parc.match(/^(\d+)\s*\/\s*(\d+)$/), nP=pm?+pm[2]:1, pessoa=nome(r.forn);
    let k;
    if(r.nf) k=`nf|${nfKey(r.nf,pessoa||r.forn)}|${cat}|${r.nat}`;
    else if(nP>1) k=`p|${norm(pessoa)}|${norm(r.desc)}|${r.lanc}|${nP}|${cat}|${r.nat}`;
    else {const base=`u|${r.lanc}|${r.venc}|${norm(r.desc).slice(0,60)}|${r.valor.toFixed(2)}|${cat}|${r.nat}`; ocorr[base]=(ocorr[base]||0)+1; k=base+"|"+ocorr[base]}
    const g=G.get(k)||{k,cat,nat:r.nat,nf:r.nf,pessoa,forn:r.forn,lanc:r.lanc,rows:[],parcs:new Map()};
    g.rows.push(r); if(r.lanc&&(!g.lanc||r.lanc<g.lanc)) g.lanc=r.lanc;
    const pk=`${pm?pm[1]:""}|${r.venc}|${r.pag}`; const pc=g.parcs.get(pk)||{n:pm?+pm[1]:0,N:nP,venc:r.venc||r.lanc,pag:r.pag,valor:0};
    pc.valor+=r.valor; g.parcs.set(pk,pc); G.set(k,g);
  }
  const existentes=new Set(fnLanc.map(l=>l.origem).filter(Boolean));
  const docs=[]; let jaOrig=0, jaNF=0;
  for(const g of G.values()){
    if(g.nf&&g.nat==="pagar"&&fnLanc.some(l=>l.nf&&!String(l.origem||"").startsWith("aegro|")&&nfKey(l.nf,l.pessoa)===nfKey(g.nf,g.pessoa))){jaNF++; continue}
    const descs={}; for(const r of g.rows) if(r.desc) descs[r.desc]=(descs[r.desc]||0)+r.valor;
    const ds=Object.keys(descs), agr=lerAgrupador(g.rows.map(r=>r.agr).filter(Boolean).join(","));
    const d0=ds[0]||catNome(g.cat);
    if(!agr.cultura&&/comiss|colheita|plantio/i.test(d0)) agr.cultura=cultDoTexto(d0);
    if(!agr.cultura&&g.cat==="graos") agr.cultura=cultDoTexto(d0);
    const itens=g.nf||ds.length>1?ds.map(d=>({desc:d,valor:+descs[d].toFixed(2)})):[];
    const prod=g.rows.find(r=>r.prod)?.prod, titular=prod?titVar[norm(prod)]:"";
    const ps=[...g.parcs.values()].sort((a,b)=>(a.n-b.n)||a.venc.localeCompare(b.venc)), N=ps.length, grupo=N>1?"aeg"+hashTxt(g.k):null;
    ps.forEach((pc,i)=>{
      const origem=`aegro|${g.k}|${pc.n}|${pc.venc}`; if(existentes.has(origem)){jaOrig++; return}
      const b={natureza:g.nat,descricao:g.nf?(ds.length===1?d0:`Nota ${g.nf} — ${g.pessoa||"fornecedor"}`):d0,pessoa:g.pessoa||(papel(g.cat)==="familia"?pessoaFam({pessoa:"",descricao:d0,categoria:g.cat}):""),
        categoria:g.cat,forma:pc.pag&&pc.pag===g.lanc&&pc.venc===g.lanc?"avista":prazoLongo(g.lanc,pc.venc)?"safra":"prazo",competencia:g.lanc||pc.venc,vencimento:pc.venc,
        valor:+pc.valor.toFixed(2),status:pc.pag?"pago":"aberto",nf:g.nf||"",titular,itens,obs:"",contrato:agr.contrato,cultura:agr.cultura,talhoes:agr.talhoes,safra:agr.safra,
        tags:agr.tags.join(", "),origem,criadoEm:new Date().toISOString()};
      if(pc.pag) b.pagoEm=pc.pag;
      if(grupo){b.grupo=grupo; b.parcela=`${i+1}/${N}`} else if(pc.N>1&&pc.n){b.parcela=`${pc.n}/${pc.N}`}
      docs.push({id:"aeg_"+hashTxt(origem),b});
    });
  }
  return {docs,jaOrig,jaNF,ap};
}
function aegTela(){
  const box=$("#fn-aeg"), {R,mapa,catsA,forns}=aeg;
  const {docs,jaOrig,jaNF}=aegMontar();
  const datas=R.map(r=>r.venc||r.lanc).filter(Boolean).sort(), ab=docs.filter(d=>d.b.status!=="pago");
  const somaN=n=>R.filter(r=>r.nat===n).reduce((t,r)=>t+r.valor,0);
  const opts=(nat,v)=>[...(nat==="receber"?[["auto_r","Venda agrícola ou outras receitas (automático)"]]:[]),...cats(nat).map(c=>[c.k,c.l]),...(nat==="pagar"?[["novo","Criar categoria com o nome do Aegro"]]:[])]
    .map(([k,l])=>`<option value="${k}"${k===v?" selected":""}>${esc(l)}</option>`).join("");
  box.innerHTML=`<div class="row" style="justify-content:space-between"><b>Planilha do Aegro · ${esc(aeg.arq)}</b><button type="button" class="link" id="aeg-x">Cancelar</button></div>
    <div class="stats fn-aeg-st"><div class="stat"><b>${R.length}</b><span>linhas (${brDate(datas[0])} a ${brDate(datas.at(-1))})</span></div>
      <div class="stat"><b>${docs.length}</b><span>lançamentos novos</span></div><div class="stat"><b>${ab.length}</b><span>em aberto · ${brlC(ab.reduce((t,d)=>t+d.b.valor,0))}</span></div></div>
    <p class="note">Entradas ${brl(somaN("receber"))} · saídas ${brl(somaN("pagar"))}. As linhas de cada nota e parcela viram uma conta só, com os produtos discriminados.${jaOrig?` ${jaOrig} já tinham sido importados antes e ficam de fora.`:""}${jaNF?` ${jaNF} nota${jaNF===1?"":"s"} já ${jaNF===1?"estava":"estavam"} no Financeiro (pelo XML ou pelo Diário) e ${jaNF===1?"fica":"ficam"} de fora.`:""}</p>
    <details class="fn-det" open><summary>Categorias do Aegro → categorias do app</summary><div id="aeg-cats" class="fn-aeg-l">${Object.entries(catsA).sort((a,b)=>b[1].v-a[1].v).map(([k,x])=>
      `<div class="fn-aeg-r"><span>${esc(k)} <small class="note">${x.n} linha${x.n===1?"":"s"} · ${brlC(x.v)}</small></span><select data-c="${esc(k)}" aria-label="Categoria para ${esc(k)}">${opts(x.nat,mapa[k])}</select></div>`).join("")}</div></details>
    <details class="fn-det"><summary>Nomes dos fornecedores (${Object.keys(forns).length})</summary><p class="note">Nome curto que vai aparecer no app. Coamo, Casarão, C.Vale, Baggio e Alfa são reconhecidos sozinhos.</p><div id="aeg-forn" class="fn-aeg-l">${Object.entries(forns).sort((a,b)=>b[1].n-a[1].n).map(([f,x])=>
      `<div class="fn-aeg-r"><span>${esc(f)} <small class="note">${x.n}</small></span><input data-f="${esc(f)}" value="${esc(aegNome(f))}" aria-label="Nome curto de ${esc(f)}"></div>`).join("")}</div></details>
    <div class="grid2"><div class="field"><label for="aeg-conta">Conta dos pagamentos já feitos</label><select id="aeg-conta"><option value="">Sem conta (só histórico, não mexe no saldo)</option>${fnContas.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select></div></div>
    <p class="note">Contrato, safra, cultura e talhão vêm dos agrupadores ("Contrato 80668", "SAFRA MILHO 25/26", "Trigo 25 - Talhão 2"). Nada vai para o estoque nem para Grãos.</p>
    <div class="row"><button type="button" class="btn" id="aeg-ok"${docs.length?"":" disabled"}>Importar ${docs.length} lançamento${docs.length===1?"":"s"}</button><span class="note" id="aeg-st" role="status"></span></div>`;
  $("#aeg-x").onclick=()=>{box.hidden=true; box.innerHTML=""; aeg=null};
  box.querySelectorAll("#aeg-cats select").forEach(s=>s.onchange=()=>{aeg.mapa[s.dataset.c]=s.value; const n=aegMontar().docs.length; $("#aeg-ok").textContent=`Importar ${n} lançamento${n===1?"":"s"}`});
  $("#aeg-ok").onclick=aegImportar;
}
async function aegImportar(){
  const b=$("#aeg-ok"), st=t=>$("#aeg-st").textContent=t;
  if(!b.dataset.armed){b.dataset.armed="1"; b.textContent="Confirmar importação"; return}
  b.disabled=true;
  const {docs,ap}=aegMontar(), conta=$("#aeg-conta").value;
  try{
    // categorias novas e nomes curtos
    const novas=[]; for(const [k,v] of Object.entries(aeg.mapa)) if(v==="novo") novas.push({k:"c_"+hashTxt(norm(k)).slice(0,6),l:k,papel:"custo"});
    const catsP=cats("pagar").filter(c=>!novas.some(n=>n.k===c.k));
    await salvaCfg({apelidos:ap,...(novas.length?{categorias:{pagar:[...catsP,...novas],receber:cats("receber")}}:{})});
    let n=0, falhas=0;
    for(let i=0;i<docs.length;i+=20){
      await Promise.all(docs.slice(i,i+20).map(async({id,b:d})=>{if(conta&&d.status==="pago") d.contaId=conta;
        try{await db.collection("fin_lanc").doc(id).set(d); n++}catch{falhas++}}));
      st(`Importando… ${n+falhas} de ${docs.length}`);
    }
    $("#fn-aeg").innerHTML=`<p class="${falhas?"falta":"toast"}">${n} lançamento${n===1?"":"s"} importado${n===1?"":"s"} do Aegro.${falhas?` ${falhas} falharam: escolha a planilha de novo (o que já entrou é pulado).`:""}</p>`;
    aeg=null; fnFiltro="todas"; renderContas();
  }catch(e){st(erroTxt(e)); b.disabled=false}
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
  if(q) vis=vis.filter(l=>norm([l.descricao,l.pessoa,l.nf,l.titular,l.obs,catNome(l.categoria),l.contrato,ctrTxt(l.contrato),destTxt(l),l.tags,...(l.itens||[]).map(i=>i.desc)].join(" ")).includes(q));
  vis.sort(fnFiltro==="pagas"||fnFiltro==="todas"?(a,b)=>dataLanc(b).localeCompare(dataLanc(a)):(a,b)=>a.vencimento.localeCompare(b.vencimento));
  $("#fn-lista").innerHTML=vis.length?vis.slice(0,300).map(l=>{
    const tr=l.natureza==="transf", r=l.natureza==="receber";
    const cor=tr?"--muted":l.status==="pago"?"--line":l.vencimento<h?"--danger":r?"--accent":"--t-aplicacao";
    return `<article class="rec fn-rec" style="--c:var(${cor})">
      <div class="rec-top"><span class="rec-tipo">${esc(l.descricao)}${l.parcela?` <small class="note">parcela ${esc(l.parcela)}</small>`:""}</span><span class="mov-q ${r?"in":"out"}">${tr?"":r?"+":"−"}${brl(vp(l))}</span></div>
      <div class="rec-top">${tr?`<span>${esc(nomeConta(l.contaId))} → ${esc(nomeConta(l.contaDestino))} · ${brDate(l.pagoEm)}</span>`:situacao(l)}<span class="note">${tr?"Transferência":esc(catNome(l.categoria))}</span></div>
      ${tr?"":`<div class="rec-campos">${l.pessoa?`<span>${r?"Comprador":"Fornecedor"} <b>${esc(l.pessoa)}</b></span>`:""}${l.nf?`<span>NF <b>${esc(l.nf)}</b></span>`:""}${l.forma?`<span>${esc(FN_FORMAS[l.forma]||l.forma)}</span>`:""}${l.categoria==="financ"?`<span>Juros <b>${l.juros!=null?brl(l.juros):"não informado"}</b></span>`:""}${l.titular?`<span>Em nome de <b>${esc(l.titular)}</b></span>`:""}${l.contrato?`<span><b>${esc(ctrTxt(l.contrato))}</b></span>`:""}${destTxt(l)?`<span>Destino <b>${esc(destTxt(l))}</b></span>`:""}${l.status==="pago"&&!l.contaId&&!l.quitGraos?`<span class="note">sem conta (histórico)</span>`:""}${l.status==="pago"&&l.contaId?`<span>Conta <b>${esc(nomeConta(l.contaId))}</b></span>`:""}${l.quitGraos?`<span>Quitada com <b>${num(l.quitGraos.sacas)} sc de ${esc(l.quitGraos.cultura)}</b></span>`:""}${l.valorPago!=null&&l.status==="pago"&&Math.abs(l.valorPago-l.valor)>0.004?`<span>Previsto <b>${brl(l.valor)}</b></span>`:""}</div>`}
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
const CULT_RE=[[/\bsoja\b/,"Soja"],[/\bmilho\b/,"Milho"],[/\btrigo\b/,"Trigo"],[/\bfeij/,"Feijão"],[/\baveia\b/,"Aveia"],[/\bcevada\b/,"Cevada"]];
const cultDoTexto=t=>{t=norm(t); for(const [re,c] of CULT_RE) if(re.test(t)) return c; return ""};
const nc=c=>c?(typeof normCult==="function"?normCult(c):c):"";
function renderSafra(){
  const sy0=safraDe(hoje());
  const anos=new Set([sy0]); for(const l of fnLanc) if(l.natureza!=="transf"&&(l.competencia||l.vencimento)) anos.add(safraLanc(l));
  for(const r of registros) if(r.tipo==="colheita"||r.tipo==="plantio") anos.add(safraDe(r.data));
  const keep=$("#rs-safra").value;
  $("#rs-safra").innerHTML=[...anos].sort((a,b)=>b-a).map(y=>`<option value="${y}">${safraLab(y)}</option>`).join("");
  if([...$("#rs-safra").options].some(o=>o.value===keep)) $("#rs-safra").value=keep;
  const sy=+$("#rs-safra").value, naS=d=>d&&safraDe(d)===sy, rateio=$("#rs-rateio").value==="area";
  const lan=fnLanc.filter(l=>l.natureza!=="transf"&&safraLanc(l)===sy);
  const area=TALHOES.reduce((t,x)=>t+x.ha,0);
  /* ---- receitas ---- */
  const vendas=grMovs().filter(m=>m.tipo==="venda"&&naS(m.data)&&Number(m.valorTotal)>0);
  const recCult={}, recC={};
  const addRec=(cult,lab,v)=>{if(cult) recCult[cult]=(recCult[cult]||0)+v; recC[lab]=(recC[lab]||0)+v};
  for(const m of vendas) addRec(nc(m.cultura),"Venda de "+nc(m.cultura),Number(m.valorTotal));
  const fora={invest:{},amort:0,fam:{saiu:0,entrou:0},pec:{desp:0,rec:0},emp:0};
  let semJuros=0; const cat={}, custos=[];
  for(const l of lan){
    const pp=papel(l.categoria), v=vp(l);
    if(l.natureza==="receber"){
      if(pp==="receita"){ if(l.categoria==="graos"&&(String(l.origem||"").startsWith("gr|")||vendas.some(m=>Math.abs(m.valorTotal-v)<=m.valorTotal*.01&&Math.abs(dias(m.data,l.competencia||l.vencimento))<=5))) continue; // já contada pela venda do Diário
        const c=nc(l.cultura)||(l.categoria==="graos"?cultDoTexto(l.descricao):""); addRec(c,l.categoria==="graos"?(c?"Venda de "+c:"Venda de grãos"):catNome(l.categoria),v)}
      else if(pp==="familia") fora.fam.entrou+=v; else if(pp==="pecuaria") fora.pec.rec+=v; else fora.emp+=v;
      continue;
    }
    if(pp==="invest"){fora.invest[l.categoria]=(fora.invest[l.categoria]||0)+v; continue}
    if(pp==="familia"){fora.fam.saiu+=v; continue}
    if(pp==="pecuaria"){fora.pec.desp+=v; continue}
    let c=v; if(pp==="financ"){const j=jurosDe(l); fora.amort+=v-j; c=j; if(l.juros==null) semJuros++}
    if(c>0){cat[l.categoria]=(cat[l.categoria]||0)+c; custos.push({l,v:c})}
  }
  // preço médio por cultura (desta safra; se não houver, de todas as vendas)
  const preco=c=>{const f=a=>{const v=a.filter(m=>nc(m.cultura)===c&&Number(m.valorTotal)>0); const sc=v.reduce((t,m)=>t+m.sacas,0); return sc>0?v.reduce((t,m)=>t+Number(m.valorTotal),0)/sc:null};
    return f(vendas)??f(grMovs().filter(m=>m.tipo==="venda"))};
  // arrendamento pago em sacas (Grãos), avaliado pelo preço médio, se não houver lançamento em dinheiro
  const arr=grMovs().filter(m=>m.tipo==="arrendamento"&&naS(m.data));
  let arrTxt="";
  if(!cat.arrendamento&&arr.length){const v=arr.reduce((t,m)=>t+m.sacas*(preco(nc(m.cultura))||0),0), sc=arr.reduce((t,m)=>t+m.sacas,0);
    if(v>0){cat.arrendamento=v; custos.push({l:{categoria:"arrendamento"},v}); arrTxt=`${num(sc)} sc pagas ao ${titNome("pai")} valendo ${brlC(v)} pelo preço médio de venda`}}
  const custo=Object.values(cat).reduce((t,v)=>t+v,0), receita=Object.values(recC).reduce((t,v)=>t+v,0);
  const investT=Object.values(fora.invest).reduce((t,v)=>t+v,0);
  const kpi=(l,v,sub,cls)=>`<div class="kpi${cls?" "+cls:""}"><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:""}</div>`;
  $("#rsf-kpis").innerHTML=[kpi("Receitas",brlC(receita),`${vendas.length} venda${vendas.length===1?"":"s"} de grãos no Diário`),kpi("Custos",brlC(custo),area?`${brl(custo/area)}/ha`:""),
    kpi("Resultado",brlC(receita-custo),receita?`${num((receita-custo)/receita*100)}% da receita`:"",receita-custo<0?"fn-neg":""),
    kpi("Fora do custo",brlC(investT+fora.amort+fora.fam.saiu+fora.pec.desp),"investimentos, dívidas, família e pecuária")].join("");
  const pend=pendencias("todas").filter(p=>naS(p.data)), al=[];
  if(pend.length) al.push(`<div class="falta fn-al">${pend.length} lançamento${pend.length===1?"":"s"} do Diário desta safra ainda não ${pend.length===1?"está":"estão"} no Financeiro — os custos podem estar incompletos. <button type="button" class="link" data-fnres>Ver no Resumo</button></div>`);
  if(semJuros) al.push(`<p class="note">${semJuros} parcela${semJuros===1?"":"s"} de financiamento desta safra sem os juros informados: ${semJuros===1?"conta":"contam"} como amortização (fora do custo). Edite a parcela em Contas e informe os juros.</p>`);
  if(arrTxt) al.push(`<p class="note">Arrendamento: ${esc(arrTxt)}.</p>`);
  $("#rsf-alertas").innerHTML=al.join(""); $("#rsf-alertas").querySelector("[data-fnres]")?.addEventListener("click",()=>show("fin_resumo"));
  const cores=["--s1","--s2","--s3","--s4","--t-adubacao","--t-mecanizacao","--t-diesel","--t-benf","--t-maquina","--t-chuva"];
  hbars("rsf-cat",Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(([k,v],i)=>({l:catNome(k),v,cor:cores[i%cores.length],extra:area?`${brl(v/area)}/ha`:""})),{fmt:brlC});
  hbars("rsf-rec",Object.entries(recC).sort((a,b)=>b[1]-a[1]).map(([l,v])=>({l,v,cor:"--s3"})),{fmt:brlC});

  /* ---- áreas plantadas na safra: cultura → talhão → ha ---- */
  const plant={};
  for(const r of registros) if((r.tipo==="plantio"||r.tipo==="colheita")&&!ehProg(r)&&naS(r.data)){const c=nc(r.campos?.cultura); if(!c) continue;
    for(const t of r.talhoes||[]) (plant[c]??={})[t]=Math.max(plant[c]?.[t]||0,Number(r.areas?.[t])||haDe(t))}
  const areaCult=c=>Object.values(plant[c]||{}).reduce((t,v)=>t+v,0);
  const areaPlant=Object.keys(plant).reduce((t,c)=>t+areaCult(c),0);
  /* ---- insumos: aplicados (registros) quando houver; senão as compras do Financeiro ---- */
  const insReg={}, insRegC={};
  for(const r of registros) if(!ehProg(r)&&naS(r.data)&&r.custoHa>0){const c=nc(r.campos?.cultura);
    for(const t of r.talhoes||[]){const v=(Number(r.custoHa)||0)*(Number(r.areas?.[t])||haDe(t)); insReg[t]=(insReg[t]||0)+v; if(c) insRegC[c]=(insRegC[c]||0)+v}}
  const usaReg=Object.keys(insReg).length>0;
  /* ---- distribui cada custo: talhões marcados → cultura marcada → geral (rateio) ---- */
  const T={}, C={}; for(const t of TALHOES) T[t.n]={ins:0,dir:0,ger:0}; for(const c of Object.keys(plant)) C[c]={ins:0,dir:0,ger:0};
  if(usaReg){for(const [t,v] of Object.entries(insReg)) if(T[t]) T[t].ins+=v; for(const [c,v] of Object.entries(insRegC)) (C[c]??={ins:0,dir:0,ger:0}).ins+=v}
  let geral=0, geralIns=0;
  for(const {l,v} of custos){
    const ins=INSUMO_CATS.has(l.categoria); if(ins&&usaReg) continue;
    const campo=ins?"ins":"dir", ts=(l.talhoes||[]).filter(t=>T[t]), c=nc(l.cultura);
    if(c) (C[c]??={ins:0,dir:0,ger:0})[campo]+=v;
    if(ts.length){const a=ts.reduce((x,t)=>x+haDe(t),0)||1; for(const t of ts) T[t][campo]+=v*haDe(t)/a}
    else if(c&&plant[c]){const a=areaCult(c)||1; for(const [t,h] of Object.entries(plant[c])) if(T[t]) T[t][campo]+=v*h/a}
    if(!c&&!ts.length){if(ins) geralIns+=v; else geral+=v}
    else if(!c&&ts.length){/* talhão sem cultura: reparte entre as culturas daquele talhão */ const cs=Object.keys(plant).filter(k=>ts.some(t=>plant[k][t]));
      if(cs.length) for(const k of cs) C[k][campo]+=v/cs.length; else if(ins) geralIns+=v; else geral+=v}
  }
  if(rateio){
    for(const t of TALHOES){T[t.n].ger+=area?geral*t.ha/area:0; T[t.n].ins+=area?geralIns*t.ha/area:0}
    for(const c of Object.keys(C)){const a=areaCult(c); C[c].ger+=areaPlant?geral*a/areaPlant:0; C[c].ins+=areaPlant?geralIns*a/areaPlant:0}
  }
  /* ---- por cultura ---- */
  const prodC={}; for(const p of grProducao(sy)){const c=nc(p.cultura); const x=prodC[c]||={sc:0,area:0}; x.sc+=p.sacas; x.area+=p.area}
  const culturas=[...new Set([...Object.keys(C),...Object.keys(recCult),...Object.keys(prodC)])].filter(Boolean);
  let tc={a:0,i:0,d:0,g:0,sc:0,r:0};
  $("#rsf-cult").innerHTML=culturas.length?`<thead><tr><th>Cultura</th><th>ha</th><th>Insumos</th><th>Diretos</th>${rateio?"<th>Gerais</th>":""}<th>Custo/ha</th><th>Sacas</th><th>sc/ha</th><th>Receita</th><th>Resultado</th></tr></thead><tbody>${culturas.map(c=>{
      const x=C[c]||{ins:0,dir:0,ger:0}, a=areaCult(c)||prodC[c]?.area||0, cu=x.ins+x.dir+x.ger, p=prodC[c]||{sc:0,area:0}, r=recCult[c]||0;
      tc.a+=a; tc.i+=x.ins; tc.d+=x.dir; tc.g+=x.ger; tc.sc+=p.sc; tc.r+=r;
      return `<tr><td>${esc(c)}</td><td>${a?num(a):"–"}</td><td>${brlC(x.ins)}</td><td>${brlC(x.dir)}</td>${rateio?`<td>${brlC(x.ger)}</td>`:""}<td>${a?brl(cu/a):"–"}</td><td>${p.sc?num(p.sc):"–"}</td><td>${p.area?num(p.sc/p.area):"–"}</td><td>${r?brlC(r):"–"}</td><td class="${r-cu<0?"fn-neg":""}">${brlC(r-cu)}</td></tr>`}).join("")}</tbody>
    <tfoot><tr><td>Total</td><td>${num(tc.a)}</td><td>${brlC(tc.i)}</td><td>${brlC(tc.d)}</td>${rateio?`<td>${brlC(tc.g)}</td>`:""}<td>–</td><td>${num(tc.sc)}</td><td>–</td><td>${brlC(tc.r)}</td><td class="${tc.r-tc.i-tc.d-tc.g<0?"fn-neg":""}">${brlC(tc.r-tc.i-tc.d-tc.g)}</td></tr></tfoot>`:
    `<tbody><tr><td class="empty" style="text-align:center;white-space:normal">Nenhum plantio, colheita ou lançamento com cultura nesta safra.</td></tr></tbody>`;
  const semCult=receita-Object.values(recCult).reduce((t,v)=>t+v,0);
  $("#rsf-cult-nota").textContent=`Insumos: ${usaReg?"o que foi aplicado (registros executados)":"compras de defensivos, fertilizantes e sementes do Financeiro (sem registros de aplicação nesta safra)"}. Diretos: lançamentos com a cultura ou o talhão marcado no destino. ${rateio?`Gerais: o que não tem destino (${brlC(geral+geralIns)}), dividido pela área plantada de cada cultura.`:"Custos sem destino não divididos."}${semCult>0.5?` ${brlC(semCult)} de receita sem cultura identificada fica só no total.`:""}`;
  /* ---- fora do custo ---- */
  const fr=[...Object.entries(fora.invest).map(([k,v])=>[catNome(k),v,"Investimento: entra no patrimônio, não no custo da safra"]),
    fora.amort>0?["Amortização de financiamentos",fora.amort,"Parte da parcela que paga a dívida (os juros estão no custo)"]:null,
    fora.emp>0?["Financiamentos e empréstimos recebidos",-fora.emp,"Entrou no caixa, mas não é receita"]:null,
    fora.fam.saiu>0?["Família — saiu da lavoura",fora.fam.saiu,"Veja o saldo de cada um no Resumo"]:null,
    fora.fam.entrou>0?["Família — entrou na lavoura",-fora.fam.entrou,""]:null,
    (fora.pec.desp||fora.pec.rec)?["Pecuária (despesas − vendas)",fora.pec.desp-fora.pec.rec,`Despesas ${brlC(fora.pec.desp)} · vendas ${brlC(fora.pec.rec)}`]:null].filter(Boolean);
  $("#rsf-fora").innerHTML=fr.length?`<thead><tr><th>O quê</th><th>Valor</th></tr></thead><tbody>${fr.map(([l,v,n])=>`<tr><td>${esc(l)}${n?`<small class="note fn-lc-sub">${esc(n)}</small>`:""}</td><td class="${v<0?"fn-pos":""}">${v<0?"+":""}${brlC(Math.abs(v))}</td></tr>`).join("")}</tbody>`:
    `<tbody><tr><td class="empty" style="text-align:center;white-space:normal">Nada fora do custo nesta safra.</td></tr></tbody>`;
  /* ---- por talhão ---- */
  const prod={}; for(const p of grProducao(sy)){const x=prod[p.talhao]||={sc:0,area:0,rec:0,cults:new Set()}; x.sc+=p.sacas; x.area+=p.area; x.rec+=p.sacas*(preco(nc(p.cultura))||0); x.cults.add(nc(p.cultura))}
  let tot={a:0,i:0,d:0,g:0,sc:0,r:0};
  const rows=TALHOES.map(t=>{const x=T[t.n], p=prod[t.n]||{sc:0,area:0,rec:0,cults:new Set()}, c=x.ins+x.dir+x.ger;
    tot.a+=t.ha; tot.i+=x.ins; tot.d+=x.dir; tot.g+=x.ger; tot.sc+=p.sc; tot.r+=p.rec;
    return `<tr><td>${esc(t.n)}${p.cults.size?` <small class="note">${esc([...p.cults].join(", "))}</small>`:""}</td><td>${num(t.ha)}</td><td>${brlC(x.ins)}</td><td>${brlC(x.dir)}</td>${rateio?`<td>${brlC(x.ger)}</td>`:""}<td>${brl(t.ha?c/t.ha:0)}</td><td>${p.sc?num(p.sc):"–"}</td><td>${p.area?num(p.sc/p.area):"–"}</td><td>${p.rec?brlC(p.rec):"–"}</td><td class="${p.rec-c<0?"fn-neg":""}">${p.rec?brlC(p.rec-c):"–"}</td></tr>`});
  const ct=tot.i+tot.d+tot.g;
  $("#rsf-tal").innerHTML=`<thead><tr><th>Talhão</th><th>ha</th><th>Insumos</th><th>Diretos</th>${rateio?"<th>Gerais</th>":""}<th>Custo/ha</th><th>Sacas</th><th>sc/ha</th><th>Receita</th><th>Resultado</th></tr></thead><tbody>${rows.join("")}</tbody>
    <tfoot><tr><td>Total</td><td>${num(tot.a)}</td><td>${brlC(tot.i)}</td><td>${brlC(tot.d)}</td>${rateio?`<td>${brlC(tot.g)}</td>`:""}<td>${brl(tot.a?ct/tot.a:0)}</td><td>${num(tot.sc)}</td><td>–</td><td>${brlC(tot.r)}</td><td class="${tot.r-ct<0?"fn-neg":""}">${brlC(tot.r-ct)}</td></tr></tfoot>`;
  $("#rsf-tal-nota").textContent=`Mesma divisão da tabela por cultura, mas os custos gerais aqui são divididos pela área de cada talhão. Receita: sacas colhidas × preço médio de venda.`;
}

/* ---------- ligação com o app ---------- */
window.finColecoes=()=>({fin_contas:fnContas,fin_lanc:fnLanc});
window.finPlanilha=function(add,dt){
  const ord=[...fnLanc].sort((a,b)=>String(a.vencimento).localeCompare(String(b.vencimento)));
  add("Financeiro",ord.map(l=>({"Tipo":FN_NAT[l.natureza]||l.natureza,"Descrição":l.descricao||"","Parcela":l.parcela||"","Fornecedor / comprador":l.pessoa||"",
    "Categoria":l.natureza==="transf"?"Transferência":catNome(l.categoria),"Forma":FN_FORMAS[l.forma]||"","Data da compra/venda":dt(l.competencia),"Vencimento":dt(l.vencimento),
    "Valor (R$)":Number(l.valor)||0,"Situação":l.status==="pago"?(l.quitGraos?"Quitada em grãos":l.natureza==="receber"?"Recebido":"Pago"):(l.vencimento<hoje()?"Vencida":"Em aberto"),
    "Pago/recebido em":dt(l.pagoEm),"Valor pago (R$)":l.status==="pago"?vp(l):"","Conta":l.natureza==="transf"?`${nomeConta(l.contaId)} → ${nomeConta(l.contaDestino)}`:nomeConta(l.contaId),
    "Grãos (sc)":l.quitGraos?`${l.quitGraos.sacas} sc ${l.quitGraos.cultura}`:"","NF":l.nf||"","Em nome de":l.titular||"","Contrato / pedido":ctrTxt(l.contrato),"Safra":l.natureza==="transf"?"":safraLab(safraLanc(l)),"Cultura":l.cultura||"","Talhões":(l.talhoes||[]).join(", "),"Agrupadores (Aegro)":l.tags||"",
    "Juros (R$)":l.categoria==="financ"?jurosDe(l):"","Itens":(l.itens||[]).map(i=>`${i.desc}${i.valor!=null?" "+brl(i.valor):""}`).join("; "),"Observação":l.obs||"","Lançado por":quem(l.criadoPor)})));
  const s=saldos();
  add("Contas bancárias",fnContas.map(c=>({"Conta":c.nome,"Tipo":FN_TIPOS[c.tipo]||c.tipo,"Saldo inicial (R$)":Number(c.saldoInicial)||0,"Data do saldo inicial":dt(c.dataInicial),"Saldo atual (R$)":+(s[c.id]||0).toFixed(2)})));
};
window.finConfig=()=>cfgDoc();
window.finRender=function(view){
  if(!fnCarregou&&db) return;
  if(view==="fin_resumo") renderResumo();
  else if(view==="fin_contas"){renderContas(); if(!fnEdit){opcoesConta("#fn-conta",$("#fn-conta").value); opcoesConta("#fn-de",$("#fn-de").value); opcoesConta("#fn-para",$("#fn-para").value)}}
  else if(view==="fin_caixa") renderCaixa();
  else if(view==="fin_safra") renderSafra();
};
window.finAgenda=()=>{clearTimeout(window.finAgenda.t); window.finAgenda.t=setTimeout(()=>{
  gerarRecorrentes();
  for(const v of ["fin_resumo","fin_contas","fin_caixa","fin_safra"]) if(visivel(v)){try{window.finRender(v)}catch(e){console.error(e)}}
  const dl=[...new Set(fnLanc.map(l=>l.pessoa).filter(Boolean))]; $("#dl-fn-pessoa").innerHTML=dl.map(p=>`<option value="${esc(p)}">`).join("");
  $("#dl-fn-tit").innerHTML=[...new Set(fnLanc.map(l=>l.titular).filter(Boolean))].map(p=>`<option value="${esc(p)}">`).join("");
  $("#dl-fn-contrato").innerHTML=[...new Set(fnLanc.map(l=>l.contrato).filter(Boolean))].slice(-80).map(p=>`<option value="${esc(p)}">`).join("");
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
$("#fn-catbox").addEventListener("toggle",()=>{if($("#fn-catbox").open) renderCats()});
$("#fn-cats-salvar").onclick=salvarCats;
{const tip=$("#pn-tip"); if(tip&&tip.parentElement!==document.body) document.body.appendChild(tip)}
$("#fn-item-add").onclick=()=>{itensRender([...itensLer(),{desc:"",valor:null}]); const r=[...document.querySelectorAll("#fn-itens .i-desc")].pop(); r?.focus()};
$("#fn-dividir").onclick=dividir;
$("#fn-cat").addEventListener("change",jurosVis);
$("#fn-np").addEventListener("change",dividir);
$("#fn-aegro").addEventListener("change",e=>{const f=e.target.files[0]; e.target.value=""; if(f) importarAegro(f)});
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
