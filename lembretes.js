/* Diário da Lavoura — Lembretes (lista de tarefas / pendências).
   Coleção lembretes {texto, obs, data (AAAA-MM-DD ou null = em espera), hora, aviso (dias antes: 0,1,3,7 ou null = sem alerta),
                      resp ("todos" ou uid), repetir (null|semana|mes|ano), feito, feitoEm, feitoPor, criadoEm}
   Alertas: faixa amarela abaixo do cabeçalho + número na aba; e-mail diário pelo script automacao/lembretes-email.gs. */
(function(){
"use strict";
let lista=[], usuarios={}, edit=null, filtro="todos", iniciou=false, pedeNota=null;
const AVISOS={"":"Sem alerta","0":"No dia","1":"1 dia antes","3":"3 dias antes","7":"1 semana antes"};
const REPETE={"":"Não repete",semana:"Toda semana",mes:"Todo mês",ano:"Todo ano"};
const hoje=()=>todayISO();
const soma=(iso,dias)=>{const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+dias);return d.toISOString().slice(0,10)};
const proxima=(iso,r)=>{const d=new Date(iso+"T12:00:00"); if(r==="semana") d.setDate(d.getDate()+7); else if(r==="mes") d.setMonth(d.getMonth()+1); else if(r==="ano") d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10)};
const SEM=["dom","seg","ter","qua","qui","sex","sáb"];
function quando(l){
  if(!l.data) return "";
  const h=hoje(), d=l.data, dias=Math.round((new Date(d+"T12:00:00")-new Date(h+"T12:00:00"))/864e5);
  const dia=dias===0?"Hoje":dias===1?"Amanhã":dias===-1?"Ontem":dias>1&&dias<7?SEM[new Date(d+"T12:00:00").getDay()]+" "+brDate(d).slice(0,5):brDate(d).slice(0,dias<0||d.slice(0,4)===h.slice(0,4)?5:10);
  return dia+(l.hora?" · "+l.hora:"");
}
/* Em alerta: não feito e (vencido, hoje, ou dentro da janela de aviso) */
const inicioAviso=l=>l.data&&l.aviso!=null&&l.aviso!==""?soma(l.data,-Number(l.aviso)):l.data;
const emAlerta=l=>!l.feito&&l.data&&inicioAviso(l)<=hoje();
const meu=l=>!l.resp||l.resp==="todos"||l.resp===meuId;
const nomeDe=id=>id?(id===meuId?"você":(usuarios[id]?.nome||quem(id)||"…")):"";
const nomeResp=r=>!r||r==="todos"?"Todos":(usuarios[r]?.nome||quem(r)||"…");

