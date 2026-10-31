/**
 * Diário da Lavoura — backup automático no Google Drive
 *
 * Roda sozinho nos servidores do Google (Google Apps Script), na conta do Luis, de graça.
 * - Todo dia de madrugada confere se o backup do mês já existe. Se não existir, lê o banco do
 *   Firebase e grava "diario-lavoura-backup-AAAA-MM.json" na pasta "Diário da Lavoura - Backups" do Drive.
 *   O arquivo é o mesmo formato do botão "Baixar backup completo (.json)" do app e pode ser
 *   restaurado em Histórico → Restaurar backup.
 * - Planilha Excel: mantém "Diário da Lavoura - dados atuais.xlsx" sempre atualizada (o app gera a planilha
 *   uma vez por dia quando alguém abre) e guarda uma cópia por mês, "diario-lavoura-planilha-AAAA-MM.xlsx".
 * - Copia as fotos novas (JPG) para a subpasta "Fotos".
 * - Avisa o app que o backup do mês foi feito (o aviso vermelho some).
 *
 * Instalação: cole este arquivo em script.google.com, ajuste o appsscript.json e rode "instalar" uma vez.
 */

const PROJETO = "diario-lavoura";
const PASTA = "Diário da Lavoura - Backups";
const COLECOES = ["config", "registros", "notas", "estoque", "graos", "maquinas", "manutencoes", "diesel", "benfeitorias", "servicos_benf", "fin_contas", "fin_lanc"];
const LIMITE_MS = 5 * 60 * 1000; // o Google corta o script em 6 min; paramos antes e continuamos no dia seguinte
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

/** Rode esta função UMA vez: autoriza o acesso e agenda a execução diária (entre 3h e 4h). */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("backupDiario").timeBased().everyDays(1).atHour(3).create();
  backupDiario(true);
}

/** Executada todo dia pelo agendamento. Com forcar=true refaz o backup do mês mesmo que já exista. */
function backupDiario(forcar) {
  const inicio = Date.now();
  const tz = Session.getScriptTimeZone() || "America/Sao_Paulo";
  const mes = Utilities.formatDate(new Date(), tz, "yyyy-MM");
  const pasta = pegaPasta(PASTA, DriveApp.getRootFolder());
  const nome = `diario-lavoura-backup-${mes}.json`;

  const existe = pasta.getFilesByName(nome).hasNext();
  if (!existe || forcar === true) {
    const colecoes = {};
    for (const c of COLECOES) {
      let docs = lerColecao(c, 300);
      if (c === "config") docs = docs.filter(d => d.id === "graos" || d.id === "propriedade" || d.id === "financeiro");
      colecoes[c] = docs;
    }
    const total = Object.values(colecoes).reduce((s, l) => s + l.length, 0);
    const json = JSON.stringify({ app: "Diário da Lavoura", versao: 1, geradoEm: new Date().toISOString(), automatico: true, colecoes }, null, 1);
    if (existe) pasta.getFilesByName(nome).next().setTrashed(true);
    pasta.createFile(nome, json, "application/json");
    gravarDoc("config/backup", { ultimo: new Date().toISOString(), mes, tipo: "drive", por: null, nome: "Backup automático (Google Drive)" });
    console.log(`Backup ${nome} gravado com ${total} documentos.`);
  } else {
    console.log(`Backup ${nome} já existe.`);
  }

  try { salvarPlanilha(pasta, mes) } catch (e) { console.warn("Planilha: " + e.message) }
  copiarFotos(pegaPasta("Fotos", pasta), inicio);
}

