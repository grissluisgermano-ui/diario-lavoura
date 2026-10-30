# Diário da Lavoura — instruções para o Claude

App de gestão da lavoura do **Luis** (sócio com a irmã; o pai, **Nestor Griss**, arrenda a área para os dois).
**Sempre responda ao Luis em português do Brasil.** Ele não é programador: explique o que mudou em linguagem simples, mostre prints antes de publicar e só publique depois que ele aprovar.

## Como o app é montado
- `index.html` — o app inteiro (HTML + CSS + JS num arquivo só). Nasceu como artifact do Claude.
- `ponte.js` — recria, com Firebase, a API que o artifact usava (`window.claude.use("db" | "assets" | "downloads" | "sample" | "user")`). Por isso o código do `index.html` continua chamando `claude.use(...)`.
  - `db` → Firestore (API compat v10, mesma forma: `collection().doc().set/get/delete/onSnapshot`, `add`). Gravações não travam sem internet (resolvem em até 1,5 s e sobem depois).
  - `assets` → fotos **reduzidas** (JPEG ≤ ~700 KB em base64) guardadas na coleção `fotos` (`{d: dataURL}`), sem Firebase Storage (que exigiria plano pago). `fotoSrc(id)` devolve `foto:<id>` e um MutationObserver troca pelo dataURL.
  - `downloads` → compartilhar (iPhone) ou baixar (computador).
  - `sample` → API da Anthropic direto do navegador, **opcional**, com a chave guardada só no aparelho (Configurações → Claude). Sem chave, `sample` é `null` e o app desliga Perguntar / leitura de PDF / princípio ativo automático (o XML da NF-e funciona sem Claude).
  - `user` → Firebase Auth (e-mail/senha) + coleção `usuarios/{uid}` `{nome, email}` para o "lançado por".
- `ponte.css` — tela de login, avisos, regras globais (`[hidden]`).
- `config.js` — `window.FIREBASE_CONFIG` do projeto (não é segredo).
- `firestore.rules` — **só os e-mails da lista** leem/gravam. Mudou a lista? Copiar o arquivo no Console do Firebase → Firestore → Regras → Publicar.
- `sw.js` + `manifest.webmanifest` + `icone-*.png` — app instalável no iPhone (Compartilhar → Adicionar à Tela de Início) e que abre sem sinal.

## Publicação
Hospedado no **GitHub Pages** (repositório do Luis). Publicar = commit + push na branch `main`; em ~1 min está no ar.
Ao publicar mudança no app: **suba o número em `versao.js`** (`n` e `data`, mostrados em Configurações → "Versão N") **e o cache em `sw.js`** (`diario-vN`, mesmo N). O botão "Procurar atualização" compara com `versao.js` do servidor, limpa o cache e recarrega.

## Regras do negócio (não quebrar)
- Safra vai de **julho a junho** (`safraDe(iso)`).
- Talhões, depósitos, culturas e capacidade do tanque vêm de `config/propriedade` (`{nome, talhoes:[{id,n,ha}], depositos, culturas, tanque}`); renomear talhão propaga para registros/notas/benfeitorias.
- Estoque: baixa = dose × fator de conversão × área, **só de atividades executadas**; programadas apenas **reservam**. Cada produto do registro guarda o custo do momento (`custoUnit, unidadeEst, custoHa`); o registro guarda `custoHa, custoTotal, semCusto`.
- Atividade **programada** (vermelho) × **executada** (verde).
- Colheita: romaneios `{numero, sacas, data, hora, local}`; divisão `divisao:{f1, f2}` em % para os dois funcionários (config/graos), o resto é da Lavoura.
- Titulares dos grãos: `lavoura`, `f1`, `f2`, `pai`. O arrendamento do pai (padrão 2000 sc de soja/ano) **só sai da parte da Lavoura**, nunca da parte dos funcionários (movimento `arrendamento`, mesmo local).
- Sacas de 60 kg. Depósitos padrão: Coamo, Casarão, C.Vale, Baggio, Alfa.

