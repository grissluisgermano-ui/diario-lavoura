/* Diário da Lavoura — colheita guardada no estoque (semente própria) (v108)
   Romaneio da colheita com local "📦 Estoque próprio (galpão)" grava {local:"Estoque próprio", estoque:{nome}} e NÃO entra no saldo de grãos.
   Este arquivo mantém, no produto do estoque com esse nome (unidade kg, classe Semente; criado com id fixo semprop_<nome>),
   uma entrada por romaneio: {data, quantidade: kg, valorTotal: kg × custo/kg da cultura, colheitaId, romKey, custoKg, origem}.
   custo/kg = custo da cultura na safra (window.finCustoCultura: insumos + diretos + gerais rateados pela área, igual ao Resultado)
           ÷ produção da cultura na safra (todos os romaneios, inclusive os guardados, em kg).
   Recalcula sozinho quando muda a colheita ou os custos (só grava se mudar); colheita excluída tira as entradas. */
(function(){
  const slug=t=>String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,60);
  const kgDe=rm=>Number(rm.kg)>0&&rm.un==="kg"?Number(rm.kg):(Number(rm.sacas)||0)*60;
  let tm=0, rodando=false, prontoEst=false, prontoReg=false;

  /* safra da colheita = a do plantio que ela fecha (cultura de inverno plantada em maio e colhida em outubro é da safra do plantio) */
  function safraCol(r){
    const c=normCult(r.campos?.cultura), ts=new Set(r.talhoes||[]);
    const p=registros.filter(x=>x.tipo==="plantio"&&!ehProg(x)&&x.data<=r.data&&normCult(x.campos?.cultura)===c&&(x.talhoes||[]).some(t=>ts.has(t))).sort((a,b)=>b.data.localeCompare(a.data))[0];
    return p?(typeof safraReg==="function"?safraReg(p):safraDe(p.data)):safraDe(r.data);
  }
  function custoKg(sy,cult){
    const c=window.finCustoCultura?.(sy,cult); if(!c||!(c.custo>0)) return {kg:0,c};
    let kg=0; for(const r of registros) if(r.tipo==="colheita"&&!ehProg(r)&&normCult(r.campos?.cultura)===normCult(cult)&&safraCol(r)===sy) for(const rm of r.romaneios||[]) kg+=kgDe(rm);
    return {kg:kg>0?c.custo/kg:0,c};
  }
  window.cheCustoKg=custoKg;

  function desejado(){ // produtoNome → [entradas]
    const m=new Map();
    for(const r of registros){ if(r.tipo!=="colheita"||ehProg(r)) continue;
      (r.romaneios||[]).forEach((rm,i)=>{ if(!rm.estoque) return;
        const nome=rm.estoque.nome||`Semente ${normCult(r.campos?.cultura)} (própria)`, kg=Math.round(kgDe(rm)*100)/100; if(!(kg>0)) return;
        const sy=safraCol(r), ck=custoKg(sy,r.campos?.cultura).kg;
        const ent={data:rm.data||r.data,quantidade:kg,valorTotal:Math.round(kg*ck*100)/100,custoKg:Math.round(ck*10000)/10000,colheitaId:r.id,romKey:`${r.id}|${i}`,
          origem:`Colheita própria — ${(r.talhoes||[]).join(", ")}${rm.numero?` (romaneio ${rm.numero})`:""}`,cultura:normCult(r.campos?.cultura),safra:sy};
        const k=nome.trim(); (m.get(k)||m.set(k,[]).get(k)).push(ent);
      });
    }
    return m;
  }
  const igual=(a,b)=>a.data===b.data&&Math.abs(a.quantidade-b.quantidade)<0.005&&Math.abs((a.valorTotal||0)-(b.valorTotal||0))<0.5&&a.origem===b.origem;

  async function sinc(){
    if(rodando||!prontoEst||!prontoReg||!registros.length) return; rodando=true;
    try{
      const des=desejado(), feitos=new Set();
      for(const [nome,ents] of des){
        const e=estoque.find(x=>norm(x.comercial)===norm(nome))||estoque.find(x=>x.id==="semprop_"+slug(nome));
        const id=e?.id||"semprop_"+slug(nome); feitos.add(id);
        const atuais=(e?.entradas||[]);
        const outras=atuais.filter(x=>!x.colheitaId), minhas=atuais.filter(x=>x.colheitaId);
        const novas=ents.map(n=>{const a=minhas.find(x=>x.romKey===n.romKey); return a?{...a,...n}:{...n,criadoEm:new Date().toISOString()}});
        const muda=!e||minhas.length!==novas.length||novas.some(n=>{const a=minhas.find(x=>x.romKey===n.romKey); return !a||!igual(a,n)});
        if(!muda) continue;
        const doc=e?(({id:_,...d})=>d)(e):{comercial:nome,generico:"",classe:"Semente",unidade:"kg",entradas:[],criadoEm:new Date().toISOString()};
        doc.entradas=[...outras,...novas];
        await db.collection("estoque").doc(id).set(doc);
      }
      // colheita excluída ou romaneio que deixou de ir para o estoque
      for(const e of estoque){ if(feitos.has(e.id)) continue;
        const minhas=(e.entradas||[]).filter(x=>x.colheitaId); if(!minhas.length) continue;
        const {id,...doc}=e; doc.entradas=(e.entradas||[]).filter(x=>!x.colheitaId);
        await db.collection("estoque").doc(id).set(doc);
      }
    }catch(err){console.warn("colheita-estoque",err)}
    finally{rodando=false}
  }
  const norm=t=>String(t||"").trim().toLowerCase();
  window.cheSinc=()=>{clearTimeout(tm); tm=setTimeout(sinc,2500)};
  window.cheInicia=function(){
    if(window.cheInicia.ok||!db) return; window.cheInicia.ok=true;
    db.collection("estoque").onSnapshot(()=>{prontoEst=true; window.cheSinc()},()=>{});
    db.collection("registros").onSnapshot(()=>{prontoReg=true; window.cheSinc()},()=>{});
    db.collection("fin_lanc").onSnapshot(()=>window.cheSinc(),()=>{});
  };
  if(typeof col!=="undefined"&&col) window.cheInicia();
})();
