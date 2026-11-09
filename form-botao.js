/* Formulários de lançamento escondidos atrás de um botão logo abaixo do título da tela (pedido do Luis:
   "vai ficar menos poluída a tela"). Tocar abre o formulário; "Fechar" esconde de novo.
   Quando o app manda editar/registrar algo (Editar num cartão, "+ Registrar manutenção" etc.),
   o formulário abre sozinho: scrollIntoView/focus num formulário escondido abrem ele antes. */
(function(){
  const FORMS={graos:["#gr-form","Movimentar saldo"],maquinas:["#mq-form","+ Registrar manutenção"],diesel:["#ds-form","+ Novo lançamento"],
    benfeitorias:["#bf-form","+ Registrar serviço"],fin_contas:["#fn-form","+ Novo lançamento"],lembretes:["#lm-form","+ Novo lembrete"],notas:["#nt-form","+ Nova anotação"]};
  const secDe=f=>f.closest("section.panel");
  function pinta(f,aberto){
    f.classList.toggle("fb-oculto",!aberto); f.hidden=!aberto;
    const s=secDe(f); s?.classList.toggle("fb-fechado",!aberto);
    const b=f._fbBotao; if(b){b.textContent=aberto?"✕ Fechar":b.dataset.rot; b.classList.toggle("ghost",aberto); b.setAttribute("aria-expanded",aberto)}
  }
  function abre(f){if(f.classList.contains("fb-oculto")) pinta(f,true)}
  function instala(){
    for(const [v,[sel,rot]] of Object.entries(FORMS)){
      const s=document.getElementById("view-"+v), f=s?.querySelector(sel), h=s?.querySelector("h2"); if(!f||!h||f._fbBotao) continue;
      const bar=document.createElement("div"); bar.className="fb-bar";
      const b=document.createElement("button"); b.type="button"; b.className="btn fb-bt"; b.dataset.rot=rot; b.setAttribute("aria-controls",f.id);
      b.onclick=()=>{const ab=f.classList.contains("fb-oculto"); pinta(f,ab); if(ab) f.scrollIntoView({block:"start",behavior:"smooth"})};
      bar.appendChild(b); h.after(bar); f._fbBotao=b; pinta(f,false);
    }
  }
  // abrir sozinho quando o app leva até o formulário
  const sv=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(){const f=this.closest?.(".fb-oculto"); if(f) abre(f); return sv.apply(this,arguments)};
  const fo=HTMLElement.prototype.focus;
  HTMLElement.prototype.focus=function(){const f=this.closest?.(".fb-oculto"); if(f) abre(f); return fo.apply(this,arguments)};
  window.fbAbre=sel=>{const f=document.querySelector(sel); if(f) abre(f)};
  instala(); document.addEventListener("ponte:pronto",instala);
})();
