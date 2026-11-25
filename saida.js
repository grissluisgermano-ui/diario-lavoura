/* Diário da Lavoura — saída do estoque sem atividade (v107)
   Venda de um produto do estoque (ex. semente de aveia colhida e guardada), uso nos animais,
   outro uso fora da lavoura, perda/descarte ou doação.
   Grava no produto uma entrada NEGATIVA {quantidade:-q, valorTotal:0, saida:<tipo>, destino, valorVenda, custoSaida, emb, obs, sid}
   — o saldo cai (resumoProd, saldoNaData, gruposEmb já somam as entradas) e o custo médio não muda (só entradas com valor > 0).
   Venda cria no Financeiro uma conta a receber (fin_lanc, origem "es|<produto>|<sid>"), já recebida na conta escolhida ou em aberto. */
(function(){
  const TIPOS={venda:"Venda",animais:"Uso nos animais",uso:"Outro uso (fora da lavoura)",perda:"Perda / descarte",doacao:"Doação"};
  const ICO={venda:"💰",animais:"🐄",uso:"↗",perda:"🗑",doacao:"🎁"};
  let aberto=null; const rasc={};
  const contas=()=>(window.finColecoes?.().fin_contas||[]);
  const catsR=()=>(window.finCatsReceber?.()||[{k:"outras_r",l:"Outras receitas"}]);
  const nq=v=>{const n=parseFloat(String(v||"").trim().replace(/\./g,"").replace(",","."));return isFinite(n)?n:NaN};
  const rid=()=>Math.random().toString(36).slice(2,10);

  function grupos(e){ // embalagens com saldo (semente por embalagem)
    try{return (resumoProd(e).grupos||[]).filter(g=>g.saldo>0.0005)}catch{return []}
  }
  function form(e){
    const r=rasc[e.id]||{}, t=r.t||"venda", emb=ehEmb(e), gs=emb?grupos(e):[];
    const s=resumoProd(e), un=emb?"":e.unidade;
    const cs=contas();
    return `<div class="sai-form" data-sai="${e.id}">
      <div class="sai-tit">Saída do estoque sem atividade</div>
      <div class="chips sai-tipos">${Object.entries(TIPOS).map(([k,l])=>`<button type="button" class="chip" data-saitp="${k}" aria-pressed="${k===t}">${ICO[k]} ${l}</button>`).join("")}</div>
      <div class="grid2">
        <div class="field"><label>Data</label><input type="date" class="sai-d" value="${esc(r.d||todayISO())}"></div>
        ${emb?`<div class="field"><label>Embalagem</label><select class="sai-g">${gs.map(g=>`<option value="${esc(g.k)}" ${g.k===r.g?"selected":""}>${esc(embRot(g.m,2))} (tem ${numEmb(g.saldo)})</option>`).join("")||`<option value="">sem saldo</option>`}</select></div>`:""}
        <div class="field"><label>Quantidade${un?` (${un})`:""}</label><input class="sai-q" inputmode="decimal" value="${esc(r.q||"")}" placeholder="${emb?"nº de embalagens (ou kg)":`tem ${numP(Math.max(s.saldo,0))} ${un}`}"></div>
        <div class="field"><label>${t==="venda"?"Comprador":t==="doacao"?"Para quem":"Para quê / onde"}</label><input class="sai-dest" value="${esc(r.dest||"")}" placeholder="${t==="venda"?"Ex.: vizinho João":t==="animais"?"Ex.: tratamento do gado":t==="perda"?"Ex.: venceu, molhou":""}"></div>
        ${t==="venda"?`
        <div class="field"><label>Valor da venda (R$)</label><input class="sai-v" inputmode="decimal" value="${esc(r.v||"")}" placeholder="total recebido"></div>
        <div class="field"><label>Recebimento</label><select class="sai-cta"><option value="">A receber (em aberto)</option>${cs.map(c=>`<option value="${esc(c.id)}" ${c.id===r.cta?"selected":""}>Já recebido em ${esc(c.nome)}</option>`).join("")}</select></div>
        <div class="field"><label>Forma</label><select class="sai-fm">${["Pix","Dinheiro","Transferência","Boleto","Cheque","Outra"].map(f=>`<option ${f===(r.fm||"Pix")?"selected":""}>${f}</option>`).join("")}</select></div>
        <div class="field"><label>Categoria no Financeiro</label><select class="sai-cat">${catsR().map(c=>`<option value="${esc(c.k)}" ${c.k===(r.cat||"outras_r")?"selected":""}>${esc(c.l)}</option>`).join("")}</select></div>`:""}
        <div class="field full"><label>Observação</label><input class="sai-o" value="${esc(r.o||"")}" placeholder="Opcional"></div>
      </div>
      <div class="note sai-info"></div>
      <div class="row"><button type="button" class="btn sai-ok">Registrar saída</button><button type="button" class="btn ghost sai-x">Cancelar</button><span class="note sai-st" role="status"></span></div>
    </div>`;
  }
  function info(f,e){
    const emb=ehEmb(e), q=nq(f.querySelector(".sai-q")?.value), s=resumoProd(e);
    let custo=null, tem=0, unTxt=e.unidade;
    if(emb){const g=grupos(e).find(x=>x.k===f.querySelector(".sai-g")?.value); if(g){custo=g.custo; tem=g.saldo; unTxt=embRot(g.m,q>1?2:1)}}
    else {custo=s.custo; tem=s.saldo}
    const v=nq(f.querySelector(".sai-v")?.value), el=f.querySelector(".sai-info");
    const p=[];
    if(q>0){ if(q>tem+0.0005) p.push(`⚠️ Só tem ${numEmb(tem)} ${unTxt} no estoque.`);
      if(custo!=null) p.push(`Custo no estoque: ${brl(q*custo)}${v>0?` · venda ${brl(v)} (${brl(v/q)} por ${emb?"embalagem":e.unidade})`:""}`);
      else if(v>0) p.push(`Venda ${brl(v)} = ${brl(v/q)} por ${emb?"embalagem":e.unidade}`) }
    el.textContent=p.join(" ");
    return {q,custo,tem};
  }
  function ler(f,id){const g=c=>f.querySelector(c)?.value??""; rasc[id]={...(rasc[id]||{}),d:g(".sai-d"),g:g(".sai-g"),q:g(".sai-q"),dest:g(".sai-dest"),v:g(".sai-v"),cta:g(".sai-cta"),fm:g(".sai-fm"),cat:g(".sai-cat"),o:g(".sai-o")}}

  async function gravar(f,e,btn){
    const st=t=>f.querySelector(".sai-st").textContent=t, r=rasc[e.id]||{}, t=r.t||"venda";
    const {q,custo}=info(f,e), d=f.querySelector(".sai-d").value;
    if(!d){st("Informe a data.");return} if(!(q>0)){st("Informe a quantidade.");return}
    const emb=ehEmb(e); let m=null;
    if(emb){const g=grupos(e).find(x=>x.k===f.querySelector(".sai-g").value); if(!g){st("Escolha a embalagem.");return} m=g.m}
    const v=nq(f.querySelector(".sai-v")?.value), dest=f.querySelector(".sai-dest").value.trim(), obs=f.querySelector(".sai-o").value.trim();
    if(t==="venda"&&!(v>0)){st("Informe o valor da venda.");return}
    btn.disabled=true; st("Salvando…");
    const sid=rid(), qtxt=emb?`${numEmb(q)} ${embRot(m,q>1?2:1)}`:`${numP(q)} ${e.unidade}`;
    const ent={data:d,quantidade:-q,valorTotal:0,saida:t,destino:dest,obs,sid,origem:TIPOS[t]+(dest?` — ${dest}`:""),criadoEm:new Date().toISOString()};
    if(m) ent.emb=m; if(custo!=null) ent.custoSaida=Math.round(q*custo*100)/100;
    try{
      if(t==="venda"){
        ent.valorVenda=v;
        const cta=f.querySelector(".sai-cta").value, fid="es_"+e.id+"_"+sid;
        const l={natureza:"receber",descricao:`Venda de ${e.comercial} — ${qtxt}`,pessoa:dest,categoria:f.querySelector(".sai-cat").value||"outras_r",forma:f.querySelector(".sai-fm").value,
          competencia:d,vencimento:d,valor:v,status:cta?"pago":"aberto",pagoEm:cta?d:null,valorPago:cta?v:null,contaId:cta||null,
          itens:[{desc:e.comercial,qtd:q,un:emb?"emb":e.unidade,vu:Math.round(v/q*10000)/10000,valor:v}],origem:`es|${e.id}|${sid}`,obs,criadoEm:new Date().toISOString()};
        await db.collection("fin_lanc").doc(fid).set(l); ent.finSaida=fid;
      }
      const {id,...doc}=estoque.find(x=>x.id===e.id)||e;
      doc.entradas=[...(doc.entradas||[]),ent];
      await db.collection("estoque").doc(e.id).set(doc);
      delete rasc[e.id]; aberto=null;
      window.ponte?.aviso?.(t==="venda"?`Venda registrada: ${qtxt} saiu do estoque e ${brl(v)} entrou no Financeiro.`:`Saída registrada: ${qtxt} saiu do estoque.`,true);
      renderEstoque();
    }catch(err){btn.disabled=false; st("Não foi possível salvar. Tente de novo.")}
  }

  /* linha da saída na lista de entradas do produto */
  window.saiLinha=(e,x,i)=>`<div class="ent ent-sai"><span>${x.data?brDate(x.data):"–"}</span><span>${ICO[x.saida]||"↗"} −${ehEmb(e)?`${numEmb(-x.quantidade)} ${esc(embRot(x.emb,-x.quantidade))}`:`${numP(-x.quantidade)} ${e.unidade}`}</span><span>${x.valorVenda>0?brl(x.valorVenda):x.custoSaida>0?`<small>custo ${brl(x.custoSaida)}</small>`:"–"}</span><button type="button" class="link danger" data-rmsai="${e.id}:${i}">Excluir</button><span class="ent-orig">${esc(TIPOS[x.saida]||"Saída")}${x.destino?` — ${esc(x.destino)}`:""}${x.obs?` · ${esc(x.obs)}`:""}${x.finSaida?` · no Financeiro`:""}</span></div>`;
  window.saiBloco=e=>aberto===e.id?form(e):"";
  window.saiBotao=e=>`<button type="button" class="link" data-saibt="${e.id}">${aberto===e.id?"Fechar saída":"↗ Saída / venda"}</button>`;
  window.saiLiga=cont=>{
    cont.querySelectorAll("[data-saibt]").forEach(b=>b.onclick=()=>{aberto=aberto===b.dataset.saibt?null:b.dataset.saibt; renderEstoque(); if(aberto) document.querySelector(`.sai-form[data-sai="${aberto}"]`)?.scrollIntoView({block:"center"})});
    cont.querySelectorAll(".sai-form").forEach(f=>{
      const e=estoque.find(x=>x.id===f.dataset.sai); if(!e) return;
      f.querySelectorAll("[data-saitp]").forEach(b=>b.onclick=()=>{ler(f,e.id); rasc[e.id].t=b.dataset.saitp; renderEstoque()});
      f.addEventListener("input",()=>{ler(f,e.id); info(f,e)}); f.addEventListener("change",()=>{ler(f,e.id); info(f,e)});
      info(f,e);
      f.querySelector(".sai-x").onclick=()=>{aberto=null; delete rasc[e.id]; renderEstoque()};
      f.querySelector(".sai-ok").onclick=ev=>gravar(f,e,ev.currentTarget);
    });
    cont.querySelectorAll("[data-rmsai]").forEach(b=>b.onclick=async()=>{
      const [pid,i]=b.dataset.rmsai.split(":"), e=estoque.find(x=>x.id===pid), x=e?.entradas?.[+i]; if(!x) return;
      if(b.dataset.ok!=="1"){b.dataset.ok="1"; b.textContent=x.finSaida?"Excluir (e a receita no Financeiro)":"Confirmar exclusão"; setTimeout(()=>{if(b.isConnected){b.dataset.ok=""; b.textContent="Excluir"}},4000); return}
      b.disabled=true;
      try{
        if(x.finSaida) await db.collection("fin_lanc").doc(x.finSaida).delete().catch(()=>{});
        const {id,...doc}=e; doc.entradas=(doc.entradas||[]).filter((_,k)=>k!==+i);
        await db.collection("estoque").doc(pid).set(doc);
      }catch{b.disabled=false}
    });
  };
})();
