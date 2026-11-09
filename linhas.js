/* Listas em linhas (como o Estoque): cada cartão vira uma linha curta com o essencial;
   tocar abre o cartão completo logo abaixo. Funciona depois que cada tela desenha a lista
   (MutationObserver), sem mexer no código de cada tela: os botões e eventos continuam os mesmos. */
(function(){
  const T=(el)=>el?el.textContent.replace(/\s+/g," ").trim():"";
  const abertos=new Set();
  const cl=(el)=>el?el.cloneNode(true).outerHTML:"";
  // o que vai na linha de cada lista: título, linha de baixo, à direita (valor/situação) e miniatura
  const LISTAS={
    "lista":   a=>({tit:T(a.querySelector(".rec-tipo")), sub:[T(a.querySelector(".rec-periodo")),T(a.querySelector(".rec-talhoes"))].filter(Boolean).join(" · "), dir:cl(a.querySelector(".st-pill"))}),
    "pg-lista":a=>({tit:T(a.querySelector(".rec-tipo")), sub:[T(a.querySelector(".rec-periodo")),T(a.querySelector(".rec-talhoes"))].filter(Boolean).join(" · "), dir:cl(a.querySelector(".st-pill"))}),
    "fn-lista":a=>{const tops=a.querySelectorAll(":scope>.rec-top"), quem=[...a.querySelectorAll(".rec-campos>span")].find(s=>/^(Fornecedor|Comprador)/.test(T(s)));
      return {tit:T(tops[0]?.querySelector(".rec-tipo")), sub:[T(quem).replace(/^(Fornecedor|Comprador)\s*/,""),T(tops[1]?.querySelector(".note"))].filter(Boolean).join(" · ")||T(tops[1]?.firstElementChild), dir:cl(tops[0]?.querySelector(".mov-q"))+cl(tops[1]?.querySelector(".pill"))}},
    "fn-pend": a=>({tit:T(a.querySelector(".rec-tipo")), sub:T(a.querySelector(".rec-campos")).replace(/\s{2,}/g," · "), dir:cl(a.querySelector(".mov-q"))}),
    "mq-cards":a=>({tit:T(a.querySelector(".pc-nome")), sub:T(a.querySelector(".pc-gen")), dir:`<b class="lx-num">${T(a.querySelector(".pc-saldo b"))}</b><small>${T(a.querySelector(".pc-saldo span"))}</small>`, img:a.querySelector(".ax-capa img")?.getAttribute("src")}),
    "bf-cards":a=>({tit:T(a.querySelector(".pc-nome")), sub:T(a.querySelector(".pc-gen")), dir:`<b class="lx-num">${T(a.querySelector(".pc-saldo b"))}</b><small>${T(a.querySelector(".pc-saldo span"))}</small>`, img:a.querySelector(".ax-capa img")?.getAttribute("src")}),
    "nt-lista":a=>({tit:T(a.querySelector(".nt-tit"))||T(a.querySelector(".rec-desc")).slice(0,80), sub:[T(a.querySelector(".nt-cat")),T(a.querySelector(".rec-top .rec-talhoes"))].filter(Boolean).join(" · "), dir:cl(a.querySelector(".pill"))}),
  };
  function vira(cont,id){
    const arts=id==="lista"?cont.querySelectorAll(".day>article"):cont.querySelectorAll(":scope>article");
    for(const a of arts){
      if(a.classList.contains("lx")) continue;
      const r=LISTAS[id](a); if(!r.tit) continue;
      const k=id+"|"+r.tit+"|"+r.sub;
      const det=document.createElement("div"); det.className="lx-det";
      while(a.firstChild) det.appendChild(a.firstChild);
      const b=document.createElement("button"); b.type="button"; b.className="lx-lin"+(r.img?" c-img":"");
      b.innerHTML=`${r.img?`<img class="lx-img" src="${r.img}" alt="">`:""}<span class="lx-txt"><b>${esc(r.tit)}</b>${r.sub?`<small>${esc(r.sub)}</small>`:""}</span><span class="lx-dir">${r.dir||""}</span><span class="lx-seta" aria-hidden="true">›</span>`;
      // formulário de edição aberto dentro do cartão: já abre
      if(det.querySelector(".pt-form,.ent-ed,.fn-baixa:not([hidden])")) abertos.add(k);
      const abre=v=>{a.classList.toggle("open",v); b.setAttribute("aria-expanded",v); v?abertos.add(k):abertos.delete(k)};
      b.onclick=()=>abre(!a.classList.contains("open"));
      a.classList.add("lx"); a.prepend(b); a.append(det); abre(abertos.has(k));
    }
  }
  const ligados=new Map();
  function liga(){
    for(const id of Object.keys(LISTAS)){
      const c=document.getElementById(id); if(!c||ligados.get(id)===c) continue;
      ligados.set(id,c); vira(c,id);
      new MutationObserver(()=>vira(c,id)).observe(c,{childList:true,subtree:id==="lista"});
    }
  }
  liga(); document.addEventListener("ponte:pronto",liga);
  // alguém abriu a baixa (Pagar) ou um formulário por código: abre a linha
  document.addEventListener("click",e=>{const a=e.target.closest("article.lx:not(.open)"); if(a&&!e.target.closest(".lx-lin")) a.classList.add("open")},true);
})();
