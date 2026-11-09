/* Foto ou PDF da nota anexado à entrada do estoque e ao lançamento do Financeiro.
   Só guarda o arquivo (não lê dados: a leitura automática continua só no XML).
   Formato: anexos:[{id, nome, tipo:"foto"|"arquivo", mime, tam, em}] — foto reduzida em "fotos", PDF em ponte.arquivos. */
(function(){
  const ext=a=>a.tipo==="foto"?"FOTO":/pdf/i.test(a.mime||"")||/\.pdf$/i.test(a.nome||"")?"PDF":((a.nome||"").split(".").pop()||"ARQ").slice(0,4).toUpperCase();
  const ehFoto=f=>/^image\//.test(f.type)||/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name||"");

  // envia um arquivo e devolve o item do anexo
  async function envia(file){
    if(ehFoto(file)){const b=await encolher(file); const r=await assets.upload(b,{type:b.type||"image/jpeg"}); return {id:r.id,nome:file.name||"foto.jpg",tipo:"foto",mime:"image/jpeg",tam:b.size||0,em:new Date().toISOString()}}
    const r=await ponte.arquivos.salvar(file); return {id:r.id,nome:file.name||"documento",tipo:"arquivo",mime:r.tipo,tam:r.tam,em:new Date().toISOString()};
  }

  // abre um anexo: foto na tela, PDF numa aba (computador) ou no compartilhar (celular)
  async function abre(a,st){
    if(a.tipo==="foto"){abrirFoto(a.id);return}
    st&&(st.textContent="Abrindo…");
    try{
      const f=await ponte.arquivos.abrir(a.id); st&&(st.textContent="");
      if(!/iPhone|iPad|Android/i.test(navigator.userAgent)){const u=URL.createObjectURL(f), w=window.open(u,"_blank"); setTimeout(()=>URL.revokeObjectURL(u),120000); if(w) return}
      await downloads.save({filename:a.nome,data:f});
    }catch(e){st&&(st.textContent=e?.code==="declined"?"":"Não consegui abrir o anexo. Confira a internet.")}
  }

  // links pequenos para mostrar nos cartões/linhas: 📎 nome
  window.anxLinks=(lista)=>(lista||[]).map(a=>`<button type="button" class="link anx-link" data-anx="${esc(JSON.stringify({id:a.id,tipo:a.tipo,nome:a.nome}))}">📎 ${esc(ext(a)==="FOTO"?"Foto da nota":a.nome)}</button>`).join("");
  document.addEventListener("click",ev=>{const b=ev.target.closest("[data-anx]"); if(!b) return; ev.preventDefault(); try{abre(JSON.parse(b.dataset.anx))}catch{}});

  // campo de anexos dentro de um formulário: anxCampo(elemento) → {get, set, limpar, ocupado}
  window.anxCampo=function(el){
    let lista=[], enviando=0, msg="";
    const pinta=()=>{
      el.innerHTML=`<div class="anx">
        ${lista.map((a,i)=>`<div class="anx-it"><span class="ax-ext">${ext(a)}</span><button type="button" class="anx-nm" data-i="${i}">${esc(a.nome)}</button><button type="button" class="rm" data-rm="${i}" aria-label="Tirar ${esc(a.nome)}">×</button></div>`).join("")}
        <label class="btn ghost anx-add">📎 ${lista.length?"Adicionar outro":"Anexar foto ou PDF da nota"}<input type="file" accept="image/*,application/pdf,.pdf" multiple hidden></label>
        <span class="note anx-st" role="status">${enviando?`Enviando ${enviando} arquivo${enviando>1?"s":""}…`:esc(msg)}</span>
      </div>`;
      el.querySelector("input").onchange=async e=>{
        const fs=[...e.target.files]; e.target.value=""; msg="";
        for(const f of fs){enviando++; pinta();
          try{lista.push(await envia(f))}
          catch(err){msg=err?.code==="too_large"&&!ehFoto(f)?`"${f.name}" passa de 10 MB.`:(ERR_FOTO[err?.code]||`Não foi possível enviar "${f.name}".`)}
          finally{enviando--; pinta()}}
      };
      el.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{lista.splice(+b.dataset.rm,1); pinta()});
      el.querySelectorAll(".anx-nm").forEach(b=>b.onclick=()=>abre(lista[+b.dataset.i],el.querySelector(".anx-st")));
    };
    pinta();
    return {get:()=>lista.map(a=>({...a})), set:l=>{lista=(l||[]).map(a=>({...a})); msg=""; pinta()}, limpar:()=>{lista=[]; msg=""; pinta()}, ocupado:()=>enviando>0};
  };
})();
