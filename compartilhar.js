/* Diário da Lavoura — janela "Enviar": mostra o texto pronto (dá para mexer antes) e manda por
   WhatsApp, pelo "Compartilhar" do celular ou copiando.
   compartilhar({titulo, texto})                         → texto fixo (ex.: localização de um ponto)
   compartilhar({titulo, gerar:o=>texto, opcoes:[{k,l,on}], nota}) → caixas que mudam o texto */
(function(){
"use strict";
let el=null, atual=null, voltaFoco=null;
function monta(){
  el=document.createElement("div"); el.id="cp-modal"; el.hidden=true;
  el.innerHTML=`<div class="fb-fundo" data-cpx></div>
    <div class="fb-jan" role="dialog" aria-modal="true" aria-labelledby="cp-tit">
      <div class="fb-cab"><b id="cp-tit"></b><button type="button" class="fb-x" data-cpx aria-label="Fechar">✕</button></div>
      <div class="fb-corpo">
        <div id="cp-ops" class="cp-ops"></div>
        <label class="lbl" for="cp-txt">Mensagem <small class="note">(dá para mudar antes de enviar)</small></label>
        <textarea id="cp-txt" class="cp-txt" rows="12"></textarea>
        <p class="note" id="cp-nota" hidden></p>
        <div class="cp-bts">
          <button type="button" class="btn cp-wa" id="cp-wa">WhatsApp</button>
          <button type="button" class="btn ghost" id="cp-share" hidden>Outros apps…</button>
          <button type="button" class="btn ghost" id="cp-copia">Copiar</button>
        </div>
        <p class="note cp-st" id="cp-st" role="status"></p>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelectorAll("[data-cpx]").forEach(b=>b.onclick=fecha);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!el.hidden) fecha()});
  const txt=()=>el.querySelector("#cp-txt").value;
  el.querySelector("#cp-wa").onclick=()=>{
    const u="https://wa.me/?text="+encodeURIComponent(txt());
    if(!window.open(u,"_blank")) location.href=u;
  };
  el.querySelector("#cp-share").onclick=async()=>{
    try{await navigator.share({title:atual?.titulo||"Diário da Lavoura",text:txt()})}catch(e){if(e?.name!=="AbortError") st("Não deu para abrir o compartilhar. Use Copiar.")}
  };
  el.querySelector("#cp-copia").onclick=async()=>{
    const ta=el.querySelector("#cp-txt");
    try{await navigator.clipboard.writeText(txt()); st("Copiado. Agora é só colar na conversa.")}
    catch{ta.select(); try{document.execCommand("copy"); st("Copiado. Agora é só colar na conversa.")}catch{st("Selecione o texto e copie.")}}
  };
}
const st=t=>{const s=el.querySelector("#cp-st"); s.textContent=t; clearTimeout(st.t); st.t=setTimeout(()=>s.textContent="",5000)};
function pinta(){
  const o={}; for(const x of atual.opcoes||[]) o[x.k]=x.on;
  const ta=el.querySelector("#cp-txt");
  ta.value=atual.gerar?atual.gerar(o):atual.texto||"";
  ta.rows=Math.min(22,Math.max(6,ta.value.split("\n").length+1));
}
window.compartilhar=function(cfg){
  if(!el) monta();
  atual={...cfg,opcoes:(cfg.opcoes||[]).map(x=>({...x}))}; voltaFoco=document.activeElement;
  el.querySelector("#cp-tit").textContent=cfg.titulo||"Enviar";
  const ops=el.querySelector("#cp-ops");
  ops.innerHTML=atual.opcoes.length?`<span class="lbl">Incluir</span><div class="chips">${atual.opcoes.map((x,i)=>`<button type="button" class="chip" aria-pressed="${!!x.on}" data-cpo="${i}">${esc(x.l)}</button>`).join("")}</div>`:"";
  ops.querySelectorAll("[data-cpo]").forEach(b=>b.onclick=()=>{const x=atual.opcoes[+b.dataset.cpo]; x.on=!x.on; b.setAttribute("aria-pressed",x.on); pinta()});
  const n=el.querySelector("#cp-nota"); n.hidden=!cfg.nota; n.textContent=cfg.nota||"";
  el.querySelector("#cp-share").hidden=!navigator.share;
  el.querySelector("#cp-st").textContent="";
  pinta();
  el.hidden=false; document.documentElement.classList.add("fb-travado");
  el.querySelector(".fb-corpo").scrollTop=0; el.querySelector(".fb-x").focus();
};
function fecha(){el.hidden=true; document.documentElement.classList.remove("fb-travado"); try{voltaFoco?.focus()}catch{}}
})();
