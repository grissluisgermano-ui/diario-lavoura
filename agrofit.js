/* Diário da Lavoura — princípio ativo e classe pela lista oficial do AGROFIT (MAPA), sem Claude.
   dados/agrofit.json {atualizadoEm, p:[{r, b:[marcas], f:formulação, a:ingredientes, h:titular, c:classe}]} é atualizado toda
   terça pelo GitHub (.github/workflows/agrofit.yml). O app guarda a lista no aparelho (cache "diario-agrofit") para
   funcionar sem sinal e só baixa de novo quando o manifesto diz que mudou (confere no máximo uma vez por dia).
   window.agrofitBusca(nome) → {generico, classe, unidade, marca, fabricante, registro} ou null. */
(function(){
"use strict";
const CACHE="diario-agrofit", URL_L="dados/agrofit.json", URL_M="dados/agrofit-manifest.json", CHK="agrofit-conferido";
let idx=null, carregando=null, info=null;
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

function monta(d){
  const m=[]; for(const p of d.p||[]) for(const b of p.b||[]){const k=norm(b); if(k.length>=2) m.push([k,p,b])}
  m.sort((x,y)=>y[0].length-x[0].length); // mais longo primeiro: "fox xpro" antes de "fox"
  const exato=new Map(); for(const [k,p,b] of m) if(!exato.has(k)) exato.set(k,[p,b]);
  idx={m,exato}; info={atualizadoEm:d.atualizadoEm,n:(d.p||[]).length};
}
async function carrega(){
  if(idx) return idx; if(carregando) return carregando;
  carregando=(async()=>{
    let d=null;
    try{const c=await caches.open(CACHE); const r=await c.match(URL_L); if(r) d=await r.json()}catch{}
    if(d) monta(d);
    // confere se há lista nova (uma vez por dia, ou já se não tiver nenhuma)
    let ult=0; try{ult=+localStorage.getItem(CHK)||0}catch{}
    if(!d||Date.now()-ult>864e5){
      try{
        const man=await (await fetch(URL_M,{cache:"no-store"})).json();
        if(!d||man.atualizadoEm!==d.atualizadoEm){
          const r=await fetch(URL_L,{cache:"no-store"}); if(r.ok){const c=r.clone(); d=await r.json(); monta(d); try{const k=await caches.open(CACHE); await k.put(URL_L,c)}catch{}}
        }
        try{localStorage.setItem(CHK,String(Date.now()))}catch{}
      }catch{}
    }
    return idx;
  })();
  try{return await carregando}finally{carregando=null}
}
/* "Bixafem (carboxamida) (125 g/L) + Protioconazol (Triazolinthione) (175 g/L)" → "bixafem 125 g/L + protioconazol 175 g/L" */
function generico(a){
  return String(a||"").split(/\s\+\s/).map(s=>{
    const conc=(s.match(/\((\d[\d.,]*\s*(?:g|mL|kg|L|%)[^)]*)\)/i)||[])[1]||"";
    const nome=s.replace(/\([^)]*\)/g,"").replace(/[()]/g,"").replace(/\s+/g," ").trim().toLowerCase();
    return nome+(conc?" "+conc.replace(/\s+/g," "):"");
  }).filter(Boolean).join(" + ");
}
function classe(c){
  const t=norm(c);
  for(const [k,v] of [["herbicida","Herbicida"],["fungicida","Fungicida"],["inseticida","Inseticida"],["acaricida","Acaricida"],["nematicida","Nematicida"],["adjuvante","Adjuvante / óleo"],["espalhante","Adjuvante / óleo"],["oleo","Adjuvante / óleo"]]) if(t.includes(k)) return v;
  return "Outro";
}
function unidade(f){
  const t=norm(f);
  if(/granulad|\bpo\b|po molhavel|po soluvel|tablete|isca|\bwg\b|\bwp\b|\bgr\b|\bsp\b|\bdf\b/.test(t)) return "kg";
  return "L";
}
function busca(nome){
  if(!idx) return null;
  const q=norm(nome); if(q.length<2) return null;
  let hit=idx.exato.get(q);
  if(!hit){ // nome da nota com embalagem: "FOX XPRO GL 5L" → "fox xpro"
    const qq=" "+q+" ";
    for(const [k,p,b] of idx.m){ if(k.length<3) continue; if(qq.startsWith(" "+k+" ")||(k.length>=5&&qq.includes(" "+k+" "))){hit=[p,b];break} }
  }
  if(!hit) return null;
  const [p,b]=hit;
  return {generico:generico(p.a),classe:classe(p.c),unidade:unidade(p.f),marca:b,fabricante:p.h,registro:p.r,classeOriginal:p.c};
}
window.agrofitBusca=busca;
window.agrofitCarrega=carrega;
window.agrofitInfo=()=>info;
/* carrega em segundo plano, sem atrapalhar a abertura do app */
setTimeout(()=>{(window.requestIdleCallback||(f=>setTimeout(f,1)))(()=>carrega())},8000);
})();
