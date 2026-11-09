/* Formulários de lançamento numa janela separada (pedido do Luis): um botão logo abaixo do título da tela
   abre o formulário numa janela por cima do app (tela cheia no celular, janela no meio no computador),
   com "✕" para fechar. O formulário é o mesmo de antes (só muda de lugar enquanto a janela está aberta),
   então todos os campos e botões continuam funcionando.
   Quando o app manda editar/registrar algo (Editar num cartão, "+ Registrar manutenção" etc.), a janela
   abre sozinha: scrollIntoView/focus num formulário fechado abrem a janela antes.
   Depois de salvar (mensagem de sucesso do formulário), a janela fecha e a mensagem aparece embaixo. */
(function(){
  const FORMS={graos:["#gr-form","Movimentar saldo"],maquinas:["#mq-form","+ Registrar manutenção"],diesel:["#ds-form","+ Novo lançamento"],
    benfeitorias:["#bf-form","+ Registrar serviço"],fin_contas:["#fn-form","+ Novo lançamento"],lembretes:["#lm-form","+ Novo lembrete"],notas:["#nt-form","+ Nova anotação"]};
  let modal=null, aberto=null;
  function criaModal(){
    if(modal) return modal;
    modal=document.createElement("div"); modal.id="fb-modal"; modal.hidden=true;
    modal.innerHTML=`<div class="fb-fundo"></div><div class="fb-jan" role="dialog" aria-modal="true" aria-labelledby="fb-tit"><div class="fb-cab"><b id="fb-tit"></b><button type="button" class="fb-x" aria-label="Fechar">✕</button></div><div class="fb-corpo"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector(".fb-x").onclick=fecha;
    modal.querySelector(".fb-fundo").onclick=fecha;
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&aberto) fecha()});
    return modal;
  }
  function abre(f){
    if(aberto===f) return; if(aberto) fecha();
    criaModal();
    const tit=f.querySelector(".sub-h")?.textContent?.trim()||f._fbBotao?.dataset.rot?.replace(/^\+\s*/,"")||"Lançamento";
    modal.querySelector("#fb-tit").textContent=tit;
    f._fbLugar=document.createComment("fb"); f.before(f._fbLugar);
    modal.querySelector(".fb-corpo").appendChild(f);
    f.classList.remove("fb-oculto"); f.hidden=false; f.classList.add("fb-na-janela");
    modal.hidden=false; document.documentElement.classList.add("fb-travado"); aberto=f;
    modal.querySelector(".fb-corpo").scrollTop=0;
  }
  function fecha(){
    const f=aberto; if(!f) return; aberto=null;
    f.classList.remove("fb-na-janela"); f._fbLugar?.replaceWith(f); f._fbLugar=null;
    f.classList.add("fb-oculto"); f.hidden=true;
    modal.hidden=true; document.documentElement.classList.remove("fb-travado");
  }
  function instala(){
    for(const [v,[sel,rot]] of Object.entries(FORMS)){
      const s=document.getElementById("view-"+v), f=s?.querySelector(sel), h=s?.querySelector("h2"); if(!f||!h||f._fbBotao) continue;
      const bar=document.createElement("div"); bar.className="fb-bar";
      const b=document.createElement("button"); b.type="button"; b.className="btn fb-bt"; b.textContent=rot; b.dataset.rot=rot;
      b.onclick=()=>abre(f);
      bar.appendChild(b); h.after(bar); f._fbBotao=b;
      // salvou com sucesso (mensagem do próprio formulário): fecha a janela e mostra a confirmação
      const t=f.querySelector(".toast")||f.querySelector("[role=status]");
      if(t) new MutationObserver(()=>{const m=t.textContent.trim(); if(aberto!==f||!m) return;
        if(/(lançad|salv|atualizad|registrad|cadastrad|movimentad|adicionad)/i.test(m)&&!/(não|informe|escolha|aguarde|sem conta|limite|confira|erro|falt)/i.test(m)){
          clearTimeout(f._fbT); f._fbT=setTimeout(()=>{if(aberto===f){fecha(); window.ponte?.aviso?.(m,true)}},700)}}).observe(t,{childList:true,characterData:true,subtree:true});
      f.classList.add("fb-oculto"); f.hidden=true; s.classList.add("fb-fechado");
    }
  }
  // abrir sozinho quando o app leva até o formulário
  const sv=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(){const f=this.closest?.(".fb-oculto"); if(f) abre(f); return sv.apply(this,arguments)};
  const fo=HTMLElement.prototype.focus;
  HTMLElement.prototype.focus=function(){const f=this.closest?.(".fb-oculto"); if(f) abre(f); return fo.apply(this,arguments)};
  window.fbAbre=sel=>{const f=document.querySelector(sel); if(f) abre(f)};
  window.fbFecha=fecha;
  instala(); document.addEventListener("ponte:pronto",instala);
})();
