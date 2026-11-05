import os
IMG=SP+"/man/img"
def prep(pg):
    pg.add_style_tag(content=".tabs{position:static!important} .toast{display:none!important} #bk-alerta,#lm-alerta{display:none!important}")
def el(pg,sel,name,maxh=1100,pad=10,top=0):
    pg.wait_for_timeout(250)
    r=pg.evaluate("""([s,pad])=>{const e=document.querySelector(s); if(!e) return null; e.scrollIntoView({block:'start'}); const b=e.getBoundingClientRect(); return {x:Math.max(0,b.left-pad),y:b.top+scrollY-pad,w:Math.min(b.width+2*pad,innerWidth),h:b.height+2*pad}}""",[sel,pad])
    if not r: print("FALTOU",name,sel); return
    pg.wait_for_timeout(200)
    r["y"]+=top; r["h"]=min(r["h"]-top,maxh)
    pg.screenshot(path=f"{IMG}/{name}.png",full_page=True,clip={"x":r["x"],"y":r["y"],"width":r["w"],"height":r["h"]})
def tela(pg,name,y=0,h=932):
    pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{IMG}/{name}.png")
def clicar_txt(pg,sel,txt): pg.locator(sel,has_text=txt).first.click(); pg.wait_for_timeout(250)

# login
lg=nova(p,430,932,seed=None) if False else None
ctx=p.chromium.launch().new_context(viewport={"width":430,"height":932},device_scale_factor=2,service_workers="block")
lp=ctx.new_page(); lp.route("**/*",rota); lp.add_init_script("window.__semLogin=true"); lp.goto("http://127.0.0.1:8765/index.html"); lp.wait_for_timeout(1500)
lp.screenshot(path=f"{IMG}/login.png")

