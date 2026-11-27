/* Foto ou PDF da nota anexado à entrada do estoque e ao lançamento do Financeiro.
   Só guarda o arquivo (não lê dados: a leitura automática continua só no XML).
   Formato: anexos:[{id, nome, tipo:"foto"|"arquivo", mime, tam, em}] — foto reduzida em "fotos", PDF em ponte.arquivos. */
(function(){
  const ext=a=>a.tipo==="foto"?"FOTO":/^video\//.test(a.mime||"")||/\.(mov|mp4|m4v|3gp|webm)$/i.test(a.nome||"")?"VÍD":/pdf/i.test(a.mime||"")||/\.pdf$/i.test(a.nome||"")?"PDF":((a.nome||"").split(".").pop()||"ARQ").slice(0,4).toUpperCase();
  const ehFoto=f=>/^image\//.test(f.type)||/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name||"");
  const ehVideo=a=>/^video\//.test(a.type||a.mime||"")||/\.(mov|mp4|m4v|3gp|webm)$/i.test(a.name||a.nome||"");
  const VID_MAX=25*1024*1024; // vídeo: até 25 MB depois de reduzido (uns 3 minutos)
  const erroTxt=(err,f)=>err?.code==="too_large"&&!ehFoto(f)?`"${f.name}" passa de ${ehVideo(f)?"25":"10"} MB${ehVideo(f)?" mesmo depois de reduzido. Envie um vídeo mais curto (até uns 3 minutos).":"."}`:(ERR_FOTO[err?.code]||`Não foi possível enviar "${f.name}".`);

  /* Reduz o vídeo no próprio aparelho antes de enviar: toca o vídeo escondido, redesenha em tamanho menor (até 854 px)
     e grava de novo com MediaRecorder (~0,9 Mbps). Leva o tempo do vídeo; a tela precisa ficar aberta.
     Se o navegador não conseguir, devolve o original (e vale o limite de 25 MB). */
  async function reduzVideo(file,prog){
    if(file.size<=6*1024*1024||typeof MediaRecorder==="undefined") return file;
    const tipos=["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4;codecs=avc1","video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
    const mime=tipos.find(t=>{try{return MediaRecorder.isTypeSupported(t)}catch{return false}}); if(!mime) return file;
    const url=URL.createObjectURL(file), v=document.createElement("video");
    v.src=url; v.playsInline=true; v.preload="auto"; v.setAttribute("playsinline","");
    v.style.cssText="position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0";
    document.body.appendChild(v);
    const limpa=()=>{try{v.pause()}catch{} v.remove(); URL.revokeObjectURL(url)};
    try{
      await new Promise((ok,erro)=>{v.onloadedmetadata=ok; v.onerror=()=>erro(new Error("sem_video")); setTimeout(()=>erro(new Error("tempo")),15000)});
      const W=v.videoWidth, H=v.videoHeight, dur=v.duration; if(!W||!H||!isFinite(dur)||dur<=0) throw new Error("sem_dim");
      const k=Math.min(1,854/Math.max(W,H)), cw=Math.round(W*k/2)*2, ch=Math.round(H*k/2)*2;
      const c=document.createElement("canvas"); c.width=cw; c.height=ch; const g=c.getContext("2d");
      const stream=c.captureStream(30);
      let actx=null;
      try{const AC=window.AudioContext||window.webkitAudioContext; actx=new AC(); const src=actx.createMediaElementSource(v), dst=actx.createMediaStreamDestination(); src.connect(dst); dst.stream.getAudioTracks().forEach(t=>stream.addTrack(t))}catch{actx=null}
      const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:900000,audioBitsPerSecond:64000});
      const partes=[]; rec.ondataavailable=e=>{if(e.data&&e.data.size) partes.push(e.data)};
      const fim=new Promise(ok=>rec.onstop=ok);
      let parado=false;
      const desenha=()=>{if(parado) return; g.drawImage(v,0,0,cw,ch); prog&&prog(Math.min(99,Math.round(v.currentTime/dur*100)));
        if(v.requestVideoFrameCallback) v.requestVideoFrameCallback(desenha); else requestAnimationFrame(desenha)};
      try{await actx?.resume()}catch{}
      rec.start(1000);
      try{await v.play()}catch{v.muted=true; await v.play()}
      desenha();
      await new Promise((ok,erro)=>{v.onended=ok; v.onerror=()=>erro(new Error("erro_tocar")); setTimeout(ok,(dur+30)*1000)});
      parado=true; rec.stop(); await fim; try{actx?.close()}catch{}
      const ext_=/mp4/.test(mime)?"mp4":"webm", b=new Blob(partes,{type:mime.split(";")[0]});
      if(!b.size||b.size>=file.size) return file;
      return new File([b],(file.name||"video").replace(/\.[^.]+$/,"")+"-reduzido."+ext_,{type:b.type});
    }catch(e){return file}
    finally{limpa()}
  }
  window.anxReduzVideo=reduzVideo;

  // envia um arquivo e devolve o item do anexo
  async function envia(file,prog){
    if(ehVideo(file)) file=await reduzVideo(file,prog);
    if(ehFoto(file)){const b=await encolher(file); const r=await assets.upload(b,{type:b.type||"image/jpeg"}); return {id:r.id,nome:file.name||"foto.jpg",tipo:"foto",mime:"image/jpeg",tam:b.size||0,em:new Date().toISOString()}}
    const r=await ponte.arquivos.salvar(file,ehVideo(file)?{max:VID_MAX}:undefined); return {id:r.id,nome:file.name||"documento",tipo:"arquivo",mime:r.tipo,tam:r.tam,em:new Date().toISOString()};
  }

  // abre um anexo: foto na tela, PDF numa aba (computador) ou no compartilhar (celular)
  async function abre(a,st){
    if(a.tipo==="foto"){abrirFoto(a.id);return}
    st&&(st.textContent="Abrindo…");
    try{
      const f=await ponte.arquivos.abrir(a.id); st&&(st.textContent="");
      const pdf=/pdf/i.test(f.type||a.mime||"")||/\.pdf$/i.test(a.nome||"");
      if(ehVideo({type:f.type||a.mime,name:a.nome})){verVideo(f,a.nome); return}
      if(pdf&&await verPdf(f,a.nome)) return; // visualizador dentro do app (celular e computador)
      if(!/iPhone|iPad|Android/i.test(navigator.userAgent)){const u=URL.createObjectURL(f), w=window.open(u,"_blank"); setTimeout(()=>URL.revokeObjectURL(u),120000); if(w) return}
      await downloads.save({filename:a.nome,data:f});
    }catch(e){st&&(st.textContent=e?.code==="declined"?"":"Não consegui abrir o anexo. Confira a internet.")}
  }

  // visualizador de PDF por cima de tudo (pdf.js, o mesmo da leitura de notas): páginas uma embaixo da outra
  async function verPdf(file,nome){
    let lib; try{lib=await pdfLib()}catch{return false}
    let ov=document.getElementById("ax-pdf");
    if(!ov){ov=document.createElement("div"); ov.id="ax-pdf"; ov.className="ax-pdf"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); document.body.appendChild(ov);
      document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!ov.hidden){ov.hidden=true; ov.innerHTML=""}})}
    ov.innerHTML=`<div class="ax-pdf-cab"><b>${esc(nome||"Documento")}</b><span class="ax-pdf-bt"><button type="button" class="btn ghost fn-mini" id="ax-pdf-sv">${/iPhone|iPad|Android/i.test(navigator.userAgent)?"Compartilhar / salvar":"Baixar"}</button><button type="button" class="ax-pdf-x" id="ax-pdf-x" aria-label="Fechar">✕</button></span></div><div class="ax-pdf-pg" id="ax-pdf-pg"><p class="note">Abrindo…</p></div>`;
    ov.hidden=false;
    ov.querySelector("#ax-pdf-x").onclick=()=>{ov.hidden=true; ov.innerHTML=""};
    ov.querySelector("#ax-pdf-sv").onclick=()=>downloads.save({filename:nome||"documento.pdf",data:file}).catch(()=>{});
    try{
      const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise, box=ov.querySelector("#ax-pdf-pg"); box.innerHTML="";
      const larg=Math.min(box.clientWidth||window.innerWidth,1000)-16, dpr=Math.min(window.devicePixelRatio||1,2);
      for(let i=1;i<=Math.min(doc.numPages,30);i++){
        if(ov.hidden) break;
        const pg=await doc.getPage(i), v0=pg.getViewport({scale:1}), esc_=larg/v0.width, v=pg.getViewport({scale:esc_*dpr});
        const c=document.createElement("canvas"); c.width=v.width; c.height=v.height; c.style.width=(v.width/dpr)+"px"; c.setAttribute("aria-label",`Página ${i}`);
        box.appendChild(c); await pg.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
      }
      if(doc.numPages>30) box.insertAdjacentHTML("beforeend",`<p class="note">Mostrando 30 de ${doc.numPages} páginas. Use "${/iPhone|iPad|Android/i.test(navigator.userAgent)?"Compartilhar / salvar":"Baixar"}" para ver o resto.</p>`);
      return true;
    }catch(e){ov.hidden=true; ov.innerHTML=""; return false}
  }
  window.anxVerPdf=verPdf; window.anxVerVideo=(f,n)=>verVideo(f,n); window.anxEhVideo=ehVideo; window.anxVidMax=25*1024*1024;
  // vídeo: tocador por cima de tudo (mesma janela do PDF)
  function verVideo(file,nome){
    let ov=document.getElementById("ax-pdf");
    if(!ov){ov=document.createElement("div"); ov.id="ax-pdf"; ov.className="ax-pdf"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); document.body.appendChild(ov);
      document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!ov.hidden){ov.hidden=true; ov.innerHTML=""}})}
    const u=URL.createObjectURL(file.type?file:new File([file],nome||"video.mp4",{type:"video/mp4"}));
    ov.innerHTML=`<div class="ax-pdf-cab"><b>${esc(nome||"Vídeo")}</b><span class="ax-pdf-bt"><button type="button" class="btn ghost fn-mini" id="ax-pdf-sv">${/iPhone|iPad|Android/i.test(navigator.userAgent)?"Compartilhar / salvar":"Baixar"}</button><button type="button" class="ax-pdf-x" id="ax-pdf-x" aria-label="Fechar">✕</button></span></div><div class="ax-pdf-pg"><video controls playsinline autoplay src="${u}" style="max-width:100%;max-height:80vh;display:block;margin:0 auto;background:#000"></video></div>`;
    ov.hidden=false;
    ov.querySelector("#ax-pdf-x").onclick=()=>{ov.hidden=true; ov.innerHTML=""; URL.revokeObjectURL(u)};
    ov.querySelector("#ax-pdf-sv").onclick=()=>downloads.save({filename:nome||"video.mp4",data:file}).catch(()=>{});
  }
  window.anxEnviar=envia; window.anxErro=erroTxt;

  // links pequenos para mostrar nos cartões/linhas: 📎 nome
  window.anxLinks=(lista)=>(lista||[]).map(a=>`<button type="button" class="link anx-link" data-anx="${esc(JSON.stringify({id:a.id,tipo:a.tipo,nome:a.nome}))}">${ext(a)==="VÍD"?"🎬":ext(a)==="PDF"?"📄":"📎"} ${esc(ext(a)==="FOTO"?"Foto da nota":a.nome)}</button>`).join("");
  document.addEventListener("click",ev=>{const b=ev.target.closest("[data-anx]"); if(!b) return; ev.preventDefault(); try{abre(JSON.parse(b.dataset.anx))}catch{}});

  // campo de anexos dentro de um formulário: anxCampo(elemento) → {get, set, limpar, ocupado}
  window.anxCampo=function(el,op={}){
    let lista=[], enviando=0, msg="", pct=null;
    const pinta=()=>{
      el.innerHTML=`<div class="anx">
        ${lista.map((a,i)=>`<div class="anx-it"><span class="ax-ext">${ext(a)}</span><button type="button" class="anx-nm" data-i="${i}">${esc(a.nome)}</button><button type="button" class="rm" data-rm="${i}" aria-label="Tirar ${esc(a.nome)}">×</button></div>`).join("")}
        <label class="btn ghost anx-add">📎 ${lista.length?"Adicionar outro":(op.rotulo||"Anexar foto ou PDF da nota")}<input type="file" accept="${op.accept||"image/*,application/pdf,.pdf"}" multiple hidden></label>
        <span class="note anx-st" role="status">${pct!=null?`Reduzindo o vídeo… ${pct}% — deixe esta tela aberta`:enviando?`Enviando ${enviando} arquivo${enviando>1?"s":""}…`:esc(msg)}</span>
      </div>`;
      el.querySelector("input").onchange=async e=>{
        const fs=[...e.target.files]; e.target.value=""; msg="";
        for(const f of fs){enviando++; pinta();
          try{lista.push(await envia(f,p=>{pct=p; const st=el.querySelector(".anx-st"); if(st) st.textContent=`Reduzindo o vídeo… ${p}% — deixe esta tela aberta`})); pct=null}
          catch(err){pct=null; msg=erroTxt(err,f)}
          finally{enviando--; pinta()}}
        if(fs.length) op.muda?.(lista.map(a=>({...a})));
      };
      el.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{lista.splice(+b.dataset.rm,1); pinta(); op.muda?.(lista.map(a=>({...a})))});
      el.querySelectorAll(".anx-nm").forEach(b=>b.onclick=()=>abre(lista[+b.dataset.i],el.querySelector(".anx-st")));
    };
    pinta();
    return {get:()=>lista.map(a=>({...a})), set:l=>{lista=(l||[]).map(a=>({...a})); msg=""; pinta()}, limpar:()=>{lista=[]; msg=""; pinta()}, ocupado:()=>enviando>0};
  };
})();
