/* Diário da Lavoura — "🧹 Limpar formulário" em todos os lançamentos e botão ↻ de recarregar (limpar.js).
   Começou um lançamento e desistiu? Um toque em "Limpar formulário" (e outro para confirmar) volta tudo ao começo,
   sem precisar apagar campo a campo. Editando, também desiste da edição. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const clica=sel=>{const b=$(sel); if(b){b.click(); return true} return false};
const tenta=fn=>{try{fn(); return true}catch(e){console.warn("limpar",e); return false}};
// formulário → como limpar (a função de reset que cada tela já usa ao salvar / cancelar)
const FORMS={
  lancar:{sel:"#view-lancar",fn:()=>{const t=tipo; resetForm(); if(t&&t!=="plantio") setTipo(t)}},
  chuva:{sel:"#ch-form",fn:()=>chReset()},
  estoque:{sel:"#es-form",fn:()=>esReset()},
  graos:{sel:"#gr-form",fn:null},
  maquinas:{sel:"#mq-form",fn:()=>mqReset()},
  diesel:{sel:"#ds-form",fn:()=>dsReset()},
  benf:{sel:"#bf-form",fn:()=>bfReset()},
  fin:{sel:"#fn-form",fn:()=>clica("#fn-cancel")},
  lembretes:{sel:"#lm-form",fn:()=>clica("#lm-cancel")},
  notas:{sel:"#nt-form",fn:()=>ntReset()},
  entrega:{sel:"#ce-form",fn:()=>clica("#ce-cancel")},
};
function generico(f){ // sem função própria: volta os campos ao padrão e avisa a tela
  f.reset();
  f.querySelectorAll("input,select,textarea").forEach(el=>{el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}))});
}
function limpa(k){
  const c=FORMS[k], f=$(c.sel); if(!f) return;
  if(!(c.fn&&tenta(c.fn))) generico(f);
  window.ponte?.aviso?.("Formulário limpo. Pode começar de novo.",true);
}
function instala(){
  for(const [k,c] of Object.entries(FORMS)){
    const f=$(c.sel); if(!f||f.querySelector(`[data-limpa="${k}"]`)) continue;
    const bar=document.createElement("div"); bar.className="lp-bar";
    bar.innerHTML=`<button type="button" class="link lp-bt" data-limpa="${k}">🧹 Limpar formulário</button>`;
    f.prepend(bar);
  }
}
// dois toques: o primeiro pede confirmação (3 s)
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-limpa]"); if(!b) return; e.preventDefault();
  if(b.dataset.ok!=="1"){b.dataset.ok="1"; b._txt=b._txt||b.textContent; b.textContent="Toque de novo para limpar tudo"; b.classList.add("lp-conf");
    clearTimeout(b._t); b._t=setTimeout(()=>{b.dataset.ok=""; b.textContent=b._txt; b.classList.remove("lp-conf")},3000); return}
  clearTimeout(b._t); b.dataset.ok=""; b.textContent=b._txt; b.classList.remove("lp-conf");
  limpa(b.dataset.limpa);
});
// ↻ recarregar o app (pega dados e versão novos)
document.addEventListener("click",e=>{if(e.target.closest("#hd-recarregar")){e.preventDefault(); location.reload()}});
instala(); document.addEventListener("ponte:pronto",instala); setTimeout(instala,1500);
})();