pg=nova(p,430,932); prep(pg); pg.wait_for_timeout(800)
# início
ir(pg,"painel"); tela(pg,"inicio")
el(pg,"header","topo",pad=4)
el(pg,"#tabs-g","abas",pad=6)
# configurações
pg.click("#cfg-abrir"); pg.wait_for_timeout(500)
el(pg,"#cfg-conta","cfg-conta"); el(pg,"#cfg-prop","cfg-prop",maxh=1400); el(pg,"#dv-form","cfg-pessoas",maxh=1300); el(pg,"#versao-box","cfg-versao",pad=8)
el(pg,"#view-config .sub","cfg-aparencia",maxh=700)
pg.click("#cfg-fechar"); pg.wait_for_timeout(300)
# lançar: aplicação
ir(pg,"lancar"); clicar_txt(pg,"#tipos button","Aplicação")
clicar_txt(pg,"#talhoes button","Talhão 1"); clicar_txt(pg,"#talhoes button","Talhão 2")
pg.evaluate("""()=>{const c=document.querySelector('#campos'); const s=c.querySelector('select,input'); }""")
pr=pg.locator("#prods .prod").first
pr.locator("input").first.fill("Fox Xpro"); pr.locator("input").nth(1).fill("0,5"); pg.keyboard.press("Tab"); pg.wait_for_timeout(400)
el(pg,"#view-lancar","lancar-aplic",maxh=1000); el(pg,"#prods-box","lancar-prods",maxh=700)
# lançar colheita
clicar_txt(pg,"#tipos button","Colheita"); pg.wait_for_timeout(300)
el(pg,"#roms-box","lancar-roms",maxh=700)
clicar_txt(pg,"#tipos button","Plantio")
# programação
ir(pg,"programacao"); el(pg,"#view-programacao","programacao",maxh=1100)
# histórico
ir(pg,"historico"); el(pg,"#view-historico","historico",maxh=1000)
el(pg,"#lx-box","lixeira",maxh=500)
# estoque
ir(pg,"estoque"); el(pg,"#view-estoque","estoque",maxh=1000)
pg.evaluate("esAba('entrada')"); el(pg,"#es-form","estoque-entrada",maxh=1150)
pg.evaluate("esAba('produtos')")
# notas por e-mail (semeia)
xs=[open(f,encoding="utf-8",errors="ignore").read() for f in ("nota.xml","nota2.xml")]
pg.evaluate("""(xs)=>{xs.forEach((x,i)=>{const ch=(x.match(/Id="NFe(\\d{44})"/)||[])[1]||('3526'+i); db.collection('nfe').doc(ch).set({xml:x,origem:'email',numero:String(100+i),data:'2026-11-0'+(i+1),emit:'Coamo',total:15070,...(i===1?{ignorada:true}:{})})})}""",xs)
pg.wait_for_timeout(600); pg.evaluate("esAba('notas')"); pg.wait_for_timeout(300); pg.evaluate("document.getElementById('ne-ign').open=true")
el(pg,"#view-estoque .es-pane[data-pane=notas]","estoque-notas",maxh=1500)
# DANFE
pg.locator("#ne-box [data-danfe]").first.click(); pg.wait_for_timeout(800); tela(pg,"danfe"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
pg.evaluate("document.querySelectorAll('.dn-tela,#dn-tela,.danfe-tela').forEach(e=>e.remove())")
# grãos
ir(pg,"graos"); el(pg,"#gr-saldos","graos-saldos",maxh=1300)
el(pg,"#gr-form","graos-mov",maxh=1300)
pg.locator("#ce-mais").evaluate("e=>e.open=true") if pg.locator("#ce-mais").count() else None
el(pg,"#ce-form","graos-contrato",maxh=1300)
el(pg,"#gr-pai","graos-arr",maxh=700)
# chuvas
ir(pg,"chuvas"); el(pg,"#view-chuvas form","chuva-form",maxh=900); el(pg,"#pl-chart","chuva-grafico",maxh=900)
# painel
ir(pg,"painel"); pg.wait_for_timeout(800); el(pg,"#ci-box","painel-talhoes",maxh=1100)
el(pg,"#pn-kpis","painel-kpis",maxh=1200)
pg.evaluate("abreTalhao('Talhão 1')"); pg.wait_for_timeout(500); tela(pg,"painel-talhao"); pg.evaluate("document.getElementById('ct-volta').click()")
# relatórios
ir(pg,"relatorios"); pg.wait_for_timeout(800); el(pg,"#view-relatorios","relatorios",maxh=1050); el(pg,"#backup-box","backup",maxh=900)
# mapa
ir(pg,"mapa"); pg.wait_for_timeout(2500); tela(pg,"mapa")
pg.locator("#mp-tal button",has_text="Desenhar").first.click(); pg.wait_for_timeout(1500); tela(pg,"mapa-editor"); pg.keyboard.press("Escape")
pg.evaluate("document.querySelectorAll('#mp-ed').forEach(e=>e.hidden=true)")
# estrutura
ir(pg,"maquinas"); el(pg,"#mq-cards","maquinas",maxh=1000); el(pg,"#mq-form","maquinas-form",maxh=1200)
ir(pg,"diesel"); el(pg,"#view-diesel","diesel",maxh=1100)
ir(pg,"benfeitorias"); el(pg,"#bf-form","benf-form",maxh=1500); el(pg,"#bf-cards","benf",maxh=900)
# financeiro
ir(pg,"fin_resumo"); pg.wait_for_timeout(800); el(pg,"#view-fin_resumo","fin-resumo",maxh=1000); el(pg,"#fn-pend","fin-pend",maxh=1000)
ir(pg,"fin_contas"); pg.wait_for_timeout(600); el(pg,"#fn-form","fin-form",maxh=1300); el(pg,"#fn-lista","fin-lista",maxh=1100)
ir(pg,"fin_caixa"); pg.wait_for_timeout(500); pg.select_option("#lc-per",index=2); pg.wait_for_timeout(400); el(pg,"#view-fin_caixa","fin-caixa",maxh=1300)
ir(pg,"fin_safra"); pg.wait_for_timeout(800); el(pg,"#view-fin_safra","fin-safra",maxh=1100)
# lembretes e anotações
ir(pg,"lembretes"); pg.evaluate("document.getElementById('lm-mais').open=true"); el(pg,"#lm-form","lembrete-form",maxh=1300); el(pg,"#lm-lista","lembretes",maxh=1300)
ir(pg,"notas"); el(pg,"#nt-form","nota-form",maxh=1500); el(pg,"#nt-lista","notas",maxh=900)
# perguntar
ir(pg,"perguntar"); el(pg,"#view-perguntar","perguntar",maxh=1000)
# bolinhas no topo
ir(pg,"painel"); pg.evaluate("window.scrollTo(0,0)"); el(pg,"#tabs-s","bolinhas",pad=6)
# computador
pc=nova(p,1366,860); pc.add_style_tag(content="#bk-alerta,#lm-alerta{display:none!important}"); pc.wait_for_timeout(500); ir(pc,"lancar"); pc.wait_for_timeout(500); pc.screenshot(path=f"{IMG}/computador.png")
print(sorted(os.listdir(IMG)))
