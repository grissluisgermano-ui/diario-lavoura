/* Diário da Lavoura — Resultado da lavoura (v115): o ciclo inteiro de uma cultura, do manejo antes do plantio à venda,
   sem cortar pela safra do calendário (cevada plantada em junho e colhida em novembro fica inteira).
   Lavoura = plantios executados da mesma cultura e da mesma safra do plantio (safraReg). Para cada uma:
   - atividades: lançamentos executados nos talhões dela, da cultura dela (culturaReg), do início (campos.inicio ou 1º plantio) ao fim
     (última colheita que fecha os plantios, ou "Lavoura encerrada em"; sem fim = até hoje); lançamento sem cultura no período entra
     dividido entre as lavouras que estavam no talhão;
   - insumos = custo gravado em cada atividade (dose × área × custo do produto, com desconto do contrato quando houver);
   - diretos = contas a pagar do Financeiro com esta cultura (ou com o talhão marcado) no período, mais os impostos retidos nas vendas dela;
   - gerais = contas sem cultura nem talhão: cada uma é espalhada pelos 365 dias da safra dela e a lavoura fica com os dias em que
     ocupou a terra × a área dela ÷ a área da propriedade (o arrendamento pago em sacas entra igual, pelo preço médio da venda);
   - produção = romaneios das colheitas (parte da Lavoura, dos funcionários e o que foi guardado no galpão);
   - receita = vendas da Lavoura desta cultura depois da 1ª colheita (até a colheita da próxima lavoura da mesma cultura);
     o que ainda está no depósito aparece à parte, pelo preço médio das vendas.
   Abre em tela cheia (#rlv-tela) com "Imprimir / PDF". Entradas: Resultado da safra (caixa #rlv-box) e Histórico da área (rotacao.js). */