/* ---------- Planilha Excel (gerada pelo próprio app e guardada no banco em partes) ---------- */
function salvarPlanilha(pasta, mes) {
  let info;
  try { info = deFirestore({ mapValue: { fields: chamar(`${BASE}/config/planilha`).fields || {} } }) } catch (e) { console.log("Ainda não há planilha no banco (o app gera ao ser aberto)."); return }
  const props = PropertiesService.getScriptProperties();
  const nomeMes = `diario-lavoura-planilha-${mes}.xlsx`, nomeAtual = "Diário da Lavoura - dados atuais.xlsx";
  const precisaAtual = props.getProperty("planilhaCopiada") !== info.geradoEm || !pasta.getFilesByName(nomeAtual).hasNext();
  const precisaMes = !pasta.getFilesByName(nomeMes).hasNext();
  if (!precisaAtual && !precisaMes) { console.log("Planilha já está em dia."); return }
  let b64 = "";
  for (let i = 0; i < info.partes; i++) b64 += chamar(`${BASE}/planilha_backup/p${i}`).fields.d.stringValue;
  const tipo = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const bytes = Utilities.base64Decode(b64);
  if (precisaAtual) {
    const it = pasta.getFilesByName(nomeAtual); while (it.hasNext()) it.next().setTrashed(true);
    pasta.createFile(Utilities.newBlob(bytes, tipo, nomeAtual));
    props.setProperty("planilhaCopiada", info.geradoEm);
  }
  if (precisaMes) pasta.createFile(Utilities.newBlob(bytes, tipo, nomeMes));
  console.log(`Planilha de ${info.dia} copiada para o Drive.`);
}

/* ---------- Fotos ---------- */
function copiarFotos(pastaFotos, inicio) {
  // nomes das fotos que já estão no Drive
  const ja = new Set(); const it = pastaFotos.getFiles();
  while (it.hasNext()) ja.add(it.next().getName().replace(/\.jpg$/, ""));
  // lista só os códigos das fotos (sem baixar a imagem), depois baixa uma a uma as que faltam
  const ids = []; let token = "";
  do {
    const r = chamar(`${BASE}/fotos?pageSize=300&mask.fieldPaths=excluidoEm${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
    for (const d of r.documents || []) ids.push(d.name.split("/").pop());
    token = r.nextPageToken || "";
  } while (token);
  let novas = 0;
  for (const id of ids) {
    if (ja.has(id)) continue;
    if (Date.now() - inicio > LIMITE_MS) { console.log(`${novas} fotos copiadas; o resto continua amanhã.`); return }
    const d = chamar(`${BASE}/fotos/${id}`);
    const m = (d.fields?.d?.stringValue || "").match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (m) { pastaFotos.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], id + ".jpg")); novas++ }
  }
  console.log(`${novas} fotos novas copiadas (${ids.length} no app).`);
}

/* ---------- Firestore (REST) ---------- */
function chamar(url, opcoes) {
  const resp = UrlFetchApp.fetch(url, Object.assign({
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "x-goog-user-project": PROJETO },
    muteHttpExceptions: true, contentType: "application/json",
  }, opcoes || {}));
  const cod = resp.getResponseCode();
  if (cod >= 300) throw new Error(`Firestore respondeu ${cod}: ${resp.getContentText().slice(0, 300)}`);
  return JSON.parse(resp.getContentText() || "{}");
}
function lerColecao(col, tam) {
  const out = []; let token = "";
  do {
    const r = chamar(`${BASE}/${col}?pageSize=${tam}${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
    for (const d of r.documents || []) out.push(Object.assign({ id: d.name.split("/").pop() }, deFirestore({ mapValue: { fields: d.fields || {} } })));
    token = r.nextPageToken || "";
  } while (token);
  return out;
}
function gravarDoc(caminho, obj) {
  chamar(`${BASE}/${caminho}`, { method: "patch", payload: JSON.stringify({ fields: paraFirestore(obj).mapValue.fields }) });
}
function deFirestore(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(deFirestore);
  if ("mapValue" in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = deFirestore(x); return o }
  return null;
}
function paraFirestore(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "string") return { stringValue: x };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(paraFirestore) } };
  const fields = {}; for (const [k, v] of Object.entries(x)) fields[k] = paraFirestore(v);
  return { mapValue: { fields } };
}

/* ---------- Drive ---------- */
function pegaPasta(nome, mae) {
  const it = mae.getFoldersByName(nome);
  return it.hasNext() ? it.next() : mae.createFolder(nome);
}
