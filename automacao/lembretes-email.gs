/**
 * Diário da Lavoura — lembretes por e-mail
 *
 * Roda sozinho nos servidores do Google, na conta do Luis, no MESMO projeto do backup
 * (usa lerColecao() de backup-google-drive.gs).
 * - Todo dia de manhã (entre 6h e 7h) lê os lembretes do app.
 * - Manda um e-mail para cada pessoa (Luis e irmã) com os lembretes dela (ou de "Todos") que:
 *     · vencem hoje, ou
 *     · entram hoje no período de alerta ("1 dia antes", "3 dias antes", "1 semana antes"),
 *   e junto lista os que estão atrasados.
 * - Se não houver nada novo no dia, não manda e-mail (às segundas lembra dos atrasados, se houver).
 * - O e-mail sai da conta do Luis.
 *
 * Instalação: crie um arquivo novo no projeto do backup, cole este conteúdo e rode "instalarLembretes" uma vez.
 */

const LM_APP = "https://grissluisgermano-ui.github.io/diario-lavoura/#lembretes";

/** Rode UMA vez: agenda o e-mail diário (não mexe nos outros agendamentos) e já manda o de hoje, se houver. */
function instalarLembretes() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "emailLembretes").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("emailLembretes").timeBased().everyDays(1).atHour(6).create();
  emailLembretes();
}

function emailLembretes() {
  const fuso = "America/Sao_Paulo";
  const hoje = Utilities.formatDate(new Date(), fuso, "yyyy-MM-dd");
  const segunda = Utilities.formatDate(new Date(), fuso, "u") === "1";
  const soma = (iso, d) => { const x = new Date(iso + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) };
  const br = iso => iso.split("-").reverse().join("/");
  const lembretes = lerColecao("lembretes", 300).filter(l => l.texto && !l.feito && l.data);
  const usuarios = lerColecao("usuarios", 50).filter(u => u.email);
  let enviados = 0;
  for (const u of usuarios) {
    const meus = lembretes.filter(l => !l.resp || l.resp === "todos" || l.resp === u.id);
    const inicioAviso = l => (l.aviso === null || l.aviso === undefined || l.aviso === "") ? l.data : soma(l.data, -Number(l.aviso));
    const hojeL = meus.filter(l => l.data === hoje);
    const chegando = meus.filter(l => l.data > hoje && inicioAviso(l) <= hoje);
    const novos = meus.filter(l => l.data === hoje || (l.data > hoje && inicioAviso(l) === hoje));
    const atrasados = meus.filter(l => l.data < hoje);
    if (!novos.length && !(segunda && atrasados.length)) continue;

    const ord = (a, b) => (a.data + (a.hora || "99")).localeCompare(b.data + (b.hora || "99"));
    const linha = l => `<li style="margin:0 0 8px"><b>${esc_(l.texto)}</b><br><span style="color:#5C6758;font-size:13px">${br(l.data)}${l.hora ? " às " + l.hora : ""}${l.obs ? " · " + esc_(l.obs) : ""}</span></li>`;
    const bloco = (tit, cor, itens) => itens.length ? `<h3 style="margin:18px 0 8px;font:600 13px Arial;text-transform:uppercase;letter-spacing:.06em;color:${cor}">${tit} (${itens.length})</h3><ul style="padding-left:18px;margin:0">${itens.sort(ord).map(linha).join("")}</ul>` : "";
    const html = `<div style="font:15px/1.45 Arial,sans-serif;color:#1C2419;max-width:560px">
      <p>Bom dia${u.nome ? ", " + esc_(u.nome.split(" ")[0]) : ""}! Estes são os lembretes do Diário da Lavoura:</p>
      ${bloco("Atrasados", "#B03A2B", atrasados)}${bloco("Hoje", "#A86D12", hojeL)}${bloco("Chegando", "#2F6B3A", chegando)}
      <p style="margin-top:22px"><a href="${LM_APP}" style="background:#2F6B3A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Abrir os lembretes</a></p>
      <p style="color:#5C6758;font-size:12px;margin-top:22px">E-mail automático do Diário da Lavoura. Marque como feito no app para parar de receber.</p></div>`;
    const texto = [atrasados.length ? "Atrasados:\n" + atrasados.sort(ord).map(l => `- ${l.texto} (${br(l.data)})`).join("\n") : "",
      hojeL.length ? "Hoje:\n" + hojeL.sort(ord).map(l => `- ${l.texto}${l.hora ? " às " + l.hora : ""}`).join("\n") : "",
      chegando.length ? "Chegando:\n" + chegando.sort(ord).map(l => `- ${l.texto} (${br(l.data)})`).join("\n") : ""].filter(Boolean).join("\n\n") + "\n\n" + LM_APP;
    const n = hojeL.length + chegando.length + atrasados.length;
    const assunto = `Lembretes da lavoura: ${hojeL.length ? hojeL.length + " para hoje" : ""}${hojeL.length && (chegando.length || atrasados.length) ? ", " : ""}${chegando.length ? chegando.length + " chegando" : ""}${chegando.length && atrasados.length ? ", " : ""}${atrasados.length ? atrasados.length + " atrasado" + (atrasados.length > 1 ? "s" : "") : ""}` || `Lembretes da lavoura (${n})`;
    GmailApp.sendEmail(u.email, assunto, texto, { htmlBody: html, name: "Diário da Lavoura" });
    enviados++;
  }
  console.log(`${lembretes.length} lembretes com data em aberto; ${enviados} e-mails enviados.`);
}

function esc_(s) { return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])) }