(function(){
  const nk=c=>String(c||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
  const exec=r=>!ehProg(r);
  const tem=(r,t)=>(r.talhoes||[]).includes(t);
  const DIA=864e5, dIso=s=>new Date(s+"T12:00:00").getTime();
  const dias=(a,b)=>Math.round((dIso(b)-dIso(a))/DIA);
  const areaT=(r,t)=>Number(r.areas?.[t])||haDe(t);
  const sfReg=r=>typeof safraReg==="function"?safraReg(r):safraDe(r.data);
  const cuReg=r=>typeof culturaReg==="function"?culturaReg(r):r.campos?.cultura;
  const areaProp=()=>TALHOES.reduce((a,t)=>a+(Number(t.ha)||0),0);
  const brC=v=>typeof brlC==="function"?brlC(v):brl(v);

  /* ---------- as lavouras ---------- */
  function lista(){
    const g=new Map();
    for(const p of registros) if(p.tipo==="plantio"&&exec(p)&&p.campos?.cultura){
      const k=nk(p.campos.cultura)+"|"+sfReg(p);
      (g.get(k)||g.set(k,{cultura:normCult(p.campos.cultura),sy:sfReg(p),ps:[]}).get(k)).ps.push(p);
    }
    const ls=[...g.values()];
    for(const L of ls){
      L.ps.sort((a,b)=>a.data.localeCompare(b.data));
      L.talhoes=[...new Set(L.ps.flatMap(p=>p.talhoes||[]))];
      L.areaT={}; for(const p of L.ps) for(const t of p.talhoes||[]) L.areaT[t]=Math.min(haDe(t)||Infinity,(L.areaT[t]||0)+areaT(p,t));
      L.area=Object.values(L.areaT).reduce((a,b)=>a+b,0);
      L.plantio=L.ps[0].data;
      L.inicio=L.ps.reduce((m,p)=>{const i=p.campos?.inicio&&p.campos.inicio<p.data?p.campos.inicio:p.data; return i<m?i:m},L.plantio);
      L.cultivares=[...new Set(L.ps.map(p=>p.campos?.cultivar).filter(Boolean))];
      L.id=nk(L.cultura)+"_"+L.sy;
    }
    // colheitas e fim: colheita da mesma cultura (ou sem cultura) nos talhões, depois do plantio e antes da próxima lavoura da mesma cultura
    for(const L of ls){
      const prox=ls.filter(M=>M!==L&&nk(M.cultura)===nk(L.cultura)&&M.plantio>L.plantio).sort((a,b)=>a.plantio.localeCompare(b.plantio))[0];
      L.cols=registros.filter(r=>r.tipo==="colheita"&&exec(r)&&r.data>=L.plantio&&(!prox||r.data<prox.plantio)&&L.talhoes.some(t=>tem(r,t))&&(!r.campos?.cultura||nk(r.campos.cultura)===nk(L.cultura))).sort((a,b)=>a.data.localeCompare(b.data));
      const enc=L.ps.map(p=>p.campos?.encerrada).filter(Boolean).sort().pop();
      L.fim=L.cols.length?L.cols[L.cols.length-1].data:enc||null;
      L.colhida=L.cols.length>0; L.encerrada=!L.colhida&&!!enc;
      L.prox=prox||null;
    }
    return ls.sort((a,b)=>b.plantio.localeCompare(a.plantio));
  }

  /* ---------- o resultado de uma lavoura ---------- */
  function calcula(L){
    const ls=lista(), hoje=todayISO(), fim=L.fim||hoje, ini=L.inicio, kc=nk(L.cultura);
    const outras=ls.filter(M=>M.id!==L.id);
    // atividades
    const ativ=[];
    for(const r of registros){
      if(r.tipo==="chuva"||!exec(r)||r.data<ini||r.data>fim) continue;
      if(r.tipo==="colheita") continue; // colheitas vêm de L.cols
      const ts=(r.talhoes||[]).filter(t=>L.talhoes.includes(t)); if(!ts.length) continue;
      const c=nk(cuReg(r));
      let fr=1, obs="";
      if(c&&c!==kc) continue;
      if(!c){ // sem cultura: divide entre as lavouras que estavam no talhão nessa data
        const n=1+outras.filter(M=>ts.some(t=>M.talhoes.includes(t))&&M.inicio<=r.data&&(!M.fim||M.fim>=r.data)).length;
        fr=1/n; if(n>1) obs=`sem cultura informada: dividido entre ${n} lavouras`;
      }
      const v=ts.reduce((a,t)=>a+(Number(r.custoHaLiq??r.custoHa)||0)*Math.min(areaT(r,t),L.areaT[t]||areaT(r,t)),0)*fr;
      ativ.push({r,ts,v,obs});
    }
    for(const r of L.cols) ativ.push({r,ts:(r.talhoes||[]).filter(t=>L.talhoes.includes(t)),v:(r.talhoes||[]).filter(t=>L.talhoes.includes(t)).reduce((a,t)=>a+(Number(r.custoHaLiq??r.custoHa)||0)*areaT(r,t),0),obs:""});
    ativ.sort((a,b)=>a.r.data.localeCompare(b.r.data));
    const ins=ativ.reduce((a,x)=>a+x.v,0);

    // produção
    let sc=0, scLav=0, scFunc=0, kgGalpao=0; const porTit={};
    for(const c of L.cols){
      const at=Object.values(c.areas||{}).reduce((a,b)=>a+(Number(b)||0),0)||1, aqui=(c.talhoes||[]).filter(t=>L.talhoes.includes(t)).reduce((a,t)=>a+areaT(c,t),0), fr=Math.min(1,aqui/at)||1;
      const d=divisaoDe(c);
      for(const rm of c.romaneios||[]){const s=(Number(rm.sacas)||0)*fr; sc+=s;
        if(rm.estoque){kgGalpao+=Number(rm.kg)>0&&rm.un==="kg"?Number(rm.kg)*fr:s*60; scLav+=s; porTit.lavoura=(porTit.lavoura||0)+s; continue}
        for(const [t,p] of Object.entries(d)) if(p){const q=s*p/100; porTit[t]=(porTit[t]||0)+q; if(t==="lavoura") scLav+=q; else scFunc+=q}}
    }
    // vendas (só da Lavoura) da 1ª colheita até a colheita da próxima lavoura da mesma cultura
    const c1=L.cols[0]?.data, ate=L.prox?.cols?.[0]?.data||L.prox?.plantio||null;
    const vendasTodas=(typeof graos!=="undefined"?graos:[]).filter(m=>m.tipo==="venda"&&nk(m.cultura)===kc&&c1&&m.data>=c1&&(!ate||m.data<ate));
    const vendas=vendasTodas.filter(m=>(m.titular||"lavoura")==="lavoura");
    const vSc=vendas.reduce((a,m)=>a+m.sacas,0), vVal=vendas.reduce((a,m)=>a+(Number(m.valorTotal)||0),0), vComValor=vendas.filter(m=>Number(m.valorTotal)>0);
    const preco=vComValor.length?vComValor.reduce((a,m)=>a+Number(m.valorTotal),0)/vComValor.reduce((a,m)=>a+m.sacas,0):null;
    const arrSc=(typeof graos!=="undefined"?graos:[]).filter(m=>m.tipo==="arrendamento"&&nk(m.cultura)===kc&&c1&&m.data>=c1&&(!ate||m.data<ate)).reduce((a,m)=>a+m.sacas,0);
    const scGalpao=kgGalpao/60;
    const resta=Math.max(0,scLav-scGalpao-vSc-arrSc);

    // Financeiro
    const F=window.finApi, dir=[], ger=[];
    let dirT=0, gerT=0;
    const totA=areaProp()||L.area||1, diasL=Math.max(1,dias(ini,fim)+1);
    const vendaIds=new Set(vendasTodas.map(m=>m.id));
    const parteGeral=(v,d)=>{ // espalha pela safra da despesa e pega os dias da lavoura nessa safra × área
      const sy=safraDe(d), a=`${sy}-07-01`, b=`${sy+1}-06-30`, i0=ini>a?ini:a, i1=fim<b?fim:b;
      const dd=i1>=i0?dias(i0,i1)+1:0; return v*dd/365*L.area/totA};
    if(F){
      for(const l of F.lanc()){
        if(l.natureza!=="pagar") continue;
        const d=l.competencia||l.vencimento; if(!d) continue;
        const pp=F.papel(l.categoria); if(!["custo","financ"].includes(pp)) continue;
        let v=Number(F.vp(l))||0; if(pp==="financ") v=Number(F.jurosDe(l))||0; if(!(v>0)) continue;
        const org=String(l.origem||"");
        if(org.startsWith("nfv|")){ // imposto retido numa venda de grãos
          const ch=org.slice(4); if(vendaIds.has("nfv_"+ch)){dir.push({l,d,v,como:"retido na venda"}); dirT+=v} continue}
        if(F.insumo(l.categoria)&&ins>0) continue; // insumos já estão nas atividades
        const c=nk(l.cultura), ts=(l.talhoes||[]);
        if(c){ if(c===kc&&d>=ini&&(!ate||d<ate)&&(l.safra==null||l.safra===""||+l.safra===L.sy||d<=fim)){dir.push({l,d,v,como:"cultura marcada"}); dirT+=v} continue }
        if(ts.length){const tl=ts.filter(t=>L.talhoes.includes(t)); if(tl.length&&d>=ini&&d<=fim){const a=ts.reduce((x,t)=>x+haDe(t),0)||1, p=v*tl.reduce((x,t)=>x+(L.areaT[t]||0),0)/a; dir.push({l,d,v:p,como:"talhão marcado"}); dirT+=p} continue}
        const p=parteGeral(v,d); if(p>0.005){ger.push({l,d,v:p,tot:v}); gerT+=p}
      }
    }
    // arrendamento pago em sacas (Grãos), pelo preço médio das vendas da cultura dele
    const precoDe=cu=>{const v=(typeof graos!=="undefined"?graos:[]).filter(m=>m.tipo==="venda"&&nk(m.cultura)===nk(cu)&&Number(m.valorTotal)>0); const s=v.reduce((a,m)=>a+m.sacas,0); return s?v.reduce((a,m)=>a+Number(m.valorTotal),0)/s:null};
    const temArrDin=ger.some(g=>g.l.categoria==="arrendamento");
    if(!temArrDin) for(const m of (typeof graos!=="undefined"?graos:[])) if(m.tipo==="arrendamento"){const pr=precoDe(m.cultura); if(!pr) continue;
      const p=parteGeral(m.sacas*pr,m.data); if(p>0.005){ger.push({arr:m,d:m.data,v:p,tot:m.sacas*pr}); gerT+=p}}
    ger.sort((a,b)=>b.v-a.v); dir.sort((a,b)=>a.d.localeCompare(b.d));

    const custo=ins+dirT+gerT;
    return {L,ini,fim,diasL,totA,ativ,ins,dir,dirT,ger,gerT,custo,sc,scLav,scFunc,porTit,scGalpao,kgGalpao,vendas,vSc,vVal,preco,arrSc,resta,emAndamento:!L.fim};
  }

  /* ---------- tela ---------- */
  let aberto=null, verTudo={};
  const row=(t,sub,v,v2,cls,attr)=>`<div class="rlv-l${cls?" "+cls:""}"${attr||""}><div class="rlv-t">${t}${sub?`<small>${sub}</small>`:""}</div><div class="rlv-v">${v}${v2?`<small>${v2}</small>`:""}</div></div>`;
  const card=(l,v,sub,cls)=>`<div class="rlv-k${cls?" "+cls:""}"><small>${l}</small><b>${v}</b>${sub?`<span>${sub}</span>`:""}</div>`;
  function html(x){
    const {L}=x, a=L.area||1, rec=x.vVal, res=rec-x.custo, est=x.preco&&x.resta>0.05?x.resta*x.preco:0;
    const tipoN=r=>TIPOS[r.tipo]?.label||r.tipo;
    const prodTxt=r=>(r.campos?.produtos||[]).filter(p=>p.nome).map(p=>`${esc(p.nome)}${p.dose!=null&&p.dose!==""?` ${num(Number(p.dose))} ${esc(p.unidade||"")}`:""}`).join(" + ");
    const linhaAtiv=({r,ts,v,obs})=>row(`${brDate(r.data)} · ${esc(tipoN(r))}${r.campos?.alvo?` — ${esc(r.campos.alvo)}`:""}`,[prodTxt(r),esc(ts.join(", ")),obs?`<i>${esc(obs)}</i>`:""].filter(Boolean).join("<br>"),v>0?brl(v):"–",v>0?`${brl(v/a)}/ha`:"","",` data-rlreg="${r.id}"`);
    const nGer=verTudo[L.id]?x.ger.length:8;
    const titTxt=Object.entries(x.porTit).filter(([,v])=>v>0.005).map(([t,v])=>`${esc(titNome(t))} ${num(v)} sc`).join(" · ");
    return `<div class="rlv-bar"><button type="button" class="btn ghost" id="rlv-volta">‹ Voltar</button><span class="rlv-bar-t">Resultado da lavoura</span><button type="button" class="btn" id="rlv-print">🖨 Imprimir / PDF</button></div>
    <div class="rlv-corpo">
      <h2>${esc(L.cultura)}${L.cultivares.length?` <small>${esc(L.cultivares.join(", "))}</small>`:""}</h2>
      <p class="note">${esc(L.talhoes.map(t=>`${t} (${num(L.areaT[t])} ha)`).join(" · "))} · ${num(L.area)} ha · safra do plantio ${safraLab(L.sy)}<br>
        ${L.inicio<L.plantio?`Início do manejo ${brDate(L.inicio)} · `:""}plantio ${brDate(L.plantio)} · ${L.colhida?`colheita até ${brDate(L.fim)}`:L.encerrada?`encerrada em ${brDate(L.fim)}`:"ainda no campo"} · ${x.diasL} dias</p>
      ${x.emAndamento?`<p class="falta">Lavoura ainda no campo: os números vão mudar até a colheita e a venda.</p>`:""}
      <div class="rlv-ks">
        ${card("Custo total",brC(x.custo),`${brl(x.custo/a)}/ha`)}
        ${card("Receita (vendido)",rec?brC(rec):"–",rec?`${brl(rec/a)}/ha · ${num(x.vSc)} sc a ${brl(x.preco||0)}`:"nenhuma venda lançada")}
        ${card("Resultado",brC(res),`${brl(res/a)}/ha${rec?` · ${num(res/rec*100)}% da receita`:""}`,res<0?"neg":"pos")}
        ${card("Produção",`${num(x.sc)} sc`,`${num(x.sc/a)} sc/ha`)}
        ${x.preco?card("Custo em sacas",`${num(x.custo/a/x.preco)} sc/ha`,`ponto de equilíbrio a ${brl(x.preco)}/sc`):""}
      </div>
      ${est?`<p class="note rlv-est">Ainda no depósito, da parte da Lavoura: <b>${num(x.resta)} sc</b> ≈ ${brC(est)} pelo preço médio. Com elas, o resultado seria <b>${brC(res+est)}</b> (${brl((res+est)/a)}/ha).</p>`:""}

      <h3>Custos</h3>
      <div class="rlv-ls">
        ${row("Insumos das atividades","sementes, adubos, defensivos (o que foi aplicado)",brC(x.ins),`${brl(x.ins/a)}/ha · ${x.custo?num(x.ins/x.custo*100):0}%`)}
        ${row("Custos diretos","contas do Financeiro com esta cultura ou talhão, impostos das vendas",brC(x.dirT),`${brl(x.dirT/a)}/ha · ${x.custo?num(x.dirT/x.custo*100):0}%`)}
        ${row("Custos gerais rateados",`${x.diasL} dias × ${num(L.area)} de ${num(x.totA)} ha da propriedade`,brC(x.gerT),`${brl(x.gerT/a)}/ha · ${x.custo?num(x.gerT/x.custo*100):0}%`)}
        ${row("<b>Total</b>","",`<b>${brC(x.custo)}</b>`,`${brl(x.custo/a)}/ha`,"tot")}
      </div>

      <h3>Produção e vendas</h3>
      <div class="rlv-ls">
        ${row("Colhido",`${L.cols.length} colheita${L.cols.length===1?"":"s"}${titTxt?" · "+titTxt:""}`,`${num(x.sc)} sc`,`${num(x.sc/a)} sc/ha`)}
        ${x.scFunc>0.005?row("Parte dos funcionários","não é receita da Lavoura",`${num(x.scFunc)} sc`,""):""}
        ${x.kgGalpao>0?row("Guardado no galpão","semente própria, vai para o estoque pelo custo",`${num(x.kgGalpao)} kg`,`${num(x.scGalpao)} sc`):""}
        ${x.arrSc>0?row("Pago de arrendamento em sacas","",`${num(x.arrSc)} sc`,""):""}
        ${row("Vendido pela Lavoura",x.vendas.map(m=>`${brDate(m.data)}: ${num(m.sacas)} sc${m.local?" em "+esc(m.local):""}${Number(m.valorTotal)>0?` a ${brl(m.valorTotal/m.sacas)}`:" sem valor"}${m.contrato?` · ${esc(m.contrato)}`:""}`).join("<br>"),`${num(x.vSc)} sc`,brC(x.vVal))}
        ${x.resta>0.05?row("Ainda no depósito (Lavoura)","",`${num(x.resta)} sc`,est?"≈ "+brC(est):""):""}
      </div>

      <h3>Atividades <small>${x.ativ.length} · insumos ${brC(x.ins)} (${brl(x.ins/a)}/ha)</small></h3>
      <div class="rlv-ls">${x.ativ.map(linhaAtiv).join("")}</div>

      <h3>Custos diretos <small>${x.dir.length}${x.dir.length?" · "+brC(x.dirT):""}</small></h3>
      ${x.dir.length?`<div class="rlv-ls">${x.dir.map(g=>row(`${brDate(g.d)} · ${esc(g.l.descricao||F_cat(g.l.categoria))}`,esc([g.l.pessoa,F_cat(g.l.categoria),g.como].filter(Boolean).join(" · ")),brl(g.v),"",""," data-rlfin=\""+g.l.id+"\"")).join("")}</div>`:`<p class="note">Nenhuma conta do Financeiro com a cultura ${esc(L.cultura)} ou com o talhão marcado neste período. Frete, secagem, mão de obra da colheita etc.: marque a cultura na conta para entrar aqui.</p>`}

      <h3>Custos gerais rateados <small>${x.ger.length}${x.ger.length?" · "+brC(x.gerT):""}</small></h3>
      <p class="note">Contas sem cultura nem talhão (luz, salários, manutenção, juros, arrendamento…). Cada uma é espalhada pelos 365 dias da safra dela, e esta lavoura fica com os ${x.diasL} dias em que ocupou a terra × ${num(L.area)} ha de ${num(x.totA)} ha da propriedade. Só entra o que já está lançado no Financeiro.</p>
      ${x.ger.length?`<div class="rlv-ls">${x.ger.slice(0,nGer).map(g=>g.arr?row(`${brDate(g.d)} · Arrendamento — ${num(g.arr.sacas)} sc de ${esc(g.arr.cultura)}`,`para ${esc(titNome(g.arr.para||"pai"))} · valor pelo preço médio de venda: ${brl(g.tot)}`,brl(g.v),""):row(`${brDate(g.d)} · ${esc(g.l.descricao||F_cat(g.l.categoria))}`,`${esc([g.l.pessoa,F_cat(g.l.categoria)].filter(Boolean).join(" · "))} · conta de ${brl(g.tot)}`,brl(g.v),"","",` data-rlfin="${g.l.id}"`)).join("")}</div>
        ${x.ger.length>nGer?`<button type="button" class="link" id="rlv-mais">Mostrar todas (${x.ger.length})</button>`:""}`:""}
      <p class="note rlv-rod">Gerado em ${brDate(todayISO())} pelo Diário da Lavoura.</p>
    </div>`;
  }
  const F_cat=k=>window.finApi?.catNome?.(k)||k||"";
  function abre(id){
    const L=lista().find(x=>x.id===id); if(!L) return;
    aberto=id;
    let el=document.getElementById("rlv-tela");
    if(!el){el=document.createElement("div"); el.id="rlv-tela"; el.className="rlv-tela"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); document.body.appendChild(el)}
    el.innerHTML=html(calcula(L)); el.hidden=false; el.scrollTop=0; document.body.classList.add("rlv-aberto");
    el.querySelector("#rlv-volta").onclick=fecha;
    el.querySelector("#rlv-print").onclick=()=>window.print();
    el.querySelectorAll("[data-rlreg]").forEach(d=>{d.classList.add("rlv-click"); d.onclick=()=>{fecha(); editar(d.dataset.rlreg)}});
    el.querySelectorAll("[data-rlfin]").forEach(d=>{d.classList.add("rlv-click"); d.onclick=()=>{fecha(); window.finApi?.abrir(d.dataset.rlfin)}});
    el.querySelector("#rlv-mais")?.addEventListener("click",()=>{verTudo[id]=true; const y=el.scrollTop; abre(id); el.scrollTop=y});
  }
  function fecha(){aberto=null; const el=document.getElementById("rlv-tela"); if(el) el.hidden=true; document.body.classList.remove("rlv-aberto")}
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&aberto) fecha()});
  window.rlAbre=abre; window.rlLista=lista; window.rlCalcula=calcula;
  window.rlIdDe=(cultura,sy)=>nk(cultura)+"_"+sy;

  /* ---------- caixa no Resultado da safra ---------- */
  function caixa(){
    const v=document.getElementById("view-fin_safra"); if(!v) return;
    let box=document.getElementById("rlv-box");
    if(!box){box=document.createElement("div"); box.id="rlv-box"; box.className="pn-card rlv-box"; const k=document.getElementById("rsf-kpis"); (k?k.parentNode:v).insertBefore(box,k?k.nextSibling:null)}
    const ls=lista();
    box.innerHTML=`<h3>Resultado de cada lavoura <small>do manejo antes do plantio até a venda, sem cortar pela safra</small></h3>
      ${ls.length?`<div class="rlv-lista">${ls.map(L=>`<button type="button" class="rlv-it" data-rl="${L.id}"><b>${esc(L.cultura)}</b> <span>${esc(L.talhoes.join(", "))} · ${num(L.area)} ha · plantio ${brDate(L.plantio)}</span><em class="${L.colhida?"ok":L.encerrada?"":"campo"}">${L.colhida?`colhida ${brDate(L.fim)}`:L.encerrada?"encerrada":"no campo"}</em></button>`).join("")}</div>`
        :`<p class="note">Nenhum plantio lançado ainda.</p>`}`;
    box.querySelectorAll("[data-rl]").forEach(b=>b.onclick=()=>abre(b.dataset.rl));
  }
  const agenda=()=>{clearTimeout(agenda.t); agenda.t=setTimeout(()=>{try{if(!document.getElementById("view-fin_safra")?.hidden) caixa(); if(aberto){const el=document.getElementById("rlv-tela"), y=el?.scrollTop||0; abre(aberto); if(el) el.scrollTop=y}}catch(e){console.error(e)}},200)};
  if(typeof show==="function"){const o=show; window.show=show=function(v){const r=o.apply(this,arguments); if(v==="fin_safra") setTimeout(caixa,50); return r}}
  window.rlAgenda=agenda;
  const oLista=renderLista; renderLista=function(){const r=oLista.apply(this,arguments); agenda(); return r};
})();
