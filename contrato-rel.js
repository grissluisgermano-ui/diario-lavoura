/* Diário da Lavoura — Relatório do contrato (v117): tudo de um contrato de fornecimento de insumos numa página, com "Imprimir / PDF".
   Contrato = número normalizado (finApi.ctrN: só dígitos, ou "pedido N"). Junta:
   - Financeiro: contas a pagar com esse contrato (por nota: parcelas, vencimento, valor da nota, desconto do contrato, líquido, pago/aberto);
   - Estoque: entradas com esse contrato (compras, retiradas já pagas, devoluções), por produto;
   - Uso: para cada produto, o que saiu do estoque vai primeiro para as entradas mais antigas (PEPS); a parte das entradas deste contrato
     mostra em quais atividades (data, talhão, cultura) foi aplicada e quanto ainda está no estoque.
   Abre em #crl-tela (window.ctrRelatorio(numero)). Entradas: Financeiro → Resumo → "Contratos e pedidos em aberto" (tocar no contrato),
   Resultado da safra → "Contratos de insumos" e o seletor "Outro contrato" dentro do relatório. */
(function(){
  const F=()=>window.finApi;
  const N=v=>F()?.ctrN?F().ctrN(v):String(v||"").replace(/\D/g,"");
  const nf=s=>String(s||"").replace(/^0+/,"");
  const ehE=e=>typeof ehEmb==="function"&&ehEmb(e);

  // todos os contratos conhecidos (Financeiro, descontos, estoque)
  function contratos(){
    const m=new Map(), add=(c,info)=>{const k=N(c); if(!k) return; const x=m.get(k)||{k,txt:c,pessoa:"",n:0}; x.n++; if(info&&!x.pessoa) x.pessoa=info; m.set(k,x)};
    for(const l of F()?.lanc()||[]) if(l.contrato&&l.natureza==="pagar") add(l.contrato,l.pessoa);
    for(const [c,v] of Object.entries(F()?.contratosCfg()||{})) add(c,v?.fornecedor);
    for(const e of estoque) for(const x of e.entradas||[]) if(x.contrato) add(x.contrato,x.origem);
    return [...m.values()].sort((a,b)=>b.k.localeCompare(a.k));
  }

  function calcula(k){
    const lanc=(F()?.lanc()||[]).filter(l=>l.natureza==="pagar"&&l.contrato&&N(l.contrato)===k);
    const cfgE=Object.entries(F()?.contratosCfg()||{}).find(([c])=>N(c)===k);
    const cfg=cfgE?.[1]||null;
    // notas do Financeiro
    const notas=new Map();
    for(const l of lanc){const key=l.chave||(l.nf?nf(l.nf)+"|"+(l.pessoa||""):l.grupo||l.id);
      const x=notas.get(key)||{nf:l.nf,pessoa:l.pessoa,data:l.competencia||l.vencimento,chave:l.chave,parc:[],itens:l.itens||[],categoria:l.categoria}; x.parc.push(l); if((l.competencia||"")<(x.data||"9")) x.data=l.competencia; notas.set(key,x)}
    const ns=[...notas.values()].sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    let cheio=0, liq=0, pago=0, aberto=0, descPrev=0, descObt=0, prox=null;
    for(const n of ns) for(const l of n.parc){
      const v=Number(l.valor)||0, lp=F().liqPrev(l); cheio+=v;
      if(l.status==="pago"){const vpg=l.valorPago!=null?Number(l.valorPago):v; pago+=vpg; liq+=vpg; if(vpg<v) descObt+=v-vpg}
      else{aberto+=lp; liq+=lp; descPrev+=v-lp; if(!prox||l.vencimento<prox) prox=l.vencimento}
    }
    // estoque: entradas com o contrato
    const prods=[];
    for(const e of estoque){
      const ents=(e.entradas||[]).map((x,i)=>({x,i})).filter(({x})=>x.contrato&&N(x.contrato)===k);
      if(!ents.length) continue;
      const comp=ents.filter(({x})=>Number(x.quantidade)>0), dev=ents.filter(({x})=>Number(x.quantidade)<0);
      const q=comp.reduce((a,{x})=>a+Number(x.quantidade),0), v=comp.reduce((a,{x})=>a+(Number(x.valorTotal)||0),0);
      const qd=dev.reduce((a,{x})=>a-Number(x.quantidade),0), vd=dev.reduce((a,{x})=>a-(Number(x.valorTotal)||0),0);
      const P={e,ents,q,v,qd,vd,ret:comp.some(({x})=>x.retirada),usos:[],usado:0,emb:ehE(e)};
      if(!P.emb) pepS(e,P);
      prods.push(P);
    }
    prods.sort((a,b)=>b.v-a.v);
    const vEst=prods.reduce((a,p)=>a+p.v-p.vd,0), retirado=prods.filter(p=>p.ret).reduce((a,p)=>a+p.v-p.vd,0);
    const pctTxt=cfg?.desc?Object.entries(cfg.desc).filter(([,p])=>Number(p)>0).map(([c,p])=>`${({defensivos:"defensivos",fertilizantes:"fertilizantes",sementes:"sementes",insumos:"outros insumos"})[c]||c} ${num(Number(p))}%`).join(" · "):"";
    // já retirado = notas com conta (menos o "saldo a retirar" do pagamento do contrato) + notas de retirada que só entraram no estoque
    const cheioNotas=lanc.filter(l=>!l.saldoContrato).reduce((a,l)=>a+(Number(l.valor)||0),0), jaRet=+(cheioNotas+retirado).toFixed(2);
    const vt=Number(cfg?.valorTotal)||0, falta=vt>0?Math.max(0,+(vt-jaRet).toFixed(2)):0;
    const saldoPago=lanc.some(l=>l.saldoContrato);
    const pctResto=(Number(cfg?.desc?.[cfg?.restoCls||"defensivos"])||0)/100, faltaLiq=saldoPago?0:+(falta*(1-pctResto)).toFixed(2);
    const venc=cfg?.vencimento||prox||null, abertoVenc=+(aberto+faltaLiq).toFixed(2);
    const abertos=lanc.filter(l=>l.status!=="pago");
    return {jaRet,saldoPago,abertos,vt,falta,faltaLiq,pctResto,venc,abertoVenc,antecipa:Number(cfg?.antecipa)||0,quitado:cfg?.quitado||null,cfgKey:cfgE?.[0]||null,
      k,txt:cfgE?.[0]||lanc[0]?.contrato||k,cfg,pctTxt,ns,cheio,liq,pago,aberto,descPrev,descObt,prox,prods,vEst,retirado,
      pessoa:cfg?.fornecedor||lanc[0]?.pessoa||""};
  }

  // PEPS: o que saiu do produto vai primeiro para as entradas mais antigas; guarda a parte das entradas deste contrato
  function pepS(e,P){
    const fila=(e.entradas||[]).map((x,i)=>({x,i,q:Number(x.quantidade)||0,d:x.data||""})).filter(o=>o.q>0).sort((a,b)=>a.d.localeCompare(b.d)||a.i-b.i);
    const meu=new Set(P.ents.map(o=>o.i));
    const saidas=[];
    for(const r of registros){ if(ehProg(r)) continue;
      for(const p of r.campos?.produtos||[]){ if(!(p.produtoId===e.id||(!p.produtoId&&String(p.nome).toLowerCase()===e.comercial.toLowerCase()))) continue;
        const d=typeof p.dose==="number"?p.dose:parseNum(p.dose), f=FATOR[e.unidade]?.[p.unidade], a=areaTotal(r);
        if(f!=null&&d>0) saidas.push({d:r.data,q:d*f*a,r})}}
    for(const x of e.entradas||[]) if(Number(x.quantidade)<0) saidas.push({d:x.data||"",q:-Number(x.quantidade),saida:x});
    saidas.sort((a,b)=>a.d.localeCompare(b.d));
    let j=0;
    for(const s of saidas){let falta=s.q;
      while(falta>1e-9&&j<fila.length){const o=fila[j], t=Math.min(o.q,falta); o.q-=t; falta-=t;
        if(meu.has(o.i)){P.usado+=t; P.usos.push({...s,q:t,custo:(Number(o.x.valorTotal)||0)/(Number(o.x.quantidade)||1)*t})}
        if(o.q<=1e-9) j++}}
  }

  // desconto por antecipação: % ao mês × meses até o vencimento (meses de calendário + dias que sobram ÷ 30)
  function mesesAte(d,venc){if(!d||!venc||d>=venc) return 0;
    const a=new Date(d+"T12:00:00"), b=new Date(venc+"T12:00:00");
    let m=(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth()); const c=new Date(a); c.setMonth(c.getMonth()+m);
    if(c>b){m--; c.setMonth(c.getMonth()-1)} return m+Math.round((b-c)/864e5)/30}
  const valorEm=(x,d)=>{const m=mesesAte(d,x.venc); return {m,v:+(x.abertoVenc*(1-x.antecipa/100*m)).toFixed(2)}};
  window.ctrValorEm=valorEm;
  /* ---------- tela ---------- */
  let aberto=null;
  const card=(l,v,sub,cls)=>`<div class="crl-k${cls?" "+cls:""}"><small>${l}</small><b>${v}</b>${sub?`<span>${sub}</span>`:""}</div>`;
  const row=(t,sub,v,v2,attr)=>`<div class="crl-l"${attr||""}><div class="crl-t">${t}${sub?`<small>${sub}</small>`:""}</div><div class="crl-v">${v}${v2?`<small>${v2}</small>`:""}</div></div>`;
  const qtd=(q,un)=>`${numP(Math.round(q*10000)/10000)} ${esc(un||"")}`;
  function html(x){
    const lista=contratos();
    const cul=r=>typeof culturaReg==="function"?culturaReg(r):r.campos?.cultura;
    return `<div class="crl-bar"><button type="button" class="btn ghost" id="crl-volta">‹ Voltar</button><span class="crl-bar-t">Relatório do contrato</span><button type="button" class="btn" id="crl-print">🖨 Imprimir / PDF</button></div>
    <div class="crl-corpo">
      <div class="crl-cab"><h2>${esc(F().ctrTxt(x.txt))}</h2>
        <label class="crl-sel">Outro contrato <select id="crl-outro">${lista.map(c=>`<option value="${esc(c.k)}"${c.k===x.k?" selected":""}>${esc(F().ctrTxt(c.txt))}${c.pessoa?" · "+esc(c.pessoa):""}</option>`).join("")}</select></label></div>
      <p class="note">${(()=>{const cs=x.cfg&&F().cultSafra?F().cultSafra(x.cfg):{cultura:x.cfg?.cultura,safra:null}; return [x.pessoa,cs.cultura?`cultura ${cs.cultura}${cs.safra?" "+safraLab(cs.safra):""}`:"",x.cfg?.obs].filter(Boolean).map(esc).join(" · ")})()}${x.pctTxt?`<br>Desconto do contrato no vencimento: <b>${esc(x.pctTxt)}</b>`:`<br>Sem desconto cadastrado para este contrato.`} <button type="button" class="link crl-cad" data-crlcad="1">Editar o cadastro</button></p>
      <div class="crl-pap"><b>📎 Papéis do contrato</b><div id="crl-anx"></div>${(()=>{const ds=window.docDoContrato?.(x.cfgKey||x.txt)||[]; return `<div class="crl-docs">${ds.length?`<small class="note">Ligados a este contrato em Documentos:</small>${ds.map(d=>`<div class="crl-doc"><b>${esc(d.titulo)}</b>${d.data?` <small class="note">${brDate(d.data)}</small>`:""} ${window.anxLinks?window.anxLinks(d.anexos||[],"Foto"):""}</div>`).join("")}`:""}${window.docNovo?`<button type="button" class="link crl-cad" data-crldoc="1">+ Guardar outro documento ligado a este contrato</button>`:""}</div>`})()}</div>
      <div class="crl-ks">
        ${card(x.saldoPago?"Contrato (preço cheio)":"Comprado (notas)",brl(x.cheio),`${x.ns.filter(n=>!n.parc.some(l=>l.saldoContrato)).length} nota${x.ns.length===1?"":"s"}${x.saldoPago?" + saldo a retirar":""} · preço cheio`)}
        ${card("Desconto",brl(x.descPrev+x.descObt),x.descObt?`${brl(x.descObt)} já obtido${x.descPrev?` + ${brl(x.descPrev)} previsto`:""}`:x.descPrev?"previsto no vencimento":"–")}
        ${card("A pagar (líquido)",brl(x.liq),"")}
        ${card("Já pago",brl(x.pago),"")}
        ${card("Em aberto",brl(x.aberto),x.prox?`vence ${brDate(x.prox)}`:"",x.aberto>0.004?"ab":"")}
        ${x.retirado?card("Retirado já pago",brl(x.retirado),"notas de retirada no depósito"):""}
      </div>
      ${x.vt?`<div class="crl-ls">
        ${row("Valor do contrato","preço cheio, retirado ou não",brl(x.vt),"")}
        ${row("Já retirado (notas lançadas)","",brl(x.jaRet),"")}
        ${row("Falta retirar",x.falta?(x.saldoPago?"já pago no contrato · ainda no depósito da cooperativa":`pago junto no vencimento · desconto de ${num(x.pctResto*100)}%`):"",brl(x.falta),x.falta&&!x.saldoPago?`${brl(x.faltaLiq)} com desconto`:"")}
        ${x.quitado?"":row(`<b>A pagar no vencimento</b>${x.venc?` (${brDate(x.venc)})`:""}`,"notas em aberto com desconto + o que falta retirar com desconto",`<b>${brl(x.abertoVenc)}</b>`,"")}
      </div>`:`<p class="note">Para ver o que falta retirar e o valor a pagar, informe o <b>valor total do contrato</b> em Financeiro → Resumo → Descontos dos contratos.</p>`}
      ${x.quitado?`<p class="crl-ok">✓ Contrato pago em ${brDate(x.quitado)}${x.cfg?.quitadoValor?` · ${brl(x.cfg.quitadoValor)}`:""}. As notas que chegarem depois entram no estoque como retirada já paga. <button type="button" class="link danger" id="crl-desf">Desfazer o pagamento</button></p>`
        :x.abertoVenc>0.004?`<div class="crl-pag">
        <h3>Pagar o contrato</h3>
        <div class="crl-pg">
          <label>Data do pagamento <input type="date" id="crl-pd" value="${todayISO()}"></label>
          <label>Conta <select id="crl-pc">${(F().contas()||[]).map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select></label>
          <label>Valor pago (R$) <input id="crl-pv" inputmode="decimal"></label>
        </div>
        <p class="note" id="crl-pn"></p>
        <div class="row"><button type="button" class="btn" id="crl-pagar">Pagar o contrato</button></div>
        <p class="note">Dá baixa em todas as notas em aberto (cada uma com o seu desconto, na proporção do valor pago)${x.falta?` e lança os ${brl(x.falta)} que faltam retirar como "Saldo do contrato a retirar", já pago`:""}. As notas que chegarem depois deste contrato entram só no estoque, como retirada já paga.</p>
      </div>`:""}

      <h3>Notas e parcelas <small>${x.ns.length}</small></h3>
      ${x.ns.length?`<div class="crl-ls">${x.ns.map(n=>{const tot=n.parc.reduce((a,l)=>a+(Number(l.valor)||0),0);
        return row(n.parc.some(l=>l.saldoContrato)?`${brDate(n.data)} · Saldo do contrato a retirar`:`${brDate(n.data)} · NF ${esc(n.nf||"–")}`,n.parc.sort((a,b)=>String(a.vencimento).localeCompare(String(b.vencimento))).map(l=>{const lp=F().liqPrev(l);
            return `${l.parcela?esc(l.parcela)+" · ":""}vence ${brDate(l.vencimento)} · ${l.status==="pago"?`<b class="ok">pago ${l.pagoEm?brDate(l.pagoEm):""} ${brl(l.valorPago??l.valor)}</b>`:`<b class="ab">em aberto ${brl(lp)}</b>${lp<Number(l.valor)?` (nota ${brl(l.valor)} − desconto ${brl(Number(l.valor)-lp)})`:""}`}${l.chave?` <button type="button" class="link" data-danfe="${esc(l.chave)}">DANFE</button>`:""} <button type="button" class="link" data-ctrfin="${l.id}">abrir</button>`}).join("<br>"),
          brl(tot),esc(F().catNome(n.categoria)))}).join("")}</div>`:`<p class="note">Nenhuma conta do Financeiro com este contrato.</p>`}

      <h3>Produtos <small>${x.prods.length} · ${brl(x.vEst)} no estoque pelo contrato</small></h3>
      ${x.prods.length?`<div class="crl-ls">${x.prods.map(P=>{const e=P.e, un=e.unidade, liqQ=P.q-P.qd, resta=Math.max(0,liqQ-P.usado), cu=P.q>0?P.v/P.q:0;
        const onde=new Map(); for(const u of P.usos){const k=u.r?`${cul(u.r)||"Sem cultura"} · ${(u.r.talhoes||[]).join(", ")}`:`Saída: ${u.saida?.saida||"devolução"}`; const o=onde.get(k)||{q:0,v:0,n:0,d:u.d}; o.q+=u.q; o.v+=u.custo; o.n++; onde.set(k,o)}
        return row(`<b>${esc(e.comercial)}</b>${P.ret?` <span class="crl-tag">retirada</span>`:""}`,
          `${P.emb?"semente por embalagem":`${qtd(P.q,un)} comprados a ${brl(cu)}/${esc(un)}`}${P.qd?` · devolvido ${qtd(P.qd,un)}`:""}
          ${P.emb?"":`<br>Aplicado: <b>${qtd(P.usado,un)}</b> · no estoque: <b>${qtd(resta,un)}</b>`}
          ${onde.size?`<br>${[...onde.entries()].map(([k,o])=>`${esc(k)}: ${qtd(o.q,un)} (${o.n} aplicaç${o.n===1?"ão":"ões"})`).join("<br>")}`:""}`,
          brl(P.v-P.vd),P.emb?"":`${brl(P.usado*cu)} aplicado`,` data-ctrprod="${e.id}"`)}).join("")}</div>
        <p class="note">O que foi usado de cada produto sai primeiro das compras mais antigas. Por isso, se o mesmo produto veio também de outra nota ou contrato, a divisão entre "aplicado" e "no estoque" segue a ordem das compras.</p>`
        :`<p class="note">Nenhuma entrada do estoque com este contrato. As notas lançadas pelo XML já trazem o contrato; nas lançadas à mão, escolha o contrato no campo "Contrato de fornecimento".</p>`}
      <p class="note crl-rod">Gerado em ${brDate(todayISO())} pelo Diário da Lavoura.</p>
    </div>`;
  }
  function abre(k){
    k=N(k); if(!k) return; aberto=k;
    let el=document.getElementById("crl-tela");
    if(!el){el=document.createElement("div"); el.id="crl-tela"; el.className="crl-tela"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); document.body.appendChild(el)}
    el.innerHTML=html(calcula(k)); el.hidden=false; el.scrollTop=0; document.body.classList.add("crl-aberto");
    el.querySelector("#crl-volta").onclick=fecha;
    el.querySelector("#crl-print").onclick=()=>window.print();
    el.querySelector("#crl-outro").onchange=e=>abre(e.target.value);
    ligaPag(el,k);
    { const x=calcula(k), key=x.cfgKey||x.txt;
      const ax=window.anxCampo?.(el.querySelector("#crl-anx"),{rotulo:"Anexar foto ou PDF do contrato",accept:"image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx",
        muda:l=>F().salvaContrato(key,{anexos:l}).then(()=>window.ponte?.aviso?.("Papel do contrato guardado.",true)).catch(()=>{})});
      ax?.set(x.cfg?.anexos||[]);
      el.querySelector("[data-crlcad]").onclick=()=>{fecha(); F().abrirCadastro?.(key)};
      el.querySelector("[data-crldoc]")?.addEventListener("click",()=>{fecha(); window.docNovo({contrato:key})}); }
    el.querySelectorAll("[data-ctrfin]").forEach(b=>b.onclick=()=>{fecha(); F().abrir(b.dataset.ctrfin)});
    el.querySelectorAll("[data-ctrprod]").forEach(d=>{d.classList.add("crl-click"); d.onclick=ev=>{if(ev.target.closest("button")) return; fecha(); window.esAbrir?.(d.dataset.ctrprod)}});
  }
  function ligaPag(el,k){
    const bd=el.querySelector("#crl-desf");
    if(bd) bd.onclick=async()=>{
      if(!bd.dataset.conf){bd.dataset.conf=1; bd.textContent="Toque de novo para desfazer o pagamento"; return}
      bd.disabled=true; const x=calcula(k);
      try{for(const n of x.ns) for(const l of n.parc){
          if(l.saldoContrato){await db.collection("fin_lanc").doc(l.id).delete(); continue}
          if(!l.pagoNoContrato) continue;
          const {id,...doc}=l; delete doc.pagoEm; delete doc.contaId; delete doc.valorPago; delete doc.pagoNoContrato; doc.status="aberto"; await db.collection("fin_lanc").doc(id).set(doc)}
        await F().salvaContrato(x.cfgKey||x.txt,{quitado:null,quitadoValor:null,quitadoConta:null});
        window.ponte?.aviso?.("Pagamento do contrato desfeito: as notas voltaram para em aberto.",true); setTimeout(()=>abre(k),600)}
      catch(err){console.error(err); bd.disabled=false}};
    const d=el.querySelector("#crl-pd"), v=el.querySelector("#crl-pv"), n=el.querySelector("#crl-pn"), b=el.querySelector("#crl-pagar"); if(!b) return;
    const x=calcula(k);
    const sug=()=>{const r=valorEm(x,d.value); v.value=fmt2(r.v); v.dataset.auto=1;
      n.innerHTML=x.antecipa&&r.m>0?`No vencimento (${brDate(x.venc)}): ${brl(x.abertoVenc)}. Pagando em ${brDate(d.value)}, ${num(Math.round(r.m*100)/100)} ${Math.abs(r.m-1)<0.01?"mês":"meses"} antes, com ${num(x.antecipa)}% ao mês: <b>${brl(r.v)}</b> (${brl(x.abertoVenc-r.v)} a menos).`
        :d.value>x.venc&&x.venc?`Pagamento depois do vencimento (${brDate(x.venc)}): confira juros com a cooperativa.`:`Valor no vencimento: <b>${brl(x.abertoVenc)}</b>.`};
    d.onchange=sug; v.oninput=()=>delete v.dataset.auto; sug();
    b.onclick=async()=>{
      const pv=parseNum(v.value), conta=el.querySelector("#crl-pc").value, dt=d.value;
      if(!(pv>0)||!dt){v.focus(); return}
      if(!b.dataset.conf){b.dataset.conf=1; b.textContent=`Confirmar: pagar ${brl(pv)} em ${brDate(dt)}`; return}
      b.disabled=true;
      try{
        const base=x.abertos.map(l=>({l,b:F().liqPrev(l)})), tot=base.reduce((a,o)=>a+o.b,0)+x.faltaLiq;
        let resto=+pv.toFixed(2);
        const p=window.ponte; if(p) p.lote="cq"+Date.now().toString(36);
        for(let i=0;i<base.length;i++){const {l,b:bb}=base[i], vv=(i===base.length-1&&!x.falta)?resto:+(pv*bb/tot).toFixed(2); resto=+(resto-vv).toFixed(2);
          const {id,...doc}=l; Object.assign(doc,{status:"pago",pagoEm:dt,contaId:conta||null,valorPago:vv,pagoNoContrato:true}); await db.collection("fin_lanc").doc(id).set(doc)}
        if(x.falta>0){const cat=({defensivos:"defensivos",fertilizantes:"fertilizantes",sementes:"sementes"})[x.cfg?.restoCls||"defensivos"]||"insumos";
          await db.collection("fin_lanc").doc(`ctrsaldo_${k}`).set({natureza:"pagar",descricao:`Saldo do contrato ${x.txt} a retirar`,pessoa:x.pessoa||"",categoria:cat,competencia:dt,vencimento:x.venc||dt,
            valor:x.falta,valorPago:resto,status:"pago",pagoEm:dt,contaId:conta||null,contrato:x.txt,saldoContrato:true,nf:"",titular:"",itens:[{desc:`Produtos do contrato ainda no depósito (${F().catNome(cat)})`,valor:x.falta}],obs:"",criadoEm:new Date().toISOString()})}
        await F().salvaContrato(x.cfgKey||x.txt,{quitado:dt,quitadoValor:pv,quitadoConta:conta||null});
        if(p) p.lote=null;
        window.ponte?.aviso?.(`Contrato ${x.txt} pago: ${brl(pv)}.`,true); setTimeout(()=>abre(k),600);
      }catch(err){console.error(err); b.disabled=false; window.ponte?.aviso?.("Não foi possível registrar o pagamento. Tente de novo.")}
    };
  }
  function fecha(){aberto=null; const el=document.getElementById("crl-tela"); if(el) el.hidden=true; document.body.classList.remove("crl-aberto")}
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&aberto) fecha()});
  window.ctrRelatorio=abre; window.ctrCalcula=calcula; window.ctrLista=contratos;
})();
// "relatório" no cartão da conta (Financeiro → Contas)
document.addEventListener("click",e=>{const b=e.target.closest?.("[data-ctrrelc]"); if(!b) return; e.preventDefault(); e.stopPropagation(); window.ctrRelatorio(b.dataset.ctrrelc)},true);
// v117: deixa o contrato 84865 (cevada, Coamo) cadastrado com o que o Luis informou — só se ainda não houver cadastro dele
(function semear(t=0){
  const F=window.finApi, L=window.finLig;
  if(!F||!L?.pronto?.()||!db){ if(t<60) setTimeout(()=>semear(t+1),2000); return }
  const cs=F.contratosCfg(); if(Object.keys(cs).some(k=>k.replace(/\D/g,"")==="84865")) return;
  const l=F.lanc().find(x=>x.contrato&&String(x.contrato).replace(/\D/g,"")==="84865"); if(!l) return;
  F.salvaContrato(l.contrato,{fornecedor:l.pessoa||"Coamo",cultura:"Cevada",obs:"",desc:{defensivos:19,fertilizantes:3},valorTotal:124121.61,vencimento:"2027-04-01",antecipa:1.3,restoCls:"defensivos"}).catch(()=>{});
})();
