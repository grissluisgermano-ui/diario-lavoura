/* Diário da Lavoura — caixa de engrenagens das plantadeiras (engrenagens.js), usada por regulagens.js.
   Cada plantadeira pode ter caixa: {adubo:{cima:[dentes|null], baixo:[…], motora:"cima"|"baixo"}, semente:{…}}
   (config/plantio.plantadeiras[].caixa; dentes da esquerda para a direita, null = não contado).
   A regulagem salva guarda eng:{adubo:{c, b}, semente:{c, b}} (posição da engrenagem escolhida em cima e embaixo)
   e o desenho (engSvg) fica no cartão da regulagem. Com os dentes contados e uma regulagem já medida
   (adubo kg/ha ou semente/m), o app estima as outras combinações: valor × (relação nova ÷ relação medida),
   relação = dentes da motora ÷ dentes da movida. */
(function(){
"use strict";
const LADOS={adubo:"Adubo",semente:"Semente"};
const CAIXA_PAD={adubo:{cima:[null,null,null],baixo:[null,null,null],motora:"cima"},semente:{cima:[null,null,null],baixo:[null,null,null],motora:"cima"}};
const eh=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const n2=(v,d=1)=>Number(v).toLocaleString("pt-BR",{maximumFractionDigits:d});
function caixaDe(p){
  if(p?.caixa&&(p.caixa.adubo||p.caixa.semente)) return p.caixa;
  return p&&(p.dose||"sem/m")==="sem/m"?CAIXA_PAD:null; // plantadeira de verão já vem com 3 + 3 de cada lado
}
// nome da posição: "central", "da esquerda"…; com dentes contados: "a menor", "a maior"
function posTxt(arr,i){
  const n=arr.length, z=arr[i];
  let p=n===1?"única":n===2?(i?"da direita":"da esquerda"):n===3?["da esquerda","central","da direita"][i]:`${i+1}ª da esquerda`;
  const zs=arr.filter(x=>x>0);
  if(z>0&&zs.length===n&&n>1){const mn=Math.min(...zs), mx=Math.max(...zs); if(z===mn) p+=", a menor"; else if(z===mx) p+=", a maior"}
  return p+(z>0?` (${z} dentes)`:"");
}
function selTxt(lado,cx,s){
  const c=cx?.[lado]; if(!c||!s||s.c==null||s.b==null) return "";
  return `${LADOS[lado]} — em cima: ${posTxt(c.cima,s.c)} → embaixo: ${posTxt(c.baixo,s.b)}`;
}
const relacao=(c,s)=>{const zc=c.cima[s.c], zb=c.baixo[s.b]; if(!(zc>0&&zb>0)) return null; return c.motora==="baixo"?zb/zc:zc/zb};
/* desenho: duas fileiras de engrenagens (eixo de cima e de baixo), corrente entre as escolhidas */
function engSvg(c,s,o={}){
  if(!c) return "";
  const W=o.mini?150:320, Hrow=o.mini?46:100, top=o.mini?24:64, sc=o.mini?.5:1;
  const raio=z=>(z>0?Math.max(9,Math.min(34,6+z*0.85)):18)*sc;
  const lin=(arr,y,row)=>{const n=arr.length, r=arr.map(raio);
    // espaça igual mesmo com tamanhos diferentes
    const tot=r.reduce((a,b)=>a+2*b,0), gap=(W-tot)/(n+1); let x=gap; const pos=r.map(ri=>{x+=ri; const p=x; x+=ri+gap; return p});
    return arr.map((z,i)=>({x:pos[i],y,r:r[i],z,i,row}))};
  const C=lin(c.cima,top,"c"), B=lin(c.baixo,top+Hrow,"b");
  const sc_=s&&s.c!=null?C[s.c]:null, sb=s&&s.b!=null?B[s.b]:null;
  const dente=(g,on)=>{const k=Math.max(10,Math.round((g.z>0?g.z:18)*.8)); const pts=[]; for(let j=0;j<k*2;j++){const a=Math.PI*j/k, rr=j%2?g.r:g.r*0.84; pts.push(`${(g.x+rr*Math.cos(a)).toFixed(1)},${(g.y+rr*Math.sin(a)).toFixed(1)}`)}
    return `<g class="eg${on?" on":""}" ${o.mini?"":`data-eg="${g.row}:${g.i}" role="button" tabindex="0" aria-label="${g.row==="c"?"Em cima":"Embaixo"}: ${eh(posTxt(g.row==="c"?c.cima:c.baixo,g.i))}"`}>
      <polygon points="${pts.join(" ")}" class="eg-d"/><circle cx="${g.x}" cy="${g.y}" r="${(g.r*0.32).toFixed(1)}" class="eg-c"/>
      ${!o.mini?`<text x="${g.x}" y="${(g.y+g.r+13).toFixed(1)}" text-anchor="middle" class="eg-t">${g.z>0?g.z+"z":g.i+1+"ª"}</text>`:""}</g>`};
  let corr="";
  if(sc_&&sb){ // corrente: as duas tangentes externas
    const dx=sb.x-sc_.x, dy=sb.y-sc_.y, d=Math.hypot(dx,dy), a=Math.atan2(dy,dx), b=Math.acos(Math.max(-1,Math.min(1,(sc_.r-sb.r)/d)));
    const t=(g,ang)=>`${(g.x+g.r*Math.cos(ang)).toFixed(1)},${(g.y+g.r*Math.sin(ang)).toFixed(1)}`;
    corr=`<polyline class="eg-corr" points="${t(sc_,a+b)} ${t(sb,a+b)}"/><polyline class="eg-corr" points="${t(sc_,a-b)} ${t(sb,a-b)}"/>`}
  const H=top+Hrow+(o.mini?22:40);
  return `<svg class="eg-svg${o.mini?" mini":""}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${eh(selTxt(o.lado||"adubo",{[o.lado||"adubo"]:c},s)||"Caixa de engrenagens")}">
    ${!o.mini?`<text x="6" y="14" class="eg-l">Eixo de cima${c.motora!=="baixo"?" (motora)":""}</text><text x="6" y="${top+Hrow-42}" class="eg-l">Eixo de baixo${c.motora==="baixo"?" (motora)":""}</text>`:""}
    <line x1="4" x2="${W-4}" y1="${top}" y2="${top}" class="eg-eixo"/><line x1="4" x2="${W-4}" y1="${top+Hrow}" y2="${top+Hrow}" class="eg-eixo"/>
    ${C.map(g=>dente(g,g===sc_)).join("")}${B.map(g=>dente(g,g===sb)).join("")}${corr}</svg>`;
}
/* estimativa pelas regulagens já medidas da mesma plantadeira */
function estimativa(lado,plt,c,s,regs,excetoId){
  if(!c||!s||s.c==null||s.b==null) return null;
  const rn=relacao(c,s); if(!rn) return null;
  const val=r=>lado==="adubo"?Number(r.aduboKgHa)||0:(r.unidade==="sem/m"||r.unidade==="kg/ha"?Number(r.dose)||0:0);
  const base=(regs||[]).filter(r=>r.id!==excetoId&&r.plantadeira===plt&&r.eng?.[lado]&&val(r)>0&&relacao(c,r.eng[lado])).sort((a,b)=>String(b.data||"").localeCompare(String(a.data||"")))[0];
  if(!base) return null;
  const v=val(base)*rn/relacao(c,base.eng[lado]);
  return {v,un:lado==="adubo"?"kg/ha":base.unidade,base};
}
function tabela(lado,plt,c,regs){ // todas as combinações estimadas
  const out=[]; for(let i=0;i<c.cima.length;i++) for(let j=0;j<c.baixo.length;j++){const e=estimativa(lado,plt,c,{c:i,b:j},regs); if(e) out.push({i,j,...e})}
  return out.sort((a,b)=>a.v-b.v);
}
window.engCaixa={caixaDe,engSvg,selTxt,posTxt,estimativa,tabela,LADOS,CAIXA_PAD,relacao};
})();
