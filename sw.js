/* Guarda o app no aparelho para abrir mesmo sem sinal na lavoura.
   Arquivos do app: tenta a internet primeiro (pega a versão nova) e usa a cópia guardada se estiver sem sinal.
   Bibliotecas externas (Firebase, Excel, PDF, fontes): usa a cópia guardada. Os dados ficam no cache do próprio Firestore. */
const CACHE = "diario-v6";
const APP = ["./", "index.html", "ponte.js", "ponte.css", "layout.css", "layout.js", "lixeira.js", "config.js", "manifest.webmanifest", "icone-180.png", "icone-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting())) });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())) });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (/googleapis\.com$/.test(url.hostname) && !/fonts\.googleapis/.test(url.hostname)) return; // Firestore/Auth: não mexer
  if (url.hostname === "api.anthropic.com") return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)) } return r })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
  } else if (/gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(resp => { const c = resp.clone(); caches.open(CACHE).then(k => k.put(req, c)); return resp })));
  }
});
