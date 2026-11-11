/* Diário da Lavoura — janela "Enviar": mostra o texto pronto (dá para mexer antes) e manda por
   WhatsApp, pelo "Compartilhar" do celular ou copiando.
   compartilhar({titulo, texto})                         → texto fixo (ex.: localização de um ponto)
   compartilhar({titulo, gerar:o=>texto, opcoes:[{k,l,on}], nota}) → caixas que mudam o texto
   desenho:{svg, nome}  → desenho do mapa (mapa.js mpDesenho): vira PNG; vai junto pelo "Enviar" (compartilhar do celular),
                          ou Copiar/Baixar desenho no computador (o link do WhatsApp só leva texto). */
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
        <div id="cp-des" class="cp-des" hidden><img alt="Desenho do mapa"></div>
        <label class="lbl" for="cp-txt">Mensagem <small class="note">(dá para mudar antes de enviar)</small></label>
        <textarea id="cp-txt" class="cp-txt" rows="12"></textarea>
        <p class="note" id="cp-nota" hidden></p>
        <div class="cp-bts">
          <button type="button" class="btn cp-wa" id="cp-env" hidden>📤 Enviar com o desenho</button>
          <button type="button" class="btn cp-wa" id="cp-wa">WhatsApp</button>
          <button type="button" class="btn ghost" id="cp-dcopia" hidden>Copiar desenho</button>
          <button type="button" class="btn ghost" id="cp-dbaixa" hidden>Baixar desenho</button>
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
  el.querySelector("#cp-env").onclick=async()=>{
    const f=png.file; if(!f) return;
    try{await navigator.share({files:[f],text:txt(),title:atual?.titulo||"Diário da Lavoura"})}
    catch(e){if(e?.name!=="AbortError") st("Não deu para enviar com o desenho. Use WhatsApp (só texto) e Baixar desenho.")}
  };
  el.querySelector("#cp-dcopia").onclick=async()=>{
    try{await navigator.clipboard.write([new ClipboardItem({"image/png":png.file})]); st("Desenho copiado. Cole na conversa (Ctrl+V).")}catch{st("Não deu para copiar. Use Baixar desenho.")}
  };
  el.querySelector("#cp-dbaixa").onclick=()=>{
    const u=URL.createObjectURL(png.file), a=document.createElement("a"); a.href=u; a.download=png.file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),30000);
  };
  el.querySelector("#cp-copia").onclick=async()=>{
    const ta=el.querySelector("#cp-txt");
    try{await navigator.clipboard.writeText(txt()); st("Copiado. Agora é só colar na conversa.")}
    catch{ta.select(); try{document.execCommand("copy"); st("Copiado. Agora é só colar na conversa.")}catch{st("Selecione o texto e copie.")}}
  };
}
let png={file:null};
const comDesenho=()=>!!(atual?.desenho&&(atual.opcoes.find(x=>x.k==="__desenho")?.on)&&png.file);
function botoes(){
  const d=comDesenho(), share=d&&navigator.canShare&&(()=>{try{return navigator.canShare({files:[png.file]})}catch{return false}})();
  el.querySelector("#cp-des").hidden=!(atual?.desenho&&atual.opcoes.find(x=>x.k==="__desenho")?.on);
  el.querySelector("#cp-env").hidden=!share;
  el.querySelector("#cp-wa").textContent=share?"Só o texto no WhatsApp":"WhatsApp";
  el.querySelector("#cp-wa").className="btn "+(share?"ghost":"cp-wa");
  el.querySelector("#cp-share").hidden=share||!navigator.share;
  el.querySelector("#cp-dcopia").hidden=!d||share||!(navigator.clipboard?.write&&window.ClipboardItem);
  el.querySelector("#cp-dbaixa").hidden=!d||share;
}
const st=t=>{const s=el.querySelector("#cp-st"); s.textContent=t; clearTimeout(st.t); st.t=setTimeout(()=>s.textContent="",5000)};
function pinta(){
  const o={}; for(const x of atual.opcoes||[]) o[x.k]=x.on;
  const ta=el.querySelector("#cp-txt");
  ta.value=atual.gerar?atual.gerar(o):atual.texto||"";
  ta.rows=Math.min(22,Math.max(6,ta.value.split("\n").length+1));
  botoes();
}
window.compartilhar=function(cfg){
  if(!el) monta();
  atual={...cfg,opcoes:[...(cfg.desenho?[{k:"__desenho",l:"Desenho do mapa",on:true}]:[]),...(cfg.opcoes||[]).map(x=>({...x}))]}; voltaFoco=document.activeElement;
  png={file:null};
  const im=el.querySelector("#cp-des img");
  if(cfg.desenho){
    im.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(cfg.desenho.svg);
    const eu=atual; // prepara o PNG já ao abrir (o "Compartilhar" do iPhone precisa do arquivo pronto na hora do toque)
    (window.mpPng?mpPng(cfg.desenho.svg):Promise.reject()).then(b=>{if(atual!==eu) return; png.file=new File([b],cfg.desenho.nome||"mapa.png",{type:"image/png"}); botoes()}).catch(()=>{});
  }else im.removeAttribute("src");
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
