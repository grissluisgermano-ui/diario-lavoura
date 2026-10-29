/* Diário da Lavoura — ponte Firebase
 * O app foi escrito para rodar dentro do Claude (window.claude.use("db"|"assets"|"downloads"|"sample"|"user")).
 * Este arquivo recria essas mesmas funções usando Firebase (Firestore + Authentication),
 * para o app funcionar como site independente. O resto do app não precisa saber disso.
 */
(function(){
  "use strict";
  const cfg = window.FIREBASE_CONFIG;
  const LS_KEY = "diario_anthropic_key";
  const MODELOS = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5" };
  const lsGet = k => { try { return localStorage.getItem(k) } catch { return null } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch {} };

  const ponte = window.ponte = { pronto: null, usuario: null, perfil: null };

  if (!cfg || !cfg.projectId || !window.firebase) {
    ponte.pronto = Promise.resolve(false);
    window.claude = { use: async () => null };
    console.warn("Firebase não configurado (config.js).");
    return;
  }

  firebase.initializeApp(cfg);
  const fs = firebase.firestore();
  try { fs.settings({ ignoreUndefinedProperties: true, merge: true }) } catch {}
  fs.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  const auth = firebase.auth();

  /* Snapshots: sempre avisar quando sair do cache e chegar do servidor (status "Salvo na nuvem"). */
  const Q = firebase.firestore.Query.prototype, origSnap = Q.onSnapshot;
  Q.onSnapshot = function (a, b, c) {
    if (typeof a === "function") return origSnap.call(this, { includeMetadataChanges: true }, a, b);
    return origSnap.apply(this, arguments);
  };

  /* Gravações: no campo, sem sinal, o Firestore guarda na fila e sobe depois.
     Não deixamos o botão "Salvar" travado esperando o servidor. */
  function naoTrava(p) {
    let fim = false;
    p.then(() => { fim = true }, e => {
      fim = true; console.error(e);
      aviso(e?.code === "permission-denied" ? "Sem permissão para salvar. Entre de novo com seu e-mail." : "Não foi possível salvar na nuvem: " + (e?.message || e));
    });
    return Promise.race([p, new Promise(r => setTimeout(() => { if (!fim) aviso("Sem internet: salvo no aparelho, sobe para a nuvem quando voltar o sinal.", true); r() }, 1500))]);
  }
  const docW = r => ({
    id: r.id, path: r.path,
    get: o => r.get(o),
    set: (d, o) => naoTrava(o ? r.set(d, o) : r.set(d)),
    update: d => naoTrava(r.update(d)),
    delete: () => naoTrava(r.delete()),
    onSnapshot: (...a) => r.onSnapshot(...a),
  });
  const colW = c => ({
    id: c.id, path: c.path,
    doc: id => docW(id ? c.doc(id) : c.doc()),
    add: d => { const r = c.doc(); return naoTrava(r.set(d)).then(() => docW(r)) },
    get: o => c.get(o),
    onSnapshot: (...a) => c.onSnapshot(...a),
    where: (...a) => c.where(...a),
  });
  const db = { collection: p => colW(fs.collection(p)), doc: p => docW(fs.doc(p)) };
  ponte.fs = fs; ponte.auth = auth;

  /* ---------- Avisos ---------- */
  function aviso(t, leve) {
    let el = document.getElementById("ponte-aviso");
    if (!el) { el = document.createElement("div"); el.id = "ponte-aviso"; document.body.appendChild(el) }
    el.textContent = t; el.className = leve ? "leve" : ""; el.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true }, leve ? 3500 : 7000);
  }
  ponte.aviso = aviso;

  /* ---------- Fotos (guardadas reduzidas dentro do Firestore, coleção "fotos") ---------- */
  const cacheFoto = new Map(), carregando = new Map();
  ponte.fotoUrl = id => cacheFoto.get(id) || ("foto:" + id);
  function carregaFoto(id) {
    if (cacheFoto.has(id)) return Promise.resolve(cacheFoto.get(id));
    if (!carregando.has(id)) carregando.set(id, fs.collection("fotos").doc(id).get().then(s => {
      const d = s.exists ? s.data()?.d : null; if (d) cacheFoto.set(id, d); carregando.delete(id); return d;
    }).catch(() => { carregando.delete(id); return null }));
    return carregando.get(id);
  }
  ponte.fotoFetch = async id => { const u = await carregaFoto(id); return u ? fetch(u) : new Response(null, { status: 404 }) };
  function trocaImgs(raiz) {
    const imgs = raiz.querySelectorAll ? raiz.querySelectorAll('img[src^="foto:"]') : [];
    const lista = raiz.tagName === "IMG" && raiz.getAttribute("src")?.startsWith("foto:") ? [raiz, ...imgs] : imgs;
    for (const img of lista) {
      const id = img.getAttribute("src").slice(5);
      carregaFoto(id).then(u => { if (u && img.getAttribute("src") === "foto:" + id) img.src = u });
    }
  }
  new MutationObserver(ms => { for (const m of ms) {
    if (m.type === "attributes") trocaImgs(m.target); else m.addedNodes.forEach(n => n.nodeType === 1 && trocaImgs(n));
  } }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });

  const blobParaDataUrl = b => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(b) });
  async function reduzFoto(blob) {
    // Firestore aceita até 1 MB por documento: reduzimos até caber com folga (~700 KB em texto).
    let bmp; try { bmp = await createImageBitmap(blob) } catch { return blobParaDataUrl(blob) }
    for (const [lado, q] of [[1600, .8], [1400, .72], [1200, .65], [1000, .6], [800, .55]]) {
      const s = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const u = c.toDataURL("image/jpeg", q);
      if (u.length < 700000) return u;
    }
    throw { code: "too_large" };
  }
  const assets = {
    async upload(blob) {
      const d = await reduzFoto(blob);
      const r = fs.collection("fotos").doc();
      cacheFoto.set(r.id, d);
      await naoTrava(r.set({ d, criadoEm: new Date().toISOString(), criadoPor: ponte.usuario?.uid || null }));
      return { id: r.id, url: d };
    },
    async delete(id) { cacheFoto.delete(id); return naoTrava(fs.collection("fotos").doc(id).delete()) },
  };

  /* ---------- Downloads (backup, relatórios, fotos .zip) ---------- */
  const TIPOS = { json: "application/json", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf", zip: "application/zip", csv: "text/csv", txt: "text/plain" };
  const downloads = {
    async save({ filename, data }) {
      const ext = (filename.split(".").pop() || "").toLowerCase();
      const blob = data instanceof Blob ? data : new Blob([data], { type: TIPOS[ext] || "application/octet-stream" });
      const file = new File([blob], filename, { type: blob.type || TIPOS[ext] || "application/octet-stream" });
      const celular = /iPhone|iPad|Android/i.test(navigator.userAgent);
      if (celular && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: filename }); return { status: "saved" } }
        catch (e) { if (e?.name === "AbortError") throw { code: "declined" } }
      }
      const url = URL.createObjectURL(file), a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { status: "saved" };
    },
  };

  /* ---------- Claude (opcional): perguntas, leitura de notas e princípio ativo ---------- */
  async function blocoImagem(img) {
    let b = img; if (typeof img === "string") b = await (await fetch(img)).blob();
    let tipo = b.type;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(tipo)) { const u = await reduzFoto(b); return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: u.split(",")[1] } } }
    const u = await blobParaDataUrl(b);
    return { type: "image", source: { type: "base64", media_type: tipo, data: u.split(",")[1] } };
  }
  function erroApi(st, txt) {
    if (st === 401 || st === 403) return { code: "not_granted", message: txt };
    if (st === 429 || st === 529) return { code: "rate_limited", message: txt };
    if (st === 413 || /too long|too large/i.test(txt)) return { code: "prompt_too_large", message: txt };
    return { code: "error", message: txt };
  }
  async function chamaClaude(prompt, o = {}, aoTexto) {
    const chave = lsGet(LS_KEY); if (!chave) throw { code: "not_granted" };
    const content = [];
    for (const im of o.images || []) content.push(await blocoImagem(im));
    content.push({ type: "text", text: prompt });
    const corpo = { model: MODELOS[o.modelTier] || MODELOS.default, max_tokens: o.maxTokens || 8000, messages: [{ role: "user", content }] };
    if (aoTexto) corpo.stream = true;
    let resp;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: o.signal,
        headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify(corpo),
      });
    } catch (e) { if (o.signal?.aborted) throw { code: "cancelled", text: "" }; throw { code: "error", message: String(e) } }
    if (!resp.ok) throw erroApi(resp.status, await resp.text().catch(() => ""));
    if (!aoTexto) { const j = await resp.json(); return (j.content || []).filter(c => c.type === "text").map(c => c.text).join("") }
    const rd = resp.body.getReader(), dec = new TextDecoder(); let buf = "", texto = "";
    try {
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n")) >= 0) {
          const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!linha.startsWith("data:")) continue;
          let ev; try { ev = JSON.parse(linha.slice(5)) } catch { continue }
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") { texto += ev.delta.text; aoTexto({ text: texto }) }
          if (ev.type === "error") throw erroApi(0, ev.error?.message || "");
        }
      }
    } catch (e) { if (o.signal?.aborted) throw { code: "cancelled", text: texto }; throw e }
    return texto;
  }
  function extraiJson(t) {
    t = String(t || "").replace(/```(?:json)?/gi, "").trim();
    try { return JSON.parse(t) } catch {}
    const i = t.search(/[\[{]/); if (i < 0) throw { code: "error", message: "sem JSON" };
    const abre = t[i], fecha = abre === "{" ? "}" : "]", j = t.lastIndexOf(fecha);
    return JSON.parse(t.slice(i, j + 1));
  }
  function criaSample() {
    if (!lsGet(LS_KEY)) return null;
    const s = (prompt, o = {}) => chamaClaude(prompt, o, o.onText || (() => {}));
    s.json = async (prompt, o = {}) => extraiJson(await chamaClaude(prompt + "\n\nResponda apenas com o JSON, sem texto antes ou depois.", o));
    s.limits = async () => ({ images: { maxCount: 8 } });
    return s;
  }
  ponte.chaveClaude = () => lsGet(LS_KEY);
  ponte.salvaChaveClaude = k => lsSet(LS_KEY, k ? k.trim() : null);
  ponte.testaClaude = () => chamaClaude("Responda só: ok", { modelTier: "quick", maxTokens: 10 });

  /* ---------- Usuário (quem lançou) ---------- */
  const nomesCache = {};
  const user = {
    id: async () => ponte.usuario?.uid || null,
    async profiles(ids) {
      const out = {};
      await Promise.all(ids.map(async id => {
        if (!(id in nomesCache)) { try { const s = await fs.collection("usuarios").doc(id).get(); nomesCache[id] = s.exists ? s.data().nome : null } catch { nomesCache[id] = null } }
        out[id] = { name: nomesCache[id] || null, isMe: id === ponte.usuario?.uid };
      }));
      return out;
    },
  };
  ponte.salvaNome = async nome => {
    nome = String(nome || "").trim(); if (!nome || !ponte.usuario) return;
    nomesCache[ponte.usuario.uid] = nome; ponte.perfil = { ...(ponte.perfil || {}), nome };
    await naoTrava(fs.collection("usuarios").doc(ponte.usuario.uid).set({ nome, email: ponte.usuario.email }, { merge: true }));
  };

  /* ---------- Login ---------- */
  function telaLogin() {
    let el = document.getElementById("ponte-login");
    if (el) { el.hidden = false; return }
    el = document.createElement("div"); el.id = "ponte-login";
    el.innerHTML = `<form class="pl-card" autocomplete="on">
      <div class="pl-logo" aria-hidden="true"><img src="icone-192.png" alt=""></div>
      <h1>Diário da Lavoura</h1>
      <p class="pl-sub">Entre com o e-mail e a senha cadastrados.</p>
      <label>E-mail<input type="email" id="pl-email" autocomplete="username" required inputmode="email"></label>
      <label>Senha<input type="password" id="pl-senha" autocomplete="current-password" required></label>
      <button type="submit" id="pl-entrar">Entrar</button>
      <button type="button" class="pl-link" id="pl-esqueci">Esqueci a senha</button>
      <p class="pl-msg" id="pl-msg" role="status"></p>
    </form>`;
    document.body.appendChild(el);
    const msg = t => { el.querySelector("#pl-msg").textContent = t };
    el.querySelector("form").onsubmit = async e => {
      e.preventDefault(); const b = el.querySelector("#pl-entrar"); b.disabled = true; msg("Entrando…");
      try { await auth.signInWithEmailAndPassword(el.querySelector("#pl-email").value.trim(), el.querySelector("#pl-senha").value) }
      catch (err) { msg(/wrong-password|invalid-credential|user-not-found|invalid-email|invalid-login/.test(err?.code || "") ? "E-mail ou senha incorretos." : err?.code === "auth/too-many-requests" ? "Muitas tentativas. Espere alguns minutos." : err?.code === "auth/network-request-failed" ? "Sem internet. O primeiro login precisa de conexão." : "Não foi possível entrar: " + (err?.message || err)) }
      finally { b.disabled = false }
    };
    el.querySelector("#pl-esqueci").onclick = async () => {
      const em = el.querySelector("#pl-email").value.trim(); if (!em) { msg("Digite seu e-mail acima e toque de novo em “Esqueci a senha”."); return }
      try { await auth.sendPasswordResetEmail(em); msg("Enviamos um e-mail para criar uma nova senha.") } catch { msg("Não consegui enviar o e-mail. Confira o endereço.") }
    };
  }
  ponte.sair = async () => { await auth.signOut(); location.reload() };

  let resolve; ponte.pronto = new Promise(r => { resolve = r });
  auth.onAuthStateChanged(async u => {
    if (!u) { ponte.usuario = null; telaLogin(); return }
    ponte.usuario = u;
    document.getElementById("ponte-login")?.remove();
    try {
      const s = await fs.collection("usuarios").doc(u.uid).get();
      if (s.exists) ponte.perfil = s.data();
      else { const nome = (u.email || "").split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()); ponte.perfil = { nome, email: u.email }; naoTrava(fs.collection("usuarios").doc(u.uid).set(ponte.perfil)) }
      nomesCache[u.uid] = ponte.perfil.nome;
    } catch (e) { if (e?.code === "permission-denied") { aviso("Este e-mail não tem permissão de acesso ao diário."); await auth.signOut(); return } }
    resolve(true);
    document.dispatchEvent(new CustomEvent("ponte:pronto"));
  });

  /* ---------- Seção "Conta" e "Claude" em Configurações ---------- */
  function ligaConfig() {
    const $ = s => document.querySelector(s);
    if (!$("#cfg-conta")) return;
    const st = t => { $("#cfg-conta-st").textContent = t };
    const preenche = () => {
      $("#cfg-email").textContent = ponte.usuario?.email || "—";
      if (document.activeElement !== $("#cfg-unome")) $("#cfg-unome").value = ponte.perfil?.nome || "";
      const k = lsGet(LS_KEY);
      $("#cfg-claude-st").textContent = k ? "Chave cadastrada neste aparelho (termina em …" + k.slice(-4) + ")." : "Sem chave: as funções do Claude ficam desligadas neste aparelho.";
      $("#cfg-claude-limpar").hidden = !k;
    };
    document.addEventListener("ponte:pronto", preenche); preenche();
    $("#cfg-abrir")?.addEventListener("click", preenche);
    $("#cfg-nome-salvar").onclick = async () => { await ponte.salvaNome($("#cfg-unome").value); st("Nome salvo.") };
    $("#cfg-sair").onclick = () => ponte.sair();
    $("#cfg-senha").onclick = async () => { try { await auth.sendPasswordResetEmail(ponte.usuario.email); st("Enviamos um e-mail para trocar a senha.") } catch { st("Não consegui enviar o e-mail agora.") } };
    $("#cfg-claude-salvar").onclick = async () => {
      const k = $("#cfg-claude-chave").value.trim(); if (!k) { $("#cfg-claude-st").textContent = "Cole a chave no campo acima."; return }
      const antiga = lsGet(LS_KEY); lsSet(LS_KEY, k); $("#cfg-claude-st").textContent = "Testando a chave…";
      try { await ponte.testaClaude(); $("#cfg-claude-st").textContent = "Chave funcionando. Recarregando o app…"; setTimeout(() => location.reload(), 900) }
      catch (e) { lsSet(LS_KEY, antiga); $("#cfg-claude-st").textContent = e?.code === "not_granted" ? "Chave recusada pela Anthropic. Confira se copiou inteira." : "Não consegui testar agora (" + (e?.message || e?.code || "erro") + ")." }
    };
    $("#cfg-claude-limpar").onclick = () => { lsSet(LS_KEY, null); location.reload() };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligaConfig); else ligaConfig();

  const caps = { db: () => db, assets: () => assets, downloads: () => downloads, sample: criaSample, user: () => user };
  window.claude = { use: async nome => { await ponte.pronto; return caps[nome] ? caps[nome]() : null } };

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
