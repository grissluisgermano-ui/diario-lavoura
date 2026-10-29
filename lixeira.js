/* Diário da Lavoura — Lixeira (aba Lavoura → Histórico).
   Mostra o que foi excluído nos últimos 30 dias e permite recuperar. A gravação na lixeira é feita pela ponte (ponte.js). */
(function(){
  "use strict";
  const box = document.getElementById("lx-box"); if (!box || !window.ponte?.lixeira) return;
  const lista = document.getElementById("lx-lista"), cont = document.getElementById("lx-cont");
  const NOMES_COL = { registros:"Lançamento", estoque:"Produto do estoque", graos:"Movimento de grãos", maquinas:"Máquina", manutencoes:"Manutenção",
    diesel:"Abastecimento", benfeitorias:"Benfeitoria", servicos_benf:"Serviço em benfeitoria", notas:"Anotação", config:"Configuração" };
  const e = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const br = iso => { try { const [y, m, d] = String(iso).slice(0, 10).split("-"); return d ? `${d}/${m}/${y}` : "" } catch { return "" } };
  const n = v => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  let itens = [], aberto = false;

  function resumo(x){
    const d = x.dados || {};
    switch (x.colecao) {
      case "registros": {
        const tipo = (typeof TIPOS !== "undefined" && TIPOS[d.tipo]?.label) || d.tipo || "";
        const extra = d.tipo === "chuva" ? `${n(d.campos?.mm)} mm` : (d.nome || (d.campos?.produtos || []).map(p => p.nome).filter(Boolean).join(", "));
        return `${tipo}${extra ? " · " + extra : ""} · ${br(d.data)}${(d.talhoes || []).length ? " · " + d.talhoes.join(", ") : ""}`;
      }
      case "estoque": return `${d.comercial || ""}${d.generico ? " (" + d.generico + ")" : ""}`;
      case "graos": return `${d.tipo || ""} · ${n(d.sacas)} sc${d.cultura ? " de " + d.cultura : ""}${d.local ? " · " + d.local : ""} · ${br(d.data)}`;
      case "maquinas": case "benfeitorias": return d.nome || "";
      case "manutencoes": case "servicos_benf": return `${br(d.data)} · ${(d.servicos || []).join(", ") || d.descricao || ""}`;
      case "diesel": return `${d.tipo || ""} · ${n(d.litros ?? d.nivel)} L · ${br(d.data)}`;
      case "notas": return `${d.titulo || String(d.texto || "").slice(0, 70)} · ${br(d.data)}`;
      default: return x.docId;
    }
  }
  const quando = iso => { try { const t = new Date(iso); return t.toLocaleDateString("pt-BR") + " às " + t.toTimeString().slice(0, 5) } catch { return "" } };
  const restam = iso => Math.max(0, Math.ceil(ponte.lixeira.dias - (Date.now() - new Date(iso)) / 864e5));

  function render(){
    cont.textContent = itens.length ? `(${itens.length})` : "";
    if (!itens.length) { lista.innerHTML = `<p class="note">A lixeira está vazia.</p>`; return }
    const mostra = aberto ? itens : itens.slice(0, 5);
    lista.innerHTML = mostra.map(x => `<div class="lx-it">
        <div class="lx-tx"><span class="lx-col">${e(NOMES_COL[x.colecao] || x.colecao)}</span><b>${e(resumo(x))}</b>
          <span class="note">Excluído em ${e(quando(x.excluidoEm))}${x.nome ? " por " + e(x.nome) : ""} · some em ${restam(x.excluidoEm)} dia(s)</span></div>
        <div class="lx-ac"><button type="button" class="btn ghost" data-lxr="${e(x.id)}">Recuperar</button><button type="button" class="link danger" data-lxa="${e(x.id)}">Apagar de vez</button></div>
      </div>`).join("") + (itens.length > 5 ? `<button type="button" class="link" id="lx-mais">${aberto ? "Mostrar menos" : `Ver todos (${itens.length})`}</button>` : "");
    lista.querySelectorAll("[data-lxr]").forEach(b => b.onclick = async () => {
      const x = itens.find(i => i.id === b.dataset.lxr); if (!x) return; b.disabled = true; b.textContent = "Recuperando…";
      try { await ponte.lixeira.restaurar(x); ponte.aviso("Recuperado: o item voltou para o app.", true) } catch { b.disabled = false; b.textContent = "Recuperar"; ponte.aviso("Não consegui recuperar agora. Tente de novo.") }
    });
    lista.querySelectorAll("[data-lxa]").forEach(b => b.onclick = async () => {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Confirmar: apagar para sempre"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Apagar de vez" } }, 4000); return }
      const x = itens.find(i => i.id === b.dataset.lxa); if (!x) return; b.disabled = true;
      try { await ponte.lixeira.apagar(x) } catch { b.disabled = false }
    });
    const mais = document.getElementById("lx-mais"); if (mais) mais.onclick = () => { aberto = !aberto; render() };
  }
  let ligado = false;
  function liga(){
    if (ligado) return; ligado = true; box.hidden = false;
    ponte.lixeira.ouvir(l => { itens = l.filter(x => x.excluidoEm).sort((a, b) => String(b.excluidoEm).localeCompare(String(a.excluidoEm))); render() });
  }
  document.addEventListener("ponte:pronto", liga);
  if (window.ponte?.usuario) ponte.pronto.then(liga);
})();
