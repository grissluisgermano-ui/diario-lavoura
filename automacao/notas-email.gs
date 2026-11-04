/**
 * Diário da Lavoura — notas fiscais que chegam por e-mail
 *
 * Roda sozinho nos servidores do Google, na conta do Luis, no MESMO projeto do backup
 * (usa as funções chamar() e paraFirestore() de backup-google-drive.gs).
 * - A cada 30 minutos procura no Gmail e-mails com XML de NF-e anexado (solto ou dentro de um .zip).
 *   O PDF da nota é ignorado: o app monta a DANFE a partir do XML.
 * - Guarda cada nota no banco do app (coleção "nfe", com origem "email"). No app ela aparece em
 *   Estoque → "Notas recebidas por e-mail", com os botões Lançar no estoque / Só no Financeiro / DANFE / Ignorar.
 * - Procura também no Spam: se a nota caiu lá, tira do Spam e põe na caixa de entrada.
 * - Marca o e-mail com a etiqueta "Diário/Notas importadas" (só para você ver no Gmail). Quais e-mails já foram lidos
 *   fica guardado no próprio script, e-mail por e-mail: assim, quando a Coamo manda duas notas com o mesmo assunto e o
 *   Gmail junta as duas na mesma conversa, a segunda também é lida.
 * - Nota cancelada (XML do evento de cancelamento) fica marcada como cancelada no app.
 *
 * Instalação: crie um arquivo novo no projeto do backup, cole este conteúdo, inclua o acesso ao Gmail
 * no appsscript.json e rode "instalarNotas" uma vez.
 */

const NOTAS_ETIQUETA = "Diário/Notas importadas";
// in:anywhere -in:trash: procura também no Spam (a nota da Coamo já caiu lá); a conversa é tirada do Spam
const NOTAS_BUSCA = 'in:anywhere -in:trash has:attachment (filename:xml OR filename:zip) newer_than:%Dd';
const NOTAS_LIDAS = "notasLidas"; // {idDoEmail: data em ms} dos últimos 20 dias

/** Rode UMA vez: autoriza o Gmail e agenda a leitura a cada 30 minutos (não mexe no agendamento do backup). */
function instalarNotas() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "importarNotasEmail").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("importarNotasEmail").timeBased().everyMinutes(30).create();
  importarNotasEmail();
}

function importarNotasEmail() {
  const etiqueta = GmailApp.getUserLabelByName(NOTAS_ETIQUETA) || GmailApp.createLabel(NOTAS_ETIQUETA);
  const props = PropertiesService.getScriptProperties();
  let lidas = {}; try { lidas = JSON.parse(props.getProperty(NOTAS_LIDAS) || "{}") } catch (e) { lidas = {} }
  const primeira = !Object.keys(lidas).length;
  const conversas = GmailApp.search(NOTAS_BUSCA.replace("%D", primeira ? 60 : 10), 0, 100);
  let novas = 0, repetidas = 0, canceladas = 0, emails = 0;
  let doSpam = 0;
  for (const conversa of conversas) {
    let temNota = false;
    for (const msg of conversa.getMessages()) {
      const id = msg.getId(); if (lidas[id]) continue;
      emails++;
      for (const anexo of msg.getAttachments()) {
        for (const xml of xmlsDoAnexo(anexo)) {
          const r = guardarXmlNota(xml, msg);
          if (r) temNota = true;
          if (r === "nova") novas++; else if (r === "repetida") repetidas++; else if (r === "cancelada") canceladas++;
        }
      }
      lidas[id] = Date.now();
    }
    if (temNota && conversa.isInSpam()) { conversa.moveToInbox(); doSpam++ }
    if (temNota) conversa.addLabel(etiqueta);
  }
  const limite = Date.now() - 20 * 864e5;
  for (const k of Object.keys(lidas)) if (lidas[k] < limite) delete lidas[k];
  props.setProperty(NOTAS_LIDAS, JSON.stringify(lidas));
  console.log(`${emails} e-mails novos lidos: ${novas} notas novas, ${repetidas} já estavam no app, ${canceladas} cancelamentos${doSpam ? `, ${doSpam} tirados do Spam` : ""}.`);
}

/** Textos XML de um anexo: o próprio .xml, ou os .xml de dentro de um .zip (inclusive em subpastas). */
function xmlsDoAnexo(anexo) {
  const nome = anexo.getName() || "", tipo = anexo.getContentType() || "";
  try {
    if (/\.xml$/i.test(nome) || /xml/i.test(tipo)) return [anexo.getDataAsString("UTF-8")];
    if (/\.zip$/i.test(nome) || /zip/i.test(tipo)) {
      const blob = anexo.copyBlob(); blob.setContentType("application/zip");
      return Utilities.unzip(blob).filter(b => /\.xml$/i.test(b.getName() || "")).map(b => b.getDataAsString("UTF-8"));
    }
  } catch (e) { console.log(`Não consegui abrir o anexo ${nome}: ${e}`) }
  return [];
}

/** Lê um XML anexado. Devolve "nova", "repetida", "cancelada" ou "" (não é NF-e). */
function guardarXmlNota(xml, msg) {
  const tag = (txt, n) => { const m = txt.match(new RegExp(`<(?:\\w+:)?${n}>([^<]*)</(?:\\w+:)?${n}>`)); return m ? m[1].trim() : "" };
  // Evento de cancelamento: marca a nota como cancelada
  if (/<procEventoNFe/i.test(xml) && /<tpEvento>110111</.test(xml)) {
    const chave = tag(xml, "chNFe"); if (!/^\d{44}$/.test(chave)) return "";
    try { chamar(`${BASE}/nfe/${chave}?updateMask.fieldPaths=cancelada`, { method: "patch", payload: JSON.stringify({ fields: { cancelada: { booleanValue: true } } }) }); return "cancelada" }
    catch (e) { return "" }
  }
  if (!/<infNFe/i.test(xml)) return "";
  let chave = tag(xml, "chNFe");
  if (!/^\d{44}$/.test(chave)) { const m = xml.match(/Id="NFe(\d{44})"/); chave = m ? m[1] : "" }
  if (!chave) return "";
  if (existeDoc(`nfe/${chave}`)) return "repetida";
  const bloco = (n) => { const m = xml.match(new RegExp(`<(?:\\w+:)?${n}[ >][\\s\\S]*?</(?:\\w+:)?${n}>`)); return m ? m[0] : "" };
  gravarDoc(`nfe/${chave}`, {
    xml, origem: "email",
    numero: tag(xml, "nNF"), data: (tag(xml, "dhEmi") || tag(xml, "dEmi")).slice(0, 10),
    emit: tag(bloco("emit"), "xNome"), dest: tag(bloco("dest"), "xNome"), total: Number(tag(bloco("ICMSTot"), "vNF")) || 0,
    assunto: msg.getSubject().slice(0, 200), recebidaEm: msg.getDate().toISOString(), criadoEm: new Date().toISOString(),
  });
  return "nova";
}

function existeDoc(caminho) {
  const resp = UrlFetchApp.fetch(`${BASE}/${caminho}?mask.fieldPaths=numero`, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "x-goog-user-project": PROJETO }, muteHttpExceptions: true });
  return resp.getResponseCode() === 200;
}
