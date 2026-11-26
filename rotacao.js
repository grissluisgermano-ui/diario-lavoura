/* Diário da Lavoura — histórico da área / rotação de culturas (v112)
   Para cada talhão, o que foi plantado em cada safra: vem dos plantios executados (registros) e das
   anotações de safras passadas (config/rotacao {itens:[{id, talhao, safra (ano de início), epoca, cultura, cultivar, area, prod, obs}]}),
   para as safras de antes do app.
   - Painel → Talhões hoje: linha discreta "Rotação: 24/25 Soja → Trigo · 25/26 Soja → Aveia (cobertura)" (window.rotLinha).
   - Tela do talhão: caixa "Histórico da área (rotação de culturas)" com todas as safras, e "+ Anotar safra passada" (window.rotBloco / rotLiga). */
(function(){
  let itens=[], pronto=false, form=null; // form = {t, id|null}
  const EPOCAS=[["verao","Verão"],["safrinha","Safrinha"],["inverno","Inverno"],["cobertura","Cobertura"]];
  const sem=x=>String(x||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
  const COB=/aveia|nabo|braqui|brachi|centeio|ervilhaca|crotal|milheto|mourisco|tremo|azevem|cobertura|\bmix\b/;
  const haDe=t=>Number((typeof propCfg!=="undefined"?propCfg.talhoes:[]).find(x=>x.n===t)?.ha)||0;
  const tem=(r,t)=>(r.talhoes||[]).includes(t);
  const epocaDe=d=>{const m=Number(String(d).slice(5,7)); return m>=7&&m<=12?0:m<=3?1:2};
  const sfReg=r=>typeof safraReg==="function"?safraReg(r):safraDe(r.data);

  // produtividade da colheita que fecha o plantio p no talhão t (sc/ha)
  function prodDe(p,t){
    const kc=sem(p.campos?.cultura);
    const c=registros.filter(r=>r.tipo==="colheita"&&!ehProg(r)&&tem(r,t)&&r.data>=p.data&&(!sem(r.campos?.cultura)||sem(r.campos.cultura)===kc)).sort((a,b)=>a.data.localeCompare(b.data))[0];
    if(!c) return null;
    const sc=(c.romaneios||[]).reduce((a,x)=>a+(Number(x.sacas)||0),0), ar=Object.values(c.areas||{}).reduce((a,b)=>a+(Number(b)||0),0);
    if(sc>0&&ar>0) return {prod:sc/ar,colheita:c.data};
    return Number(c.campos?.produtividade)>0?{prod:Number(c.campos.produtividade),colheita:c.data}:{prod:null,colheita:c.data};
  }

  // Map safra → [{cultura, cultivares[], area, prod, cob, ep, manual, id, obs}]
  function historico(t){
    const m=new Map(), add=(sy,x)=>{(m.get(sy)||m.set(sy,[]).get(sy)).push(x)};
    const ha=haDe(t);
    const ps=registros.filter(r=>r.tipo==="plantio"&&!ehProg(r)&&tem(r,t)).sort((a,b)=>a.data.localeCompare(b.data));
    const grp=new Map(); // safra|cultura → junta as variedades
    for(const p of ps){
      const sy=sfReg(p), cu=p.campos?.cultura||"Sem cultura", k=sy+"|"+sem(cu);
      let g=grp.get(k);
      if(!g){g={sy,cultura:cu,cultivares:[],area:0,data:p.data,ep:epocaDe(p.data),cob:COB.test(sem(cu)),prods:[]}; grp.set(k,g)}
      if(p.campos?.cultivar&&!g.cultivares.includes(p.campos.cultivar)) g.cultivares.push(p.campos.cultivar);
      g.area+=Number(p.areas?.[t])||ha;
      const pr=prodDe(p,t); if(pr) g.prods.push(pr);
    }
    for(const g of grp.values()){
      const v=g.prods.filter(x=>x.prod>0);
      add(g.sy,{sy:g.sy,cultura:g.cultura,cultivares:g.cultivares,area:Math.min(g.area,ha||g.area),prod:v.length?v.reduce((a,x)=>a+x.prod,0)/v.length:null,
        colhida:g.prods.length>0,cob:g.cob&&!g.prods.length,ep:g.cob&&!g.prods.length?3:g.ep,data:g.data});
    }
    for(const x of itens) if(x.talhao===t&&Number.isFinite(Number(x.safra))){
      const ep=Math.max(0,EPOCAS.findIndex(e=>e[0]===x.epoca));
      add(Number(x.safra),{cultura:x.cultura||"Sem cultura",cultivares:x.cultivar?[x.cultivar]:[],area:Number(x.area)||null,prod:Number(x.prod)>0?Number(x.prod):null,
        cob:x.epoca==="cobertura",ep,manual:true,id:x.id,obs:x.obs||""});
    }
    for(const l of m.values()) l.sort((a,b)=>a.ep-b.ep||String(a.data||"").localeCompare(String(b.data||"")));
    return m;
  }
  const nomeC=x=>`${esc(x.cultura)}${x.cob?` <small>(cobertura)</small>`:""}`;

  // linha discreta no cartão do Painel: as 3 safras antes da atual
  window.rotLinha=t=>{
    const h=historico(t), cur=safraDe(todayISO());
    const sys=[...h.keys()].filter(y=>y<cur).sort((a,b)=>a-b).slice(-3);
    if(!sys.length) return "";
    return `<small class="ci-sub ci-rot" title="Histórico da área">↻ ${sys.map(y=>`<b>${safraLab(y)}</b> ${h.get(y).map(nomeC).join(" → ")}`).join(" · ")}</small>`;
  };

  function formHtml(t,x){
    const cur=safraDe(todayISO()), anos=[]; for(let y=cur;y>=cur-15;y--) anos.push(y);
    const cs=[...new Set([...(typeof propCfg!=="undefined"?propCfg.culturas||[]:[]),"Soja","Milho","Trigo","Feijão","Aveia","Cevada","Nabo","Braquiária"])];
    return `<div class="rot-form" data-rotf="${esc(t)}">
      <div class="rot-g">
        <label>Safra<select class="rot-sy">${anos.map(y=>`<option value="${y}"${(x?Number(x.safra):cur-1)===y?" selected":""}>${safraLab(y)}</option>`).join("")}</select></label>
        <label>Época<select class="rot-ep">${EPOCAS.map(([k,l])=>`<option value="${k}"${(x?.epoca||"verao")===k?" selected":""}>${l}</option>`).join("")}</select></label>
        <label>Cultura<input class="rot-cu" list="rot-dl" value="${esc(x?.cultura||"")}" placeholder="Soja, milho, aveia…"></label>
        <label>Variedade <small>(opcional)</small><input class="rot-cv" value="${esc(x?.cultivar||"")}"></label>
        <label>Área (ha)<input class="rot-ar" type="number" step="0.1" inputmode="decimal" value="${x?.area??haDe(t)}"></label>
        <label>Produtividade <small>(sc/ha, opcional)</small><input class="rot-pr" type="number" step="0.1" inputmode="decimal" value="${x?.prod??""}"></label>
      </div>
      <label>Observação <small>(opcional)</small><input class="rot-ob" value="${esc(x?.obs||"")}" placeholder="Ex.: granizo, replantio, palhada fraca…"></label>
      <datalist id="rot-dl">${cs.map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
      <div class="rot-bts"><button type="button" class="btn fn-mini" data-rotok>${x?"Salvar":"Anotar"}</button><button type="button" class="link" data-rotx>Cancelar</button>${x?`<button type="button" class="link danger" data-rotdel="${x.id}">Excluir</button>`:""}</div>
    </div>`;
  }

  // caixa na tela do talhão
  window.rotBloco=t=>{
    const h=historico(t), sys=[...h.keys()].sort((a,b)=>b-a), cur=safraDe(todayISO());
    const ed=form&&form.t===t?form:null, xEd=ed?.id?itens.find(i=>i.id===ed.id):null;
    const linha=x=>`<li class="rot-it${x.cob?" rot-cob":""}"><span class="rot-c">${nomeC(x)}${x.cultivares.length?` · ${esc(x.cultivares.join(", "))}`:""}</span><span class="rot-n">${x.area?`${num(x.area)} ha`:""}${x.prod?` · ${num(Math.round(x.prod*10)/10)} sc/ha`:x.colhida===false&&!x.cob&&!x.manual?" · ainda no campo":""}${x.obs?` · ${esc(x.obs)}`:""}${x.manual?` <button type="button" class="link rot-ed" data-roted="${x.id}" aria-label="Editar anotação">editar</button>`:""}${!x.manual&&window.rlAbre?` <button type="button" class="link rot-ed" data-rlab="${window.rlIdDe(x.cultura,x.sy)}">resultado</button>`:""}</span></li>`;
    return `<details class="rot-box"${ed||rotAberto.has(t)?" open":""} data-rott="${esc(t)}">
      <summary>Histórico da área <small>rotação de culturas${sys.length?` · ${sys.length} safra${sys.length===1?"":"s"}`:""}</small></summary>
      ${sys.length?`<ul class="rot-l">${sys.map(y=>`<li class="rot-sf"><b>${safraLab(y)}${y===cur?" <small>(atual)</small>":""}</b><ul>${h.get(y).map(linha).join("")}</ul></li>`).join("")}</ul>`
        :`<p class="note">Nada lançado ainda. Anote as culturas das safras de antes do app para ver a rotação do talhão.</p>`}
      ${ed?formHtml(t,xEd):`<button type="button" class="link" data-rotnova="${esc(t)}">+ Anotar safra passada</button>`}
      <p class="note rot-nota">As safras com plantio lançado no app aparecem sozinhas. Anote aqui só as de antes.</p>
    </details>`;
  };
  const rotAberto=new Set();
  window.rotLiga=(el,redesenha)=>{
    el.querySelectorAll("details.rot-box").forEach(d=>d.addEventListener("toggle",()=>{d.open?rotAberto.add(d.dataset.rott):rotAberto.delete(d.dataset.rott)}));
    el.querySelectorAll("[data-rotnova]").forEach(b=>b.onclick=()=>{form={t:b.dataset.rotnova,id:null}; rotAberto.add(form.t); redesenha(); el.querySelector(".rot-cu")?.focus()});
    el.querySelectorAll("[data-roted]").forEach(b=>b.onclick=()=>{const x=itens.find(i=>i.id===b.dataset.roted); if(!x) return; form={t:x.talhao,id:x.id}; redesenha()});
    el.querySelectorAll("[data-rlab]").forEach(b=>b.onclick=()=>window.rlAbre?.(b.dataset.rlab));
    el.querySelectorAll("[data-rotx]").forEach(b=>b.onclick=()=>{form=null; redesenha()});
    el.querySelectorAll("[data-rotdel]").forEach(b=>b.onclick=async()=>{
      if(!b.dataset.conf){b.dataset.conf=1; b.textContent="Toque de novo para excluir"; return}
      const novos=itens.filter(i=>i.id!==b.dataset.rotdel); form=null;
      try{await grava(novos); window.ponte?.aviso?.("Anotação excluída.",true)}catch{}
    });
    el.querySelectorAll("[data-rotok]").forEach(b=>b.onclick=async()=>{
      const f=b.closest(".rot-form"), g=s=>f.querySelector(s).value.trim(), t=f.dataset.rotf;
      const cu=g(".rot-cu"); if(!cu){f.querySelector(".rot-cu").focus(); f.querySelector(".rot-cu").setCustomValidity("Informe a cultura."); f.querySelector(".rot-cu").reportValidity(); return}
      const x={id:form?.id||("r"+Date.now().toString(36)),talhao:t,safra:Number(g(".rot-sy")),epoca:g(".rot-ep"),cultura:cu[0].toUpperCase()+cu.slice(1),cultivar:g(".rot-cv"),
        area:Number(g(".rot-ar").replace(",","."))||null,prod:Number(g(".rot-pr").replace(",","."))||null,obs:g(".rot-ob"),em:new Date().toISOString()};
      const novos=form?.id?itens.map(i=>i.id===x.id?x:i):[...itens,x];
      b.disabled=true; form=null;
      try{await grava(novos); window.ponte?.aviso?.(`${x.cultura} anotada na safra ${safraLab(x.safra)}.`,true)}catch{b.disabled=false}
    });
  };
  async function grava(novos){itens=novos; redesenhaTudo(); await db.collection("config").doc("rotacao").set({itens:novos})}
  const redesenhaTudo=()=>{try{window.ciAgenda?.()}catch{}};

  // backup, planilha, Perguntar
  window.rotConfig=()=>pronto&&itens.length?{itens}:null;
  window.rotPlanilha=add=>{
    const linhas=[];
    for(const t of TALHOES.map(x=>x.n)){const h=historico(t); for(const y of [...h.keys()].sort((a,b)=>a-b)) for(const x of h.get(y))
      linhas.push({"Talhão":t,"Safra":safraLab(y),"Época":x.cob?"Cobertura":EPOCAS[x.ep]?.[1]||"","Cultura":x.cultura,"Variedade":x.cultivares.join(", "),"Área (ha)":x.area??"","Produtividade (sc/ha)":x.prod?Math.round(x.prod*10)/10:"","Origem":x.manual?"Anotado":"Plantio lançado","Observação":x.obs||""})}
    add("Rotação",linhas);
  };
  window.rotTexto=()=>{
    const ls=[];
    for(const t of TALHOES.map(x=>x.n)){const h=historico(t), sys=[...h.keys()].sort((a,b)=>a-b); if(!sys.length) continue;
      ls.push(`${t}: `+sys.map(y=>`${safraLab(y)} ${h.get(y).map(x=>x.cultura+(x.cob?" (cobertura)":"")+(x.cultivares.length?" "+x.cultivares.join("/"):"")+(x.prod?` ${Math.round(x.prod*10)/10} sc/ha`:"")).join(" → ")}`).join("; "))}
    return ls.length?"\n\nHistórico da área / rotação de culturas por talhão (safra: culturas na ordem do ano):\n"+ls.join("\n"):"";
  };
  window.rotHistorico=historico;

  window.rotInicia=function(){
    if(window.rotInicia.ok||typeof db==="undefined"||!db) return; window.rotInicia.ok=true;
    db.collection("config").doc("rotacao").onSnapshot(d=>{const x=d.exists?d.data():null; itens=Array.isArray(x?.itens)?x.itens:[]; pronto=true; redesenhaTudo()},()=>{});
  };
  if(typeof col!=="undefined"&&col) window.rotInicia();
})();
