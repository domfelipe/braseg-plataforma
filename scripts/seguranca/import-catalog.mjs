#!/usr/bin/env node
/**
 * Importa os catálogos canônicos do módulo Segurança do Trabalho:
 *  - eSocial S-1.3, Tabela 24 (Agentes Nocivos) — grupos QUÍMICOS/FÍSICOS/BIOLÓGICOS/OUTROS/AUSÊNCIA
 *  - NRs vigentes (gov.br)
 * Gera db/seguranca/catalogs.sql (INSERT idempotente ON CONFLICT DO UPDATE).
 *
 * Uso:
 *   node scripts/seguranca/import-catalog.mjs
 *   node scripts/seguranca/import-catalog.mjs --esocial /path/tabelas.html --nrs /path/nrs.html
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ESOCIAL_URL = "https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-06-2026/tabelas.html#24";
const NRS_URL = "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/ctpp-nrs/normas-regulamentadoras-nrs";
const LAYOUT_VERSION = "S-1.3";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const esocialSrc = arg("--esocial", ESOCIAL_URL);
const nrsSrc = arg("--nrs", NRS_URL);
const outPath = arg("--out", join(dirname(fileURLToPath(import.meta.url)), "../../db/seguranca/catalogs.sql"));

async function load(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, { headers: { "user-agent": "import-catalog/1.0" } });
    if (!res.ok) throw new Error("HTTP " + res.status + " ao baixar " + source);
    return res.text();
  }
  return readFileSync(source, "utf8");
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&eacute;/gi, "é").replace(/&atilde;/gi, "ã").replace(/&ccedil;/gi, "ç")
    .replace(/&aacute;/gi, "á").replace(/&iacute;/gi, "í").replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú").replace(/&ecirc;/gi, "ê").replace(/&ocirc;/gi, "ô")
    .replace(/&quot;/g, "\"")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const MAIN_GROUPS = new Map([
  ["QUÍMICOS", "QUÍMICOS"],
  ["FÍSICOS", "FÍSICOS"],
  ["BIOLÓGICOS", "BIOLÓGICOS"],
  ["OUTROS AGENTES NOCIVOS", "OUTROS"],
  ["AUSÊNCIA DE AGENTES NOCIVOS OU ATIVIDADES ESPECIAIS", "AUSÊNCIA"],
]);

const COLUMN_HEADERS = new Set(["CÓDIGO", "AGENTE NOCIVO", "DESCRIÇÃO", "DESCRIÇÃO DO BENEFÍCIO", "PROCEDIMENTO", "TABELA 24 - AGENTES NOCIVOS E ATIVIDADES - APOSENTADORIA ESPECIAL"]);

function parseEsocialAgents(html) {
  const anchor = html.indexOf('id="24"');
  if (anchor === -1) throw new Error('Anchor id="24" não encontrado na página eSocial');
  let chunk = html.slice(anchor);
  const stopAt = chunk.indexOf("DESCRIÇÃO DO BENEFÍCIO");
  if (stopAt !== -1) chunk = chunk.slice(0, stopAt);

  const lines = stripTags(chunk);
  const agents = [];
  let group = "";
  let subgroup = "";
  let expectDesc = false;
  let lastCode = null;

  const codeRe = /^\d{2}\.\d{2}\.\d{3}$/;
  const capsRe = /^[A-ZÀ-ÚÇÃÕ0-9 &\-]{4,}$/;

  for (const line of lines) {
    if (codeRe.test(line)) {
      if (line.startsWith("25.")) break; // fim da parte de agentes (ATIVIDADES)
      lastCode = line;
      agents.push({ code: line, grp: group || "OUTROS", subgroup, agent: "" });
      expectDesc = true;
      continue;
    }
    if (expectDesc) {
      if (MAIN_GROUPS.has(line)) {
        expectDesc = false;
        group = MAIN_GROUPS.get(line);
        subgroup = "";
        continue;
      }
      if (COLUMN_HEADERS.has(line)) {
        expectDesc = false;
        continue;
      }
      if (capsRe.test(line)) {
        // linha em CAIXA ALTA logo após o código não é descrição — próxima entidade
        expectDesc = false;
        subgroup = line;
        continue;
      }
      const last = agents[agents.length - 1];
      if (last) last.agent = last.agent ? last.agent + " " + line : line;
      continue;
    }
    if (MAIN_GROUPS.has(line)) {
      group = MAIN_GROUPS.get(line);
      subgroup = "";
      continue;
    }
    if (capsRe.test(line) && !COLUMN_HEADERS.has(line)) {
      subgroup = line;
    }
  }
  // Descrições não podem capturar o cabeçalho da tabela seguinte
  for (const a of agents) {
    a.agent = a.agent.replace(/\s+Tabela \d{1,2}.*$/s, "").trim();
  }
  const out = agents.filter((a) => a.agent !== "");
  if (out.length === 0) throw new Error("Nenhum agente extraído da Tabela 24");
  return out;
}

function parseNrs(html) {
  const nrs = [];
  const seen = new Set();
  const re = /<a[^>]+href="([^"]+)"[^>]*>(NR-\d{1,2})\s*[-–—]?\s*([^<]{4,180})<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[2];
    const num = raw.replace(/\D/g, "");
    const code = "NR-" + num.padStart(2, "0");
    if (seen.has(code)) continue;
    let title = m[3].replace(/\s+/g, " ").trim();
    const revoked = /REVOGAD/i.test(title);
    if (revoked) title = title.replace(/\s*\(REVOGAD[^)]*\)/i, "").trim();
    seen.add(code);
    nrs.push({ code, title, active: !revoked, url: m[1] });
  }
  if (nrs.length === 0) throw new Error("Nenhuma NR extraída");
  return nrs;
}

function q(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function buildSql(agents, nrs) {
  const lines = [];
  lines.push("-- Catálogos canônicos do módulo Segurança do Trabalho (GERADO — não edite manualmente)");
  lines.push("-- Fonte: gov.br eSocial " + LAYOUT_VERSION + " Tabela 24 + lista de NRs · scripts/seguranca/import-catalog.mjs");
  lines.push("");
  lines.push("INSERT INTO seg_esocial_tables (code, name, layout_version) VALUES");
  lines.push("  ('24', 'Agentes Nocivos - Aposentadoria Especial', " + q(LAYOUT_VERSION) + ")");
  lines.push("ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, layout_version = EXCLUDED.layout_version;");
  lines.push("");
  lines.push("INSERT INTO seg_esocial_agents (code, table_code, grp, subgroup, agent, active) VALUES");
  agents.forEach((a, i) => {
    const comma = i === agents.length - 1 ? "" : ",";
    lines.push("  (" + q(a.code) + ", '24', " + q(a.grp) + ", " + q(a.subgroup) + ", " + q(a.agent) + ", true)" + comma);
  });
  lines.push("ON CONFLICT (code) DO UPDATE SET grp = EXCLUDED.grp, subgroup = EXCLUDED.subgroup, agent = EXCLUDED.agent, active = EXCLUDED.active;");
  lines.push("");
  lines.push("INSERT INTO seg_nrs (code, title, summary, url, active) VALUES");
  nrs.forEach((n, i) => {
    const comma = i === nrs.length - 1 ? "" : ",";
    lines.push("  (" + q(n.code) + ", " + q(n.title) + ", NULL, " + q(n.url) + ", " + n.active + ")" + comma);
  });
  lines.push("ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, active = EXCLUDED.active;");
  lines.push("");
  return lines.join("\n");
}

const [esocialHtml, nrsHtml] = await Promise.all([load(esocialSrc), load(nrsSrc)]);
const agents = parseEsocialAgents(esocialHtml);
const nrs = parseNrs(nrsHtml);
const sql = buildSql(agents, nrs);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sql);

const byGroup = new Map();
for (const a of agents) byGroup.set(a.grp, (byGroup.get(a.grp) ?? 0) + 1);
console.log("✔ Agentes eSocial extraídos:", agents.length, Object.fromEntries(byGroup));
console.log("✔ NRs extraídas:", nrs.length, "(revogadas marcadas inativas:", nrs.filter((n) => !n.active).length + ")");
console.log("✔ SQL gerado em:", outPath);
