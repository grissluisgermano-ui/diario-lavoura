// Diário da Lavoura — lista de defensivos do AGROFIT (MAPA, dados abertos, licença CC BY).
// Roda toda semana no GitHub (".github/workflows/agrofit.yml"): baixa o arquivo "Produto Formulado" do MAPA,
// guarda um produto por registro ativo e grava dados/agrofit.json (o app usa para preencher o princípio ativo e a classe)
// e dados/agrofit-manifest.json (data da lista). Só grava se a lista mudou.
// Leitura do CSV baseada em github.com/RenanRB/agrofit-catalog (MIT).
//   node automacao/agrofit/atualiza.mjs            → baixa do MAPA
//   node automacao/agrofit/atualiza.mjs arquivo.csv → usa um arquivo local
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';

const FONTE = 'https://dados.agricultura.gov.br/dataset/6c913699-e82e-4da3-a0a1-fb6c431e367f/resource/d30b30d7-e256-484e-9ab8-cd40974e1238/download/agrofitprodutosformulados.csv';
const SAIDA = new URL('../../dados/agrofit.json', import.meta.url);
const MANIFESTO = new URL('../../dados/agrofit-manifest.json', import.meta.url);
const COLS = ['NR_REGISTRO', 'MARCA_COMERCIAL', 'FORMULACAO', 'INGREDIENTE_ATIVO', 'TITULAR_DE_REGISTRO', 'CLASSE', 'SITUACAO'];
const MINIMO = 1000;

function leitorCsv(linha, sep = ';') {
  let row = [], cel = '', aspas = false, pend = false;
  const fimCel = () => { row.push(cel); cel = '' };
  const fimLinha = () => { fimCel(); if (row.length > 1 || row[0] !== '') linha(row); row = [] };
  return {
    push(t) {
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (pend) { pend = false; if (ch === '"') { cel += '"'; continue } aspas = false }
        if (aspas) { if (ch === '"') pend = true; else cel += ch }
        else if (ch === '"' && cel.trim() === '') { cel = ''; aspas = true }
        else if (ch === sep) fimCel();
        else if (ch === '\n') fimLinha();
        else if (ch !== '\r') cel += ch;
      }
    },
    end() { if (pend) aspas = false; if (cel !== '' || row.length) fimLinha() },
  };
}
const C1 = new TextDecoder('windows-1252');
const limpa = s => String(s ?? '').replace(/[\u0080-\u009f]/g, ch => C1.decode(new Uint8Array([ch.charCodeAt(0)]))).replace(/\s+/g, ' ').trim();
const marcas = raw => [...new Set(limpa(raw).split(/;|,\s/).map(limpa).filter(Boolean))];

const prods = new Map(); let idx = null;
const parser = leitorCsv(cells => {
  if (!idx) {
    idx = Object.fromEntries(cells.map((h, i) => [limpa(h).replace(/^﻿/, ''), i]));
    const falta = COLS.filter(c => !(c in idx)); if (falta.length) throw new Error('Colunas do AGROFIT mudaram, faltam: ' + falta.join(', '));
    return;
  }
  const g = c => limpa(cells[idx[c]]);
  if (g('SITUACAO').toUpperCase() !== 'TRUE') return;
  const r = g('NR_REGISTRO'); if (!/^\d{1,8}$/.test(r)) return;
  const ja = prods.get(r);
  if (ja) { for (const b of marcas(cells[idx.MARCA_COMERCIAL])) if (!ja.b.includes(b)) ja.b.push(b); return }
  const b = marcas(cells[idx.MARCA_COMERCIAL]); if (!b.length) return;
  prods.set(r, { r, b, f: g('FORMULACAO'), a: g('INGREDIENTE_ATIVO'), h: g('TITULAR_DE_REGISTRO'), c: g('CLASSE') });
});
const fonte = process.argv[2] ? createReadStream(process.argv[2])
  : Readable.fromWeb((await (async () => { const r = await fetch(FONTE, { headers: { 'User-Agent': 'diario-lavoura (github.com/grissluisgermano-ui/diario-lavoura)' } }); if (!r.ok) throw new Error('MAPA respondeu ' + r.status); return r })()).body);
const dec = new TextDecoder('utf-8');
for await (const ch of fonte) parser.push(dec.decode(ch, { stream: true }));
parser.push(dec.decode()); parser.end();
const lista = [...prods.values()].sort((x, y) => x.b[0].localeCompare(y.b[0], 'pt-BR') || x.r.localeCompare(y.r));
if (lista.length < MINIMO) throw new Error(`Só ${lista.length} produtos: mantendo a lista anterior`);
let antes = null; try { antes = JSON.parse(await readFile(SAIDA, 'utf8')) } catch {}
if (antes && JSON.stringify(antes.p) === JSON.stringify(lista)) { console.log(`[agrofit] sem mudança (${lista.length} produtos)`); process.exit(0) }
const atualizadoEm = new Date().toISOString();
await writeFile(SAIDA, JSON.stringify({ fonte: 'AGROFIT – Produto Formulado (MAPA, dados abertos, CC BY)', atualizadoEm, p: lista }));
await writeFile(MANIFESTO, JSON.stringify({ atualizadoEm, produtos: lista.length }) + '\n');
console.log(`[agrofit] ${antes ? antes.p.length : 0} → ${lista.length} produtos`);
