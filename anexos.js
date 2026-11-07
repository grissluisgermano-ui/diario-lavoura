/* Fotos e documentos das máquinas e benfeitorias.
   No documento da máquina/benfeitoria: fotos:[idFoto], capa:idFoto (foto de exposição no cartão),
   docs:[{id, nome, tipo:"foto"|"arquivo", mime, tam, em}] — foto = coleção "fotos" (reduzida); arquivo = ponte.arquivos (PDF etc.). */
(function(){
  const abertos=new Set(), enviando={}, msg={};
  const lista=c=>c==="maquinas"?maquinas:benf;
  const render=c=>c==="maquinas"?renderMaquinas():renderBenf();
  const capaDe=x=>(x.fotos||[]).includes(x.capa)?x.capa:(x.fotos||[])[0];
  const tamTxt=n=>!n?"":n<1024*1024?Math.max(1,Math.round(n/1024))+" KB":(n/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})+" MB";
  const ext=d=>d.tipo==="foto"?"FOTO":(/pdf/i.test(d.mime||"")||/\.pdf$/i.test(d.nome))?"PDF":((d.nome.split(".").pop()||"ARQ").slice(0,4).toUpperCase());

  window.axCapa=(c,x)=>{const f=capaDe(x); return f?`<button type="button" class="ax-capa" data-foto="${esc(f)}" aria-label="Ampliar foto de ${esc(x.nome)}"><img src="${fotoSrc(esc(f))}" alt="${esc(x.nome)}" loading="lazy"></button>`:""};

  window.axBloco=(c,x)=>{
    const k=c+":"+x.id, fs=x.fotos||[], ds=x.docs||[], cap=capaDe(x), n=enviando[k]||0;
    const resumo=[fs.length?`${fs.length} foto${fs.length>1?"s":""}`:"",ds.length?`${ds.length} documento${ds.length>1?"s":""}`:""].filter(Boolean).join(" · ")||"nenhum ainda";
    const nomeItem=c==="maquinas"?"da máquina":"da benfeitoria";
    return `<details class="ax" data-ax="${k}" ${abertos.has(k)?"open":""}><summary>Fotos e documentos <span>${resumo}</span></summary>
      <div class="ax-sec"><b>Fotos ${nomeItem}</b>
        <div class="ax-fotos">${fs.map((f,i)=>`<div class="ax-ft ${f===cap?"capa":""}">
          <button type="button" class="ax-img" data-foto="${esc(f)}" aria-label="Ampliar foto ${i+1}"><img src="${fotoSrc(esc(f))}" alt="Foto ${i+1}" loading="lazy"></button>
          <div class="ax-ft-b">${f===cap?`<span class="ax-tag">★ Capa</span>`:`<button type="button" class="link" data-axcapa="${esc(f)}">Usar de capa</button>`}<button type="button" class="link danger" data-axfdel="${esc(f)}" aria-label="Excluir foto">Excluir</button></div>
        </div>`).join("")}</div>
        <label class="btn ghost ax-add">+ Adicionar fotos<input type="file" accept="image/*" multiple data-axin="fotos" hidden></label>
        ${fs.length>1?`<p class="note">A foto marcada como <b>capa</b> aparece no cartão.</p>`:""}
      </div>
      <div class="ax-sec"><b>Documentos</b> <span class="note">notas fiscais, manuais, PDF de manutenção…</span>
        ${ds.length?`<div class="ax-docs">${ds.map(d=>`<div class="ax-doc">
          <span class="ax-ext">${ext(d)}</span>
          <button type="button" class="ax-dn" data-axabre="${esc(d.id)}"><span>${esc(d.nome)}</span><small>${[d.em?brDate(d.em.slice(0,10)):"",tamTxt(d.tam)].filter(Boolean).join(" · ")}</small></button>
          <button type="button" class="link danger" data-axddel="${esc(d.id)}" aria-label="Excluir documento">Excluir</button>
        </div>`).join("")}</div>`:`<p class="note">Nenhum documento.</p>`}
        <label class="btn ghost ax-add">+ Adicionar documento<input type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.xml,.txt" multiple data-axin="docs" hidden></label>
      </div>
      <p class="note ax-st" role="status">${n?`Enviando ${n} arquivo${n>1?"s":""}…`:esc(msg[k]||"")}</p>
    </details>`;
  };

  async function grava(c,id,muda){
    const x=lista(c).find(y=>y.id===id); if(!x) return;
    const d={fotos:[...(x.fotos||[])],docs:[...(x.docs||[])],capa:x.capa||null}; muda(d);
    if(d.capa&&!d.fotos.includes(d.capa)) d.capa=d.fotos[0]||null;
    const {id:_,...doc}=x; await db.collection(c).doc(id).set({...doc,...d});
  }
  const fila={};  // uma gravação por vez em cada item, para dois envios não se atropelarem
  const naFila=(k,fn)=>(fila[k]=(fila[k]||Promise.resolve()).then(fn,fn));

  async function envia(c,id,campo,files){
    const k=c+":"+id; msg[k]="";
    for(const file of files){
      enviando[k]=(enviando[k]||0)+1; render(c);
      try{
        const ehFoto=/^image\//.test(file.type)||/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name);
        if(campo==="fotos"&&!ehFoto) throw {code:"unsupported_type"};
        let item;
        if(ehFoto){const b=await encolher(file); const r=await assets.upload(b,{type:b.type||"image/jpeg"}); item={id:r.id,tipo:"foto"}}
        else{const r=await ponte.arquivos.salvar(file); item={id:r.id,tipo:"arquivo",mime:r.tipo,tam:r.tam}}
        await naFila(k,()=>grava(c,id,d=>{
          if(campo==="fotos"){d.fotos.push(item.id); if(!d.capa) d.capa=item.id}
          else d.docs.push({id:item.id,nome:file.name||"documento",tipo:item.tipo,mime:item.mime||file.type||"",tam:item.tam||file.size||0,em:new Date().toISOString()});
        }));
      }catch(err){msg[k]=err?.code==="too_large"&&campo==="docs"&&!/^image\//.test(file.type)?`"${file.name}" passa de 10 MB.`:(ERR_FOTO[err?.code]||`Não foi possível enviar "${file.name}".`)}
      finally{enviando[k]--; render(c)}
    }
  }

  async function abre(c,id,did){
    const k=c+":"+id, x=lista(c).find(y=>y.id===id), d=(x?.docs||[]).find(y=>y.id===did); if(!d) return;
    if(d.tipo==="foto"){abrirFoto(d.id);return}
    msg[k]="Abrindo…"; render(c);
    try{
      const f=await ponte.arquivos.abrir(d.id); msg[k]="";
      const celular=/iPhone|iPad|Android/i.test(navigator.userAgent);
      if(!celular){const u=URL.createObjectURL(f), w=window.open(u,"_blank"); setTimeout(()=>URL.revokeObjectURL(u),120000); if(w){render(c);return}}
      await downloads.save({filename:d.nome,data:f});
    }catch(e){msg[k]=e?.code==="declined"?"":"Não consegui abrir o documento. Confira a internet."}
    render(c);
  }

  window.axLiga=(root,c)=>{
    root.querySelectorAll("details.ax").forEach(dt=>{
      const k=dt.dataset.ax, id=k.split(":")[1];
      dt.ontoggle=()=>{dt.open?abertos.add(k):abertos.delete(k)};
      dt.querySelectorAll("[data-foto]").forEach(b=>b.onclick=()=>abrirFoto(b.dataset.foto));
      dt.querySelectorAll("[data-axin]").forEach(inp=>inp.onchange=()=>{const fs=[...inp.files]; inp.value=""; if(fs.length) envia(c,id,inp.dataset.axin,fs)});
      dt.querySelectorAll("[data-axcapa]").forEach(b=>b.onclick=()=>naFila(k,()=>grava(c,id,d=>{d.capa=b.dataset.axcapa})));
      dt.querySelectorAll("[data-axfdel]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar",async()=>{const f=b.dataset.axfdel; await naFila(k,()=>grava(c,id,d=>{d.fotos=d.fotos.filter(y=>y!==f); if(d.capa===f) d.capa=null})); assets?.delete(f)}));
      dt.querySelectorAll("[data-axddel]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar",async()=>{const did=b.dataset.axddel, doc=(lista(c).find(y=>y.id===id)?.docs||[]).find(y=>y.id===did);
        await naFila(k,()=>grava(c,id,d=>{d.docs=d.docs.filter(y=>y.id!==did)}));
        if(doc?.tipo==="foto") assets?.delete(did); else if(doc) ponte.arquivos.excluir(did)}));
      dt.querySelectorAll("[data-axabre]").forEach(b=>b.onclick=()=>abre(c,id,b.dataset.axabre));
    });
    root.querySelectorAll(".ax-capa[data-foto]").forEach(b=>b.onclick=()=>abrirFoto(b.dataset.foto));
  };
  try{renderMaquinas();renderBenf()}catch{}
})();
