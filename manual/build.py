"""Monta o Manual do Diário da Lavoura: conteudo.txt + jpg/ → manual.html → PDF (2 passadas para numerar o índice)."""
import re, os, html, json, sys
from playwright.sync_api import sync_playwright
import pdfplumber

D = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else D + "/Manual-Diario-da-Lavoura.pdf"

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(https://[^\s<]+?)(?=[\s<]|$)", r'<span class="url">\1</span>', t)
    return t

def parse():
    caps, cur, sec = [], None, None
    lista = None
    def fecha():
        nonlocal lista
        if lista: cur["body"].append(f"</{lista}>"); lista = None
    for raw in open(D + "/conteudo.txt", encoding="utf-8"):
        l = raw.rstrip("\n")
        if not l.strip(): fecha(); continue
        if l.startswith("# "):
            fecha(); cid, tit = [x.strip() for x in l[2:].split("|")]
            cur = {"id": cid, "tit": tit, "body": [], "secs": []}; caps.append(cur); continue
        if l.startswith("## "):
            fecha(); n = len(cur["secs"]) + 1; sid = f"{cur['id']}-{n}"
            cur["secs"].append((sid, l[3:].strip()))
            cur["body"].append(f'<h2 id="{sid}"><span class="mk">§{sid}§</span>{inline(l[3:].strip())}</h2>'); continue
        if l.startswith("FIG: "):
            fecha(); nome, cap = [x.strip() for x in l[5:].split("|")]
            larga = nome in ("computador", "danfe")
            cur["body"].append(f'<figure class="{"larga" if larga else ""}"><img src="jpg/{nome}.jpg"><figcaption>{inline(cap)}</figcaption></figure>'); continue
        if l.startswith("P: "): fecha(); cur["body"].append(f"<p>{inline(l[3:])}</p>"); continue
        if l.startswith("DICA: "): fecha(); cur["body"].append(f'<div class="box dica"><b class="bt">Dica</b>{inline(l[6:])}</div>'); continue
        if l.startswith("ATENCAO: "): fecha(); cur["body"].append(f'<div class="box atencao"><b class="bt">Atenção</b>{inline(l[9:])}</div>'); continue
        m = re.match(r"^(\d+)\. (.*)", l)
        if m:
            if lista != "ol": fecha(); cur["body"].append('<ol class="passos">'); lista = "ol"
            cur["body"].append(f"<li>{inline(m.group(2))}</li>"); continue
        if l.startswith("- "):
            if lista != "ul": fecha(); cur["body"].append("<ul>"); lista = "ul"
            cur["body"].append(f"<li>{inline(l[2:])}</li>"); continue
        raise SystemExit("linha não reconhecida: " + l)
    fecha()
    return caps

CSS = """
@page{size:A4;margin:16mm 15mm 18mm 15mm}
@page :first{margin:0}
:root{--v:#2d6a35;--v2:#e6efe3;--ink:#1d241c;--mut:#5d675b;--am:#a86d12;--ver:#b03a2b;--line:#d9dfd5}
*{box-sizing:border-box}
html{font-family:Inter,"DejaVu Sans",sans-serif;color:var(--ink);font-size:10.4pt;line-height:1.5}
body{margin:0}
.capa{height:297mm;width:210mm;background:var(--v);color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:28mm 22mm 22mm;page-break-after:always;position:relative;overflow:hidden}
.capa .sup{letter-spacing:.18em;text-transform:uppercase;font-size:10pt;opacity:.85}
.capa h1{font-family:"Inter Display",Inter,sans-serif;font-size:46pt;line-height:1.02;margin:10mm 0 4mm;font-weight:800}
.capa .sub{font-size:16pt;opacity:.95;max-width:120mm}
.capa .rod{font-size:10pt;opacity:.9;line-height:1.6}
.capa .faixas{position:absolute;right:-30mm;bottom:58mm;width:150mm;opacity:.16}
.capa .faixas i{display:block;height:9mm;border-radius:9mm;background:#fff;margin:6mm 0}
.capa .tel{position:absolute;right:20mm;top:70mm;width:66mm;border-radius:9mm;border:3mm solid #173b1c;box-shadow:0 8mm 20mm rgba(0,0,0,.35);overflow:hidden;background:#fff}
.capa .tel img{display:block;width:100%}
.indice{page-break-after:always}
.indice h1,.cap>h1{font-family:"Inter Display",Inter,sans-serif;font-size:24pt;margin:0 0 6mm;color:var(--v);font-weight:800}
.indice ol{list-style:none;padding:0;margin:0}
.indice li{break-inside:avoid;display:block}
.indice li.c{margin-top:3.2mm;font-weight:700;font-size:11.5pt;break-after:avoid}
.indice li.s{margin-left:8mm;color:#333;font-size:10pt}
.indice .l{display:flex;gap:2mm;align-items:baseline}
.indice .l .t{flex:none}
.indice .l .dots{flex:1;border-bottom:1px dotted #9aa497;transform:translateY(-1mm)}
.indice .l .pg{flex:none;font-variant-numeric:tabular-nums;min-width:7mm;text-align:right}
.indice .n{display:inline-block;width:8mm;color:var(--v)}
.cap{page-break-before:always}
.cap.cont{page-break-before:auto;margin-top:12mm}
.cap>h1{display:flex;align-items:center;gap:4mm;border-bottom:1.2mm solid var(--v);padding-bottom:3mm}
.cap>h1 .num{display:inline-flex;align-items:center;justify-content:center;width:13mm;height:13mm;border-radius:3mm;background:var(--v);color:#fff;font-size:17pt;flex:none}
h2{font-size:13.5pt;color:var(--v);margin:7mm 0 2.5mm;clear:both;break-after:avoid;font-weight:700}
h2 .sn{color:var(--mut);font-weight:600;margin-right:2mm}
p{margin:0 0 2.6mm}
ul,ol{margin:0 0 3mm;padding-left:6mm}
li{margin:0 0 1.4mm}
ol.passos{list-style:none;padding-left:0;counter-reset:p}
ol.passos li{counter-increment:p;position:relative;padding-left:9mm;min-height:6.5mm}
ol.passos li::before{content:counter(p);position:absolute;left:0;top:-.2mm;width:6.2mm;height:6.2mm;border-radius:50%;background:var(--v);color:#fff;font-weight:700;font-size:8.6pt;display:flex;align-items:center;justify-content:center}
figure{float:right;clear:right;width:56mm;margin:1mm 0 4mm 7mm;break-inside:avoid;text-align:center}
figure img{max-width:100%;max-height:96mm;border:0.35mm solid var(--line);border-radius:2.5mm;box-shadow:0 1mm 2.5mm rgba(0,0,0,.12)}
figure.larga{float:none;width:100%;margin:2mm 0 5mm}
figure.larga img{max-height:105mm}
figcaption{font-size:8.2pt;color:var(--mut);margin-top:1.6mm;line-height:1.35;text-align:left}
.box{border-radius:2.5mm;padding:3mm 4mm;margin:2mm 0 3.5mm;break-inside:avoid;font-size:9.8pt;overflow:hidden}
.box .bt{display:block;font-size:8pt;letter-spacing:.12em;text-transform:uppercase;margin-bottom:1mm}
.dica{background:var(--v2);border-left:1.4mm solid var(--v)}
.dica .bt{color:var(--v)}
.atencao{background:#fbeee0;border-left:1.4mm solid var(--am)}
.atencao .bt{color:var(--am)}
.url{font-family:"DejaVu Sans Mono",monospace;font-size:9pt;color:var(--v);word-break:break-all}
.mk{font-size:1px;color:transparent;position:absolute}
.fim{clear:both}
.intro{font-size:11pt;color:#333}
"""

def build(pages):
    caps = parse()
    tit_sec = lambda ci, si: f"{ci}.{si}"
    toc = []
    for i, c in enumerate(caps, 1):
        pg = pages.get(c["id"], "")
        toc.append(f'<li class="c"><span class="l"><span class="t"><span class="n">{i}</span>{html.escape(c["tit"])}</span><span class="dots"></span><span class="pg">{pg}</span></span></li>')
        for j, (sid, st) in enumerate(c["secs"], 1):
            toc.append(f'<li class="s"><span class="l"><span class="t"><span class="n" style="color:#777">{i}.{j}</span>{html.escape(st)}</span><span class="dots"></span><span class="pg">{pages.get(sid,"")}</span></span></li>')
    corpo = []
    for i, c in enumerate(caps, 1):
        body = "\n".join(c["body"])
        # numera as seções
        k = [0]
        def num(m):
            k[0] += 1; return f'{m.group(1)}<span class="sn">{i}.{k[0]}</span>'
        body = re.sub(r'(<h2 id="[^"]+"><span class="mk">§[^§]+§</span>)', num, body)
        corpo.append(f'<section class="cap{" cont" if c["id"] in ("admin","glossario") else ""}" id="{c["id"]}"><h1><span class="mk">§{c["id"]}§</span><span class="num">{i}</span>{html.escape(c["tit"])}</h1>{body}<div class="fim"></div></section>')
    capa = f"""<div class="capa"><div><div class="sup">Lavoura Griss</div><h1>Diário da<br>Lavoura</h1><div class="sub">Manual de uso do aplicativo<br>passo a passo</div></div>
      <div class="faixas"><i></i><i style="width:80%"></i><i style="width:60%"></i></div>
      <div class="tel"><img src="jpg/inicio.jpg"></div>
      <div class="rod">1ª edição · novembro de 2026<br>Válido para o app a partir da Versão 29<br>https://grissluisgermano-ui.github.io/diario-lavoura/</div></div>"""
    indice = f'<div class="indice"><h1>Índice</h1><p class="intro">Este manual acompanha o app na ordem em que ele costuma ser usado: primeiro as configurações, depois os lançamentos do dia a dia e por fim os relatórios, o financeiro e as automações.</p><ol>{"".join(toc)}</ol></div>'
    cab=f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual do Diário da Lavoura</title><style>{CSS}</style></head><body>'
    return (cab+capa+'</body></html>', cab+indice+"".join(corpo)+'</body></html>'), caps

RODAPE = '<div style="width:100%;font-family:Inter,sans-serif;font-size:7.5pt;color:#6b7468;padding:0 15mm;display:flex;justify-content:space-between"><span>Diário da Lavoura · Manual de uso</span><span><span class="pageNumber"></span></span></div>'

def pdf(hs, out, capa=None):
    open(D + "/manual.html", "w", encoding="utf-8").write(hs[1])
    open(D + "/capa.html", "w", encoding="utf-8").write(hs[0])
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        pg.goto("file://" + D + "/manual.html"); pg.wait_for_timeout(800)
        pg.pdf(path=out, format="A4", print_background=True, display_header_footer=True,
               header_template="<div></div>", footer_template=RODAPE, margin={"top": "16mm", "bottom": "18mm", "left": "15mm", "right": "15mm"})
        if capa:
            pg.goto("file://" + D + "/capa.html"); pg.wait_for_timeout(500)
            pg.pdf(path=capa, format="A4", print_background=True, margin={"top":"0","bottom":"0","left":"0","right":"0"}, page_ranges="1")
        b.close()

def paginas(path):
    res = {}
    with pdfplumber.open(path) as f:
        for n, page in enumerate(f.pages, 1):
            t = page.extract_text() or ""
            for m in re.finditer(r"§([a-z0-9-]+)§", t):
                res.setdefault(m.group(1), n)
    return res

h, caps = build({})
tmp = D + "/_passo1.pdf"; pdf(h, tmp)
pags = paginas(tmp)
falt = [c["id"] for c in caps if c["id"] not in pags] + [s for c in caps for s, _ in c["secs"] if s not in pags]
h, _ = build(pags); corpo = D + "/_corpo.pdf"; capa = D + "/_capa.pdf"; pdf(h, corpo, capa)
pags2 = paginas(corpo)
from pypdf import PdfReader, PdfWriter
w = PdfWriter()
for f in (capa, corpo):
    for pgx in PdfReader(f).pages: w.add_page(pgx)
w.add_metadata({"/Title": "Diário da Lavoura — Manual de uso", "/Author": "Lavoura Griss"})
# marcadores (sumário lateral do leitor de PDF)
for i, c in enumerate(caps, 1):
    if c["id"] in pags2:
        par = w.add_outline_item(f"{i}. {c['tit']}", pags2[c["id"]])
        for j, (sid, st) in enumerate(c["secs"], 1):
            if sid in pags2: w.add_outline_item(f"{i}.{j} {st}", pags2[sid], parent=par)
w.write(OUT)
print("páginas:", len(PdfReader(OUT).pages), "| faltou marcar:", falt, "| índice mudou:", pags != pags2)
for f in (tmp, corpo, capa): os.remove(f)