/* ---------- Lista ---------- */
function item(l){
  const h=hoje(), venc=!l.feito&&l.data&&l.data<h, dia=!l.feito&&l.data===h, al=emAlerta(l)&&!venc&&!dia;
  const tags=[];
  if(l.data) tags.push(`<span class="pill ${l.feito?"":venc?"venc":dia||al?"prox":""}">${venc?"Atrasado · ":""}${esc(quando(l))}</span>`);
  if(!l.feito&&l.data&&l.aviso!=null&&l.aviso!=="") tags.push(`<span class="lm-tag" title="Alerta">🔔 ${esc(AVISOS[String(l.aviso)]||"")}</span>`);
  if(l.repetir) tags.push(`<span class="lm-tag">↻ ${esc(REPETE[l.repetir])}</span>`);
  if(l.resp&&l.resp!=="todos") tags.push(`<span class="lm-tag">👤 ${esc(nomeResp(l.resp))}</span>`);
  const assin=l.feito?`<div class="quem">Feito${l.feitoPor?" por <b>"+esc(nomeDe(l.feitoPor))+"</b>":""}${l.feitoEm?" em "+esc(brDate(l.feitoEm.slice(0,10))):""}</div>`:l.criadoPor?`<div class="quem">Anotado por <b>${esc(nomeDe(l.criadoPor))}</b></div>`:"";
  return `<article class="lm-it${l.feito?" feito":""}${venc?" venc":""}" data-id="${l.id}">
    <button type="button" class="lm-ck" data-lmck="${l.id}" aria-pressed="${!!l.feito}" aria-label="${l.feito?"Desmarcar":"Marcar como feito"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg></button>
    <div class="lm-corpo">
      <div class="lm-txt">${esc(l.texto)}</div>
      ${tags.length?`<div class="lm-tags">${tags.join("")}</div>`:""}
      ${l.obs?`<p class="lm-obs">${esc(l.obs)}</p>`:""}
      ${assin}
      <div class="rec-actions">${l.feito?(l.notaId?`<button type="button" class="link" data-lmvn="${l.id}">Ver anotação</button>`:`<button type="button" class="link" data-lmnota="${l.id}">Guardar nas anotações</button>`):""}${l.data&&!l.feito?`<a class="link" target="_blank" rel="noopener" href="${agendaUrl(l)}">Pôr na agenda</a>`:""}<button type="button" class="link" data-lmed="${l.id}">Editar</button><button type="button" class="link danger" data-lmdel="${l.id}">Excluir</button></div>
    </div>
  </article>`;
}
function grupo(tit,cls,itens,extra=""){
  if(!itens.length) return "";
  return `<div class="lm-g ${cls}"><h3 class="lm-gh">${tit} <span>${itens.length}</span>${extra}</h3>${itens.map(item).join("")}</div>`;
}
function render(){
  const box=$("#lm-lista"); if(!box) return;
  const h=hoje(), sem7=soma(h,7);
  const vis=lista.filter(l=>filtro!=="meus"||meu(l));
  const ab=vis.filter(l=>!l.feito), ord=(a,b)=>a.data.localeCompare(b.data)||String(a.hora||"99").localeCompare(String(b.hora||"99"));
  const atras=ab.filter(l=>l.data&&l.data<h).sort(ord), hj=ab.filter(l=>l.data===h).sort(ord),
        prox=ab.filter(l=>l.data>h&&l.data<=sem7).sort(ord), dep=ab.filter(l=>l.data>sem7).sort(ord),
        esp=ab.filter(l=>!l.data).sort((a,b)=>String(b.criadoEm).localeCompare(String(a.criadoEm))),
        feitos=vis.filter(l=>l.feito).sort((a,b)=>String(b.feitoEm).localeCompare(String(a.feitoEm)));
  $("#lm-cont").textContent=ab.length?`${ab.length} em aberto`:"";
  if(!lista.length){box.innerHTML=`<div class="empty">Nenhum lembrete ainda.<br>Escreva acima o que não pode ser esquecido: comprar uma peça, ligar para alguém, pagar uma conta.</div>`;return}
  const pn=lista.find(x=>x.id===pedeNota&&x.feito&&!x.notaId); if(!pn) pedeNota=null;
  box.innerHTML=(pn?caixaNota(pn):"")+(ab.length?"":`<div class="empty">Tudo feito por aqui. 👍</div>`)+
    grupo("Atrasados","g-venc",atras)+grupo("Hoje","g-hoje",hj)+grupo("Próximos 7 dias","",prox)+grupo("Mais adiante","",dep)+
    grupo("Em espera (sem data)","g-esp",esp)+
    (feitos.length?`<details class="lm-g g-feito" id="lm-feitos"${$("#lm-feitos")?.open?" open":""}><summary class="lm-gh">Feitos <span>${feitos.length}</span></summary>${feitos.slice(0,40).map(item).join("")}${feitos.length>40?`<p class="note">Mostrando os 40 mais recentes.</p>`:""}</details>`:"");
  box.querySelectorAll("[data-lmck]").forEach(b=>b.onclick=()=>marcar(b.dataset.lmck,b));
  box.querySelectorAll("[data-lmed]").forEach(b=>b.onclick=()=>editar(b.dataset.lmed));
  box.querySelectorAll("[data-lmnota]").forEach(b=>b.onclick=()=>{pedeNota=b.dataset.lmnota; render(); $("#lm-nota")?.scrollIntoView({block:"center",behavior:"smooth"}); $("#lm-nota-txt")?.focus({preventScroll:true})});
  box.querySelectorAll("[data-lmvn]").forEach(b=>b.onclick=()=>verNota(lista.find(x=>x.id===b.dataset.lmvn)));
  if(pn){$("#lm-nota-ok").onclick=()=>guardarNota(pn); $("#lm-nota-x").onclick=()=>{pedeNota=null; render()}}
  box.querySelectorAll("[data-lmdel]").forEach(b=>b.onclick=()=>confirmar(b,"Confirmar exclusão",()=>db.collection("lembretes").doc(b.dataset.lmdel).delete()));
}
/* ---------- Lembrete feito → anotação ---------- */
function caixaNota(l){
  const cats=typeof CAT_NT!=="undefined"?CAT_NT:{geral:{l:"Geral"}};
  return `<div class="lm-nota" id="lm-nota">
    <div class="lm-nota-h"><span class="lm-nota-ok" aria-hidden="true">✓</span><div><b>“${esc(l.texto)}” feito.</b><span>Quer guardar nas Anotações para consultar depois?</span></div></div>
    <div class="field"><label for="lm-nota-txt">Como ficou? (opcional)</label><textarea id="lm-nota-txt" rows="3" placeholder="Ex.: paguei R$ 1.250 no banco; o mecânico vem quinta"></textarea></div>
    <div class="field"><label for="lm-nota-cat">Categoria da anotação</label><select id="lm-nota-cat">${Object.entries(cats).map(([k,v])=>`<option value="${k}"${k==="geral"?" selected":""}>${esc(v.l)}</option>`).join("")}</select></div>
    <div class="row"><button type="button" class="btn" id="lm-nota-ok">Guardar anotação</button><button type="button" class="link" id="lm-nota-x">Agora não</button></div>
  </div>`;
}
async function guardarNota(l){
  if(!db) return; const b=$("#lm-nota-ok"); b.disabled=true;
  const agora=new Date(), feitoEm=l.feitoEm?brDate(l.feitoEm.slice(0,10)):brDate(hoje());
  const res=$("#lm-nota-txt").value.trim();
  const texto=[res,l.obs?"Observação do lembrete: "+l.obs:"",`Lembrete${l.data?" para "+brDate(l.data)+(l.hora?" às "+l.hora:""):""}, concluído em ${feitoEm}${l.feitoPor?" por "+nomeDe(l.feitoPor).replace(/^você$/,usuarios[meuId]?.nome||"você"):""}.`].filter(Boolean).join("\n\n");
  const nota={data:hoje(),hora:agora.toTimeString().slice(0,5),categoria:$("#lm-nota-cat").value||"geral",titulo:l.texto,texto,pessoas:"",local:"",prazo:null,resolvida:false,fotos:[],origem:"lem|"+l.id,criadoEm:agora.toISOString()};
  try{
    const r=await db.collection("notas").add(nota);
    const {id,...doc}=l; doc.notaId=r?.id||true; await db.collection("lembretes").doc(id).set(doc);
    pedeNota=null; flash("Guardado nas Anotações."); render();
  }catch{b.disabled=false; flash("Não foi possível salvar. Tente de novo.")}
}
function verNota(l){
  show("notas"); const q=$("#nt-busca"); if(q&&l){q.value=l.texto; q.dispatchEvent(new Event("input"))}
  requestAnimationFrame(()=>{const r=document.querySelector("#nt-lista .rec"); (r||$("#nt-lista"))?.scrollIntoView({block:"start",behavior:"smooth"})});
}
function agendaUrl(l){
  const d=l.data.replace(/-/g,""); let datas;
  if(l.hora){const [hh,mm]=l.hora.split(":").map(Number); const fim=new Date(2000,0,1,hh,mm+30); datas=`${d}T${l.hora.replace(":","")}00/${d}T${String(fim.getHours()).padStart(2,"0")}${String(fim.getMinutes()).padStart(2,"0")}00`}
  else datas=`${d}/${soma(l.data,1).replace(/-/g,"")}`;
  return "https://calendar.google.com/calendar/render?"+new URLSearchParams({action:"TEMPLATE",text:l.texto,details:(l.obs?l.obs+"\n\n":"")+"Lembrete do Diário da Lavoura",dates:datas,ctz:"America/Sao_Paulo"});
}

