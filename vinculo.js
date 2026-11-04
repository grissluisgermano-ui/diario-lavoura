/* Diário da Lavoura — vínculo das atividades com o estoque.
   - Na atividade (Lançar): produto fora do estoque ganha "Cadastrar no estoque" (produto + compra ali mesmo);
     produto do estoque sem saldo suficiente NA DATA da atividade mostra quanto falta e "Lançar compra". Salva mesmo assim
     (avisa no primeiro toque em Salvar).
   - No Estoque → Produtos: caixa "Conferir estoque" com (a) nomes de produto soltos em atividades já lançadas, para vincular
     a um produto do estoque, cadastrar como novo ou marcar "não controlar"; (b) produtos que ficaram negativos em alguma data
     (usados antes da compra), com "Lançar compra".
   config/estoque {ignorados:[nomeNormalizado]} */
(function(){
"use strict";
let ignorados=new Set(), avisou="";
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const unDe=u=>/^(L|mL)\//.test(u)?"L":/^(kg|g|t)\//.test(u)?"kg":u==="sc/ha"?"sc":u==="un/ha"?"un":"kg";
const classeDe=t=>t==="plantio"?"Semente":t==="adubacao"?"Fertilizante":"";
const doseN=p=>typeof p.dose==="number"?p.dose:parseNum(p.dose);
const ehDoEstoque=(p,e)=>p.produtoId===e.id||(!p.produtoId&&norm(p.nome)===norm(e.comercial));

/* Saldo de um produto ao fim de uma data (entradas até a data − usos executados até a data), sem contar um registro */
function saldoNaData(e,data,semId){
  let s=(e.entradas||[]).filter(x=>!x.data||x.data<=data).reduce((t,x)=>t+(Number(x.quantidade)||0),0);
  for(const r of registros){ if(r.id===semId||ehProg(r)||r.data>data) continue;
    for(const p of r.campos?.produtos||[]){ if(!ehDoEstoque(p,e)) continue;
      const f=FATOR[e.unidade]?.[p.unidade], d=doseN(p); if(f!=null&&d>0) s-=d*f*areaTotal(r) } }
  return s;
}
/* Primeira data em que o saldo ficou negativo (usado antes de comprar) e o maior buraco */
function negativo(e){
  const ev=[];
  for(const x of e.entradas||[]) ev.push({d:x.data||"0000",q:Number(x.quantidade)||0,o:0});
  for(const r of registros){ if(ehProg(r)) continue;
    for(const p of r.campos?.produtos||[]){ if(!ehDoEstoque(p,e)) continue;
      const f=FATOR[e.unidade]?.[p.unidade], d=doseN(p); if(f!=null&&d>0) ev.push({d:r.data,q:-d*f*areaTotal(r),o:1}) } }
  ev.sort((a,b)=>a.d.localeCompare(b.d)||a.o-b.o);
  let s=0,min=0,prim=null;
  for(const x of ev){ s+=x.q; if(s<-0.0001){ if(!prim) prim=x.d; if(s<min) min=s } }
  return prim?{data:prim,falta:-min}:null;
}

/* ---------- Na atividade ---------- */
const orig=atualizaSaldos;
atualizaSaldos=function(){
  orig.apply(this,arguments);
  const data=$("#f-data")?.value||todayISO(), exec=situacao!=="programada", area=areaForm();
  document.querySelectorAll("#prods .prod").forEach(r=>{
    const el=r.querySelector(".p-saldo"), nome=r.querySelector(".p-nome").value.trim(); if(!el) return;
    el.querySelectorAll(".vq-bt,.vq-falta").forEach(x=>x.remove());
    if(!nome){fecha(r);return}
    const e=prodEstoque(nome);
    if(!e){
      if(ignorados.has(norm(nome))){el.textContent="Não controlado no estoque";el.classList.remove("neg");return}
      el.textContent="Fora do estoque"; el.classList.add("neg");
      el.append(botao("Cadastrar no estoque",()=>abre(r,null)));
      return;
    }
    if(!exec) return;
    const f=FATOR[e.unidade]?.[r.querySelector(".p-un").value], d=parseNum(r.querySelector(".p-dose").value);
    if(f==null||!(d>0)||!(area>0)) return;
    const precisa=d*f*area, tem=saldoNaData(e,data,editing);
    if(precisa>tem+0.0001){
      el.classList.add("neg");
      const s=document.createElement("span"); s.className="vq-falta";
      s.textContent=data>=todayISO()?` · falta ${num(precisa-Math.max(tem,0))} ${e.unidade} para esta atividade`:` · em ${brDate(data).slice(0,5)} tinha ${num(Math.max(tem,0))} ${e.unidade}; falta ${num(precisa-Math.max(tem,0))} ${e.unidade}`;
      el.append(s, botao("Lançar compra",()=>abre(r,e)));
    }
  });
  agenda();
};
function botao(txt,fn){const b=document.createElement("button"); b.type="button"; b.className="link vq-bt"; b.textContent=txt; b.onclick=fn; return b}
function fecha(r){r.querySelector(".vq")?.remove()}

/* Mini-formulário: produto novo (e=null) ou compra de um produto existente.
   ctx: {linha} na atividade ou {solto, regs} na conferência */
function miniForm(e,nome,unidade,data,qtdObrig){
  const id="vq"+Math.random().toString(36).slice(2,7);
  return `<div class="vq" data-vq="${id}">
    <b class="vq-tit">${e?`Lançar compra de ${esc(e.comercial)}`:"Cadastrar produto no estoque"}</b>
    <div class="grid2">
      ${e?"":`<div class="field"><label for="${id}-n">Nome comercial</label><input id="${id}-n" class="vq-n" value="${esc(nome)}"></div>
      <div class="field"><label for="${id}-c">Classe</label><select id="${id}-c" class="vq-c"><option value="">—</option>${CLASSES.map(c=>`<option${c===classeDe(tipo)?" selected":""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label for="${id}-u">Unidade do estoque</label><select id="${id}-u" class="vq-u">${[["L","Litro (L)"],["kg","Quilo (kg)"],["sc","Saco (sc)"],["un","Unidade (un)"]].map(([v,l])=>`<option value="${v}"${v===unidade?" selected":""}>${l}</option>`).join("")}</select></div>`}
      <div class="field"><label for="${id}-q">Quantidade comprada${qtdObrig?"":" (opcional)"}</label><input id="${id}-q" class="vq-q" inputmode="decimal" placeholder="0"></div>
      <div class="field"><label for="${id}-v">Valor total (R$, opcional)</label><input id="${id}-v" class="vq-v" inputmode="decimal" placeholder="0,00"></div>
      <div class="field"><label for="${id}-d">Data da compra</label><input id="${id}-d" class="vq-d" type="date" value="${esc(data||todayISO())}"></div>
      <div class="field"><label for="${id}-o">Onde comprou</label><input id="${id}-o" class="vq-o" list="dl-orig" placeholder="Ex.: Coamo"></div>
    </div>
    <div class="row"><button type="button" class="btn fn-mini vq-ok">${e?"Lançar compra":"Cadastrar"}</button><button type="button" class="link vq-x">Cancelar</button><span class="note vq-st" role="status"></span></div>
  </div>`;
}
async function gravaMini(box,e,qtdObrig){
  const st=box.querySelector(".vq-st"), q=parseNum(box.querySelector(".vq-q").value), v=parseNum(box.querySelector(".vq-v").value);
  if(qtdObrig&&!(q>0)){st.textContent="Informe a quantidade.";box.querySelector(".vq-q").focus();return null}
  const entrada=q>0?{data:box.querySelector(".vq-d").value||todayISO(),quantidade:q,valorTotal:v>0?v:null}:null;
  const o=box.querySelector(".vq-o").value.trim(); if(entrada&&o) entrada.origem=o;
  if(!db){st.textContent="Sem conexão com o banco de dados.";return null}
  box.querySelector(".vq-ok").disabled=true;
  try{
    if(e){const {id,...doc}=e; doc.entradas=[...(e.entradas||[]),entrada]; await db.collection("estoque").doc(id).set(doc); return {id,comercial:e.comercial}}
    const comercial=box.querySelector(".vq-n").value.trim(); if(!comercial){st.textContent="Informe o nome.";return null}
    const ja=prodEstoque(comercial);
    if(ja){ if(entrada){const {id,...doc}=ja; doc.entradas=[...(ja.entradas||[]),entrada]; await db.collection("estoque").doc(id).set(doc)} return {id:ja.id,comercial:ja.comercial} }
    const r=await db.collection("estoque").add({comercial,generico:"",classe:box.querySelector(".vq-c").value||"",unidade:box.querySelector(".vq-u").value,entradas:entrada?[entrada]:[],criadoEm:new Date().toISOString()});
    return {id:r?.id,comercial};
  }catch{st.textContent="Não foi possível salvar. Tente de novo.";return null}
  finally{const b=box.querySelector(".vq-ok"); if(b) b.disabled=false}
}
function abre(r,e){
  if(r.querySelector(".vq")){fecha(r);return}
  const nome=r.querySelector(".p-nome").value.trim();
  r.insertAdjacentHTML("beforeend",miniForm(e,nome,unDe(r.querySelector(".p-un").value),$("#f-data").value,true));
  const box=r.querySelector(".vq");
  for(const t of ["input","change","keydown","click"]) box.addEventListener(t,ev=>{ev.stopPropagation(); if(t==="keydown"&&ev.key==="Enter"&&ev.target.tagName==="INPUT"){ev.preventDefault(); box.querySelector(".vq-ok").click()}}); // não mexer na lista de produtos
  box.querySelector(".vq-x").onclick=()=>fecha(r);
  box.querySelector(".vq-ok").onclick=async()=>{
    const res=await gravaMini(box,e,true); if(!res) return;
    r.querySelector(".p-nome").value=res.comercial; fecha(r);
    flash(e?`Compra lançada em ${res.comercial}.`:`${res.comercial} cadastrado no estoque.`);
  };
  (box.querySelector(".vq-q")||box).focus?.();
}
/* Primeiro toque em Salvar: avisa o que está fora do estoque ou sem saldo */
$("#view-lancar").addEventListener("submit",ev=>{
  if(!TIPOS[tipo]?.prods) return;
  const fora=[...document.querySelectorAll("#prods .prod")].map(r=>r.querySelector(".p-nome").value.trim()).filter(n=>n&&!prodEstoque(n)&&!ignorados.has(norm(n)));
  const falta=[...document.querySelectorAll("#prods .vq-falta")].length;
  if(!fora.length&&!falta){avisou="";return}
  const chave=fora.join("|")+"#"+falta;
  if(avisou===chave){avisou="";return}
  avisou=chave; ev.preventDefault(); ev.stopImmediatePropagation();
  flash(fora.length?`${fora.length===1?"“"+fora[0]+"” está":fora.length+" produtos estão"} fora do estoque. Cadastre, ou toque em Salvar de novo para salvar assim.`
    :"Falta saldo no estoque nesta data. Lance a compra, ou toque em Salvar de novo para salvar assim.");
},true);

/* ---------- Conferência (Estoque → Produtos) ---------- */
function soltos(){
  const m=new Map();
  for(const r of registros) for(const p of r.campos?.produtos||[]){
    if(!p.nome||p.produtoId&&estoque.some(e=>e.id===p.produtoId)) continue;
    if(prodEstoque(p.nome)) continue;
    const k=norm(p.nome); if(!k||ignorados.has(k)) continue;
    const g=m.get(k)||{k,nome:p.nome,regs:new Set(),uns:new Set()}; g.regs.add(r.id); g.uns.add(p.unidade); m.set(k,g);
  }
  return [...m.values()].sort((a,b)=>b.regs.size-a.regs.size);
}
function sugestoes(g){
  const k=g.k, ws=k.split(" ").filter(w=>w.length>3);
  return estoque.map(e=>{const c=norm(e.comercial), gn=norm(e.generico);
    const pts=(c===k?10:0)+(c.includes(k)||k.includes(c)?5:0)+(gn&&(gn.includes(k)||k.includes(gn))?4:0)+ws.filter(w=>c.includes(w)||gn.includes(w)).length;
    return {e,pts}}).sort((a,b)=>b.pts-a.pts||a.e.comercial.localeCompare(b.e.comercial,"pt-BR"));
}
function render(){
  const box=$("#vc-box"); if(!box) return;
  const ss=soltos(), ng=estoque.map(e=>({e,n:negativo(e)})).filter(x=>x.n).sort((a,b)=>a.n.data.localeCompare(b.n.data));
  window.marca?.("estoque:conf",ss.length+ng.length);
  const n=document.getElementById("es-conf-n"); if(n){n.hidden=!(ss.length+ng.length); n.textContent=ss.length+ng.length}
  if(!ss.length&&!ng.length){box.hidden=true;box.innerHTML="";return}
  const aberto=box.querySelector("details")?.open??true;
  box.hidden=false;
  box.innerHTML=`<details${aberto?" open":""}><summary><b>Conferir estoque</b> <span class="bdg">${ss.length+ng.length}</span></summary>
    <p class="note">Para o saldo e o custo ficarem certos, todo produto usado nas atividades precisa estar no estoque, com a compra lançada antes do uso.</p>
    ${ss.length?`<h4 class="vc-h">Produtos digitados que não estão no estoque</h4>${ss.map(g=>{const sg=sugestoes(g), best=sg[0]?.pts>=4?sg[0].e.id:"";
      return `<div class="vc-it" data-k="${esc(g.k)}">
        <div><b>${esc(g.nome)}</b><small>em ${g.regs.size} atividade${g.regs.size>1?"s":""} · ${esc([...g.uns].join(", "))}</small></div>
        <div class="vc-acao"><select aria-label="Produto do estoque para ${esc(g.nome)}"><option value="">Escolha o produto do estoque…</option>${sg.map(({e})=>`<option value="${e.id}"${e.id===best?" selected":""}>${esc(e.comercial)}${e.generico?" · "+esc(e.generico):""}</option>`).join("")}<option value="__novo">+ Cadastrar como produto novo</option><option value="__ign">Não controlar no estoque</option></select>
          <button type="button" class="btn fn-mini vc-ok">Vincular</button></div>
      </div>`}).join("")}`:""}
    ${ng.length?`<h4 class="vc-h">Usados antes de ter compra lançada</h4>${ng.map(({e,n})=>`<div class="vc-it">
        <div><b>${esc(e.comercial)}</b><small>a partir de ${brDate(n.data)} faltou até ${num(n.falta)} ${e.unidade}</small></div>
        <div class="vc-acao"><button type="button" class="btn ghost fn-mini" data-vccompra="${e.id}" data-d="${n.data}" data-q="${n.falta}">Lançar compra</button></div>
      </div>`).join("")}`:""}
  </details>`;
  box.querySelectorAll(".vc-it[data-k]").forEach(it=>{
    const g=ss.find(x=>x.k===it.dataset.k), sel=it.querySelector("select"), ok=it.querySelector(".vc-ok");
    const muda=()=>{ok.textContent=sel.value==="__novo"?"Cadastrar":sel.value==="__ign"?"Confirmar":"Vincular"; it.querySelector(".vq")?.remove();
      if(sel.value==="__novo"){it.insertAdjacentHTML("beforeend",miniForm(null,g.nome,unDe([...g.uns][0]||""),primeiraData(g),false)); it.querySelector(".vq-ok").hidden=true; it.querySelector(".vq-x").onclick=()=>{sel.value="";muda()}}};
    sel.onchange=muda; muda();
    ok.onclick=async()=>{
      if(!sel.value){sel.focus();return}
      ok.disabled=true;
      try{
        if(sel.value==="__ign"){ignorados.add(g.k); await db.collection("config").doc("estoque").set({ignorados:[...ignorados]}); return}
        let alvo=estoque.find(e=>e.id===sel.value);
        if(sel.value==="__novo"){const res=await gravaMini(it.querySelector(".vq"),null,false); if(!res) return; alvo={id:res.id,comercial:res.comercial}}
        await vincular(g,alvo);
      }finally{ok.disabled=false}
    };
  });
  box.querySelectorAll("[data-vccompra]").forEach(b=>b.onclick=()=>{
    const e=estoque.find(x=>x.id===b.dataset.vccompra); if(!e) return;
    window.esAba?.("entrada"); esReset?.(); $("#es-com").value=e.comercial; esSync(); $("#es-data").value=b.dataset.d; $("#es-qtd").value=String(Math.ceil(Number(b.dataset.q))).replace(".",",");
    $("#es-form").scrollIntoView({block:"start",behavior:"smooth"}); $("#es-vt").focus({preventScroll:true});
  });
}
const primeiraData=g=>registros.filter(r=>g.regs.has(r.id)).map(r=>r.data).sort()[0]||todayISO();
async function vincular(g,alvo){
  for(const r of registros.filter(x=>g.regs.has(x.id))){
    const {id,...doc}=r, ps=doc.campos?.produtos||[];
    custoAnterior={};
    for(const p of ps) if(p.custoUnit!=null){const k=p.produtoId||prodEstoque(p.nome)?.id||String(p.nome).toLowerCase(); custoAnterior[k]={custoUnit:p.custoUnit,unidadeEst:p.unidadeEst,custoUnitLiq:p.custoUnitLiq}}
    const novos=ps.map(p=>norm(p.nome)===g.k&&!(p.produtoId&&estoque.some(e=>e.id===p.produtoId))?(({custoUnit,unidadeEst,custoHa,custoUnitLiq,custoHaLiq,...q})=>({...q,nome:alvo.comercial,produtoId:alvo.id}))(p):p);
    const c=custosDoRegistro(novos,areaTotal(r));
    doc.campos={...doc.campos,produtos:c.ps}; doc.custoHa=c.custoHa; doc.custoTotal=c.custoTotal; doc.semCusto=c.semCusto; if(c.custoHaLiq!=null){doc.custoHaLiq=c.custoHaLiq;doc.custoTotalLiq=c.custoTotalLiq}else{delete doc.custoHaLiq;delete doc.custoTotalLiq};
    await col.doc(id).set(doc);
  }
  custoAnterior={};
}
const agenda=()=>{clearTimeout(agenda.t); agenda.t=setTimeout(()=>{try{render()}catch(e){console.error(e)}},150)};
function instala(){
  if($("#vc-box")) return;
  const p=document.querySelector('#view-estoque [data-pane="produtos"]'); if(!p) return;
  const d=document.createElement("div"); d.id="vc-box"; d.className="vc-box"; d.hidden=true; p.prepend(d);
}
window.vcConfig=()=>({ignorados:[...ignorados]});
window.vcInicia=function(){
  if(window.vcInicia.ok||!db) return; window.vcInicia.ok=true;
  db.collection("config").doc("estoque").onSnapshot(s=>{ignorados=new Set((s.exists&&s.data()?.ignorados)||[]); atualizaSaldos(); agenda()},()=>{});
};
instala(); agenda();
if(typeof col!=="undefined"&&col) window.vcInicia();
})();