## Coleções do Firestore
`registros` (plantio, aplicacao, adubacao, mecanizacao, colheita, ocorrencia, chuva — com `situacao` executada|programada), `estoque`, `graos`, `maquinas`, `manutencoes`, `diesel`, `benfeitorias`, `servicos_benf`, `notas`, `fin_contas`, `fin_lanc`, `config` (`propriedade`, `graos`, `backup`, `financeiro`), `fotos`, `usuarios`, `lixeira`, `planilha_backup`.
Backup: Histórico → Excel / JSON (todas as coleções menos fotos) e "Baixar todas as fotos (.zip)". "Restaurar backup" lê o JSON.
Backup mensal: cada download de backup completo (JSON ou Excel) grava `config/backup` `{ultimo, mes:"AAAA-MM", tipo, por, nome}`. Enquanto `mes` ≠ mês atual (e o app tem dados), aparece o aviso vermelho piscante `#bk-alerta` abaixo do cabeçalho, com botão que baixa o JSON. Vale para os dois usuários (backup feito por um apaga o aviso do outro).
Lixeira: todo `delete()` feito pelo app passa pela ponte, que copia o documento para `lixeira/{auto}` `{colecao, docId, dados, excluidoEm, por, nome}` antes de apagar (exceto `lixeira`, `fotos`, `usuarios`). Fotos não são apagadas na hora: ganham `excluidoEm` e só somem depois de 30 dias. `lixeira.js` mostra a caixa em Histórico (recuperar / apagar de vez). Uma vez por dia, cada aparelho apaga o que passou de 30 dias.
Backup automático no Google Drive: `automacao/backup-google-drive.gs` (Google Apps Script na conta do Luis, gatilho diário 3h). Lê o Firestore via REST com o token do dono (ignora as regras), grava `diario-lavoura-backup-AAAA-MM.json` (mesmo formato do app) na pasta "Diário da Lavoura - Backups" do Drive, copia fotos novas para "Fotos" e grava `config/backup` (tipo `drive`). Planilha: o app, uma vez por dia (20 s após abrir), gera a mesma planilha do botão Excel (`planilhaBackup()`) e grava em `planilha_backup/p0..pN` (base64 em partes de 700 KB) + `config/planilha` `{dia, geradoEm, partes, bytes}`; o script monta o .xlsx e mantém "Diário da Lavoura - dados atuais.xlsx" + uma cópia por mês. Se mudar o formato do backup no app, atualizar o script também.
Aba Perguntar: sem chave da API, só aparece "Perguntar no Claude" (`#ask-claude`), que copia e abre `https://claude.ai/new?q=Diário da Lavoura: <pergunta>`; a habilidade `diario-da-lavoura` (conta Claude do Luis/irmã) lê "Diário da Lavoura - dados atuais.xlsx" no Drive via conector. Com chave, aparece também "Perguntar" (resposta via API na própria aba).
Financeiro: `financeiro.js` + `financeiro.css` (grupo "Financeiro" do menu: `fin_resumo`, `fin_contas`, `fin_caixa`, `fin_safra`). Não há divisão entre os sócios: tudo é da Lavoura; "Nota em nome de" (`titular`) só registra o destinatário da NF (Luis ou irmã) para um futuro controle de IR.
  - `fin_contas` `{nome, tipo: banco|coop|especie|cartao, saldoInicial, dataInicial}`. Cartão: saldo negativo = fatura; pagar a fatura = transferência.
  - `fin_lanc` `{natureza: pagar|receber|transf, descricao, pessoa, categoria, forma, competencia, vencimento, valor, status: aberto|pago, pagoEm, valorPago, contaId, contaDestino, parcela, grupo, nf, chave, titular, itens:[{desc,valor}], origem, quitGraos:{sacas,cultura,local,grId}, obs}`. Uma parcela = um documento.
  - Do Diário para o Financeiro (Resumo): entradas do estoque (agrupadas por NF), diesel (entradas), manutenções, serviços de benfeitorias e vendas de grãos com valor, a partir de `config/financeiro.inicio`, aparecem como pendências; "Lançar" abre o formulário preenchido e grava `origem` (`est|…`, `ds|id`, `mq|id`, `bf|id`, `gr|id`); "Ignorar" guarda a chave em `config/financeiro.ignorados`.
  - XML da NF-e: `lerXml` (Estoque) chama `finDadosXml` (chave, destinatário, duplicatas `cobr/dup`, itens); a entrada do estoque guarda `chave`; com a caixa "Lançar também no Financeiro" marcada, `finDaNota` cria uma conta a pagar por duplicata. A aba Contas também importa XML (notas que não são de estoque). Nota com `chave` já lançada não duplica.
  - Retroativos: pendências anteriores a `inicio` ficam na aba "Retroativos" do Resumo, com "Já pago" (uma a uma) ou "Lançar todos" (lote) → `jaPago()` grava pago na data do Diário. Saldo das contas só conta movimentos a partir de `dataInicial` de cada conta, então o histórico não mexe no saldo atual; no Livro caixa a coluna de saldo some em períodos anteriores a essa data. Na aba Contas, vários XML de uma vez (`importarLote`) vão só para o Financeiro (não mexem no estoque); "já pagas" usa a data do vencimento e o que vence depois de hoje fica em aberto.
  - Financiamento (`categoria: financ`): campo `juros` por parcela; no Resultado só `jurosDe(l)` (juros + o que foi pago a mais) é custo, o resto é amortização (fora do custo, junto com investimentos). Parcela sem `juros` informado conta inteira como amortização e gera aviso.
  - Pagar com grãos: grava `quitGraos` e (opcional) um movimento `venda` em `graos` com `finId` (não vira pendência e não mexe no caixa).
  - Resultado da safra: competência; receitas = vendas de grãos do Diário + outras receitas (financiamento recebido não é receita); investimentos ficam fora do custo; arrendamento em sacas vale pelo preço médio de venda; por talhão = insumos aplicados (registros) + custos gerais rateados por área.
Layout: `layout.css` + `layout.js` — a partir de 1100 px de largura, menu lateral (`#side`) e formulários numa coluna fixa à direita; no celular nada muda.

## Como testar antes de publicar
Não há internet para o Firebase no ambiente do Claude: testar com um Firestore falso em memória (mock da API compat: `initializeApp`, `auth()`, `firestore()` com `collection/doc/set/get/delete/onSnapshot` e `firebase.firestore.Query.prototype`), servindo a pasta por HTTP e usando Playwright em tela de iPhone (430×932). Conferir o console sem erros e mandar prints ao Luis.