/* ---------- Ações ---------- */
async function marcar(id,b){
  const l=lista.find(x=>x.id===id); if(!l||!db) return;
  const {id:_,...doc}=l; b.disabled=true;
  try{
    if(l.feito){doc.feito=false; doc.feitoEm=null; doc.feitoPor=null}
    else{
      doc.feito=true; doc.feitoEm=new Date().toISOString(); doc.feitoPor=meuId||null; if(!l.notaId) pedeNota=id;
      if(l.repetir&&l.data&&!l.proximoId){ // cria o próximo da série
        let nd=proxima(l.data,l.repetir); while(nd<hoje()) nd=proxima(nd,l.repetir);
        const novo={texto:l.texto,obs:l.obs||"",data:nd,hora:l.hora||"",aviso:l.aviso??null,resp:l.resp||"todos",repetir:l.repetir,feito:false,criadoEm:new Date().toISOString()};
        const r=await db.collection("lembretes").add(novo); doc.proximoId=r?.id||true;
        flash(`Feito. Próximo: ${brDate(nd)}.`);
      }
    }
    await db.collection("lembretes").doc(id).set(doc);
  }catch{flash("Não foi possível salvar. Tente de novo.")} finally{b.disabled=false}
}
function flash(m){const t=$("#lm-toast"); if(!t) return; t.textContent=m; clearTimeout(flash.t); flash.t=setTimeout(()=>t.textContent="",4000)}
function respOpcoes(sel){
  const ops=[["todos","Todos"],...Object.entries(usuarios).map(([id,u])=>[id,id===meuId?`${u.nome||"Eu"} (eu)`:(u.nome||u.email||"…")])];
  if(sel&&!ops.some(o=>o[0]===sel)) ops.push([sel,nomeResp(sel)]);
  $("#lm-resp").innerHTML=ops.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join("");
  $("#lm-resp").value=sel||"todos";
}
/* caixa do lembrete cresce com o texto (frases compridas aparecem inteiras); Enter = Adicionar */
function cresce(){const t=$("#lm-txt"); if(!t) return; t.style.height="auto"; t.style.height=t.scrollHeight+2+"px"}
setTimeout(()=>{const t=$("#lm-txt"); if(!t) return;
  t.addEventListener("input",cresce);
  t.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault(); $("#lm-form").requestSubmit()}});
},0);
function reset(){
  edit=null; $("#lm-form").reset(); $("#lm-form-tit").textContent="Novo lembrete"; $("#lm-cancel").hidden=true; $("#lm-salvar").textContent="Adicionar";
  $("#lm-aviso").value="0"; respOpcoes("todos"); avisoVis(); cresce();
}
function avisoVis(){ const v=$("#lm-data").value, tem=!!v;
  document.querySelectorAll("[data-lmdata]").forEach(b=>b.setAttribute("aria-pressed",(b.dataset.lmdata===""?"":soma(hoje(),Number(b.dataset.lmdata)))===v)); $("#lm-aviso").disabled=!tem; $("#lm-rep").disabled=!tem; $("#lm-hora").disabled=!tem }
