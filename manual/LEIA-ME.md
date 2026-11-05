# Manual de uso (PDF)

- `Manual-Diario-da-Lavoura.pdf` — o manual pronto (1ª edição, app Versão 29).
- `conteudo.txt` — o texto do manual (capítulos `#`, seções `##`, `P:` parágrafo, `1.` passo, `-` lista, `FIG: nome | legenda`, `DICA:`, `ATENCAO:`).
- `jpg/` — os prints usados (tirados com dados de exemplo).
- `build.py` — gera o PDF: `python3 build.py` (Playwright + pdfplumber + pypdf; duas passadas para numerar o índice).
- `prints.py` — roteiro que tirou os prints no ambiente de teste (mock do Firebase + Playwright, tela 430×932).

Para atualizar: edite `conteudo.txt` (e refaça os prints que mudaram), rode `build.py`, suba o número da edição na capa (em `build.py`).
