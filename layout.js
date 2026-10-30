/* Diário da Lavoura — layout para telas grandes.
   Detecta a largura da tela: no computador mostra o menu lateral e coloca os formulários
   numa coluna fixa à direita; no celular deixa tudo exatamente como sempre foi. */
(function(){
  "use strict";
  const MQ = window.matchMedia("(min-width:1100px)");
  const SPLIT = { chuvas:"#ch-form", estoque:"#es-form", maquinas:"#mq-form", diesel:"#ds-form",
                  benfeitorias:"#bf-form", graos:"#gr-form", notas:"#nt-form", fin_contas:"#fn-form", historico:"#backup-box, #lx-box" };
  let atual = null;

  /* Menu lateral com todos os grupos e telas */
  function renderSide(view){
    const side = document.getElementById("side"); if (!side || typeof GRUPOS === "undefined") return;
    atual = view;
    side.innerHTML = Object.entries(GRUPOS).map(([g, x]) => {
      const itens = x.v.map(v => `<button type="button" data-view="${v}"${v === view ? ' aria-current="page"' : ""}><i></i>${NOMES[v] || x.l}</button>`).join("");
      return x.v.length > 1 ? `<div class="sd-g"><span class="sd-gl">${x.l}</span>${itens}</div>` : `<div class="sd-g">${itens}</div>`;
    }).join("");
    side.querySelectorAll("button").forEach(b => b.onclick = () => { show(b.dataset.view); if (MQ.matches) window.scrollTo({ top: 0 }) });
  }

  /* Formulário à direita, listas à esquerda (só no computador) */
  function divide(on){
    for (const [v, sel] of Object.entries(SPLIT)) {
      const sec = document.getElementById("view-" + v); if (!sec) continue;
      if (on && !sec._orig) {
        const lados = sel.split(",").map(x => sec.querySelector(":scope > " + x.trim())).filter(Boolean); if (!lados.length) continue;
        sec._orig = [...sec.children];
        const topo = sec._orig[0];
        const main = document.createElement("div"); main.className = "sp-main";
        const side = document.createElement("div"); side.className = "sp-side";
        topo.classList.add("sp-top");
        for (const el of sec._orig.slice(1)) (lados.includes(el) ? side : main).appendChild(el);
        sec.append(main, side); sec.classList.add("split");
      } else if (!on && sec._orig) {
        sec._orig[0].classList.remove("sp-top");
        for (const el of sec._orig) sec.appendChild(el);
        sec.querySelectorAll(":scope > .sp-main, :scope > .sp-side").forEach(w => w.remove());
        sec.classList.remove("split"); delete sec._orig;
      }
    }
  }

  function inicia(){
    if (typeof show !== "function") return;
    const original = show;
    window.show = show = function(view){ const r = original.apply(this, arguments); renderSide(view); return r };
    const ativo = document.querySelector('#tabs-s [aria-selected="true"]')?.dataset.view
      || Object.keys(GRUPOS).map(g => GRUPOS[g].v).flat().find(v => !document.getElementById("view-" + v)?.hidden) || "lancar";
    renderSide(ativo);
    divide(MQ.matches);
    MQ.addEventListener("change", e => divide(e.matches));
    document.getElementById("cfg-abrir")?.addEventListener("click", () => document.querySelectorAll("#side [aria-current]").forEach(b => b.removeAttribute("aria-current")));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicia); else inicia();
})();