function editar(id){
  const l=lista.find(x=>x.id===id); if(!l) return;
  reset(); edit=id;
  $("#lm-txt").value=l.texto; cresce(); $("#lm-obs").value=l.obs||""; $("#lm-data").value=l.data||""; $("#lm-hora").value=l.hora||"";
  $("#lm-aviso").value=l.aviso==null?"":String(l.aviso); $("#lm-rep").value=l.repetir||""; respOpcoes(l.resp||"todos");
  $("#lm-mais").open=true; avisoVis();
  $("#lm-form-tit").textContent="Editar lembrete"; $("#lm-cancel").hidden=false; $("#lm-salvar").textContent="Salvar";
  $("#lm-form").scrollIntoView({block:"start",behavior:"smooth"}); $("#lm-txt").focus({preventScroll:true});
}
async function salvar(ev){
  ev.preventDefault();
  if(!db){flash("Sem conexão com o banco de dados.");return}
  const texto=$("#lm-txt").value.trim(); if(!texto){flash("Escreva o lembrete.");$("#lm-txt").focus();return}
  const data=$("#lm-data").value||null, av=$("#lm-aviso").value;
  const old=edit?lista.find(x=>x.id===edit):null;
  const body={texto,obs:$("#lm-obs").value.trim(),data,hora:data?$("#lm-hora").value:"",aviso:data&&av!==""?Number(av):null,
    resp:$("#lm-resp").value||"todos",repetir:data?($("#lm-rep").value||null):null,
    feito:!!old?.feito,feitoEm:old?.feitoEm||null,feitoPor:old?.feitoPor||null,criadoEm:old?.criadoEm||new Date().toISOString()};
  if(old?.proximoId) body.proximoId=old.proximoId;
  $("#lm-salvar").disabled=true;
  try{
    if(edit) await db.collection("lembretes").doc(edit).set(body); else await db.collection("lembretes").add(body);
    const era=!!edit; reset(); $("#lm-mais").open=false; flash(era?"Lembrete atualizado.":"Lembrete adicionado."); $("#lm-txt").focus({preventScroll:true});
  }catch(err){flash(err?.code==="quota_exceeded"?"Limite do banco de dados atingido.":"Não foi possível salvar. Tente de novo.")}
  finally{$("#lm-salvar").disabled=false}
}

/* ---------- Alerta no topo + número na aba ---------- */
const DISP="lm-dispensa";
function alerta(){
  const ab=lista.filter(l=>emAlerta(l)&&meu(l)), h=hoje();
  const n=ab.length;
  window.marca?.("lembretes",n);
  const box=$("#lm-alerta"); if(!box) return;
  let disp=""; try{disp=localStorage.getItem(DISP)||""}catch{}
  const naTela=!$("#view-lembretes")?.hidden;
  if(!n||naTela||disp===h+"|"+n){box.hidden=true;return}
  const atr=ab.filter(l=>l.data<h).length, hj=ab.filter(l=>l.data===h).length, br=n-atr-hj;
  const partes=[atr?`${atr} atrasado${atr>1?"s":""}`:"",hj?`${hj} para hoje`:"",br?`${br} chegando`:""].filter(Boolean);
  const prim=[...ab].sort((a,b)=>a.data.localeCompare(b.data))[0];
  $("#lm-al-tit").textContent=`Lembretes: ${partes.join(" · ")}`;
  $("#lm-al-sub").textContent=prim.texto+(n>1?` e mais ${n-1}`:"");
  box.hidden=false;
}
function instalaAlerta(){
  if($("#lm-alerta")) return;
  const box=document.createElement("div"); box.className="lm-alerta"; box.id="lm-alerta"; box.hidden=true; box.setAttribute("role","status");
  box.innerHTML=`<span class="lm-al-ic" aria-hidden="true">🔔</span><div class="lm-al-txt"><b id="lm-al-tit"></b><span id="lm-al-sub"></span></div><div class="lm-al-bt"><button type="button" class="btn" id="lm-al-ver">Ver</button><button type="button" class="link" id="lm-al-x">Agora não</button></div>`;
  ($("#bk-alerta")||$("header")).after(box);
  $("#lm-al-ver").onclick=()=>{show("lembretes"); window.scrollTo({top:0,behavior:"smooth"})};
  $("#lm-al-x").onclick=()=>{const n=lista.filter(l=>emAlerta(l)&&meu(l)).length; try{localStorage.setItem(DISP,hoje()+"|"+n)}catch{} box.hidden=true};
}

/* ---------- Ligações com o resto do app ---------- */
window.lmColecao=()=>lista.map(l=>({...l}));
window.lmTexto=()=>{const ab=lista.filter(l=>!l.feito); if(!ab.length) return "";
  return "\n\nLembretes em aberto (data | lembrete | responsável | obs):\n"+ab.map(l=>`${l.data?brDate(l.data)+(l.hora?" "+l.hora:""):"sem data"} | ${l.texto} | ${nomeResp(l.resp)} | ${l.obs||"-"}`).join("\n")};
window.lmPlanilha=(add,dt)=>add("Lembretes",[...lista].sort((a,b)=>String(a.data||"9").localeCompare(String(b.data||"9"))).map(l=>({"Data":dt(l.data),"Hora":l.hora||"","Lembrete":l.texto,"Observação":l.obs||"","Responsável":nomeResp(l.resp),"Alerta":l.data?AVISOS[l.aviso==null?"":String(l.aviso)]:"","Repete":REPETE[l.repetir||""],"Situação":l.feito?"Feito":"Em aberto","Feito em":l.feitoEm?brDate(l.feitoEm.slice(0,10)):"","Feito por":l.feitoPor?(usuarios[l.feitoPor]?.nome||quem(l.feitoPor)):"","Lançado por":l.criadoPor?(usuarios[l.criadoPor]?.nome||quem(l.criadoPor)):""})));
const atualiza=()=>{clearTimeout(atualiza.t); atualiza.t=setTimeout(()=>{try{render(); alerta()}catch(e){console.error(e)}},60)};
window.lmInicia=function(){
  if(iniciou||!db) return; iniciou=true;
  db.collection("lembretes").onSnapshot(s=>{lista=s.docs.map(d=>({id:d.id,...d.data()})).filter(l=>l.texto); atualiza()},()=>{});
  db.collection("usuarios").onSnapshot(s=>{usuarios={}; for(const d of s.docs) usuarios[d.id]=d.data()||{}; if(!edit) respOpcoes($("#lm-resp").value||"todos"); atualiza()},()=>{});
};
const orig=show;
window.show=show=function(view){const r=orig.apply(this,arguments); try{alerta()}catch{} return r};
$("#lm-form").addEventListener("submit",salvar);
$("#lm-cancel").onclick=()=>{reset(); $("#lm-mais").open=false};
$("#lm-data").addEventListener("input",avisoVis);
$("#lm-filtro").addEventListener("click",e=>{const b=e.target.closest("[data-f]"); if(!b) return; filtro=b.dataset.f; $("#lm-filtro").querySelectorAll("[data-f]").forEach(x=>x.setAttribute("aria-pressed",x===b)); render()});
document.querySelectorAll("[data-lmdata]").forEach(b=>b.onclick=()=>{const k=b.dataset.lmdata; $("#lm-data").value=k===""?"":soma(hoje(),Number(k)); avisoVis()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden) atualiza()}); // virou o dia com o app aberto
instalaAlerta(); reset(); render();
if(typeof col!=="undefined"&&col) window.lmInicia();
})();
