import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from "docx";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pdfMake from "pdfmake";
import type { DocumentModel } from "./model.js";
import { formatDate } from "./model.js";

/**
 * Gerador de documentos PGR/PGRTR — design editorial inspirado no material
 * real da Braseg (navy #002e5a + azul #1f3d9d + âmbar), com capa, sumário,
 * 20 seções e anexos. Renderiza PDF (pdfmake) e DOCX (docx) a partir do
 * MESMO modelo de dados.
 */

type Block =
  | { t: "h1"; text: string }
  | { t: "h2"; text: string }
  | { t: "p"; text: string; bold?: boolean; center?: boolean; small?: boolean }
  | { t: "table"; header: string[]; rows: string[][]; widths?: string[]; style?: "matrix" | "inventory" | "plain" }
  | { t: "img"; dataUrl: string; width: number }
  | { t: "pagebreak" };

const NAVY = "#002e5a";
const BLUE = "#1f3d9d";
const AMBER = "#e3a12e";
const INK = "#1f2937";
const MUTED = "#5b6572";
const LINE = "#c9d3e0";
const ZEBRA = "#f4f7fb";
const OK = "#1b7a4e";
const WARN = "#b97e1f";
const BAD = "#c0392b";

const NOMES = {
  pgr: {
    titulo: "PGR",
    completo: "PROGRAMA DE GERENCIAMENTO DE RISCOS",
    sub: "GERENCIAMENTO DE RISCOS OCUPACIONAIS — GRO",
    nr: "NR-01 | NR-09",
  },
  pgrtr: {
    titulo: "PGRTR",
    completo: "PROGRAMA DE GERENCIAMENTO DE RISCOS NO TRABALHO RURAL",
    sub: "GERENCIAMENTO DE RISCOS OCUPACIONAIS NO TRABALHO RURAL",
    nr: "NR 31 — ITEM 31.3",
  },
} as const;

function stdIntro(m: DocumentModel): string {
  if (m.tipo === "pgrtr") {
    return "O presente Programa de Gerenciamento de Riscos no Trabalho Rural (PGRTR) atende ao item 31.3 da NR-31 e constitui o documento-base do Gerenciamento de Riscos Ocupacionais (GRO) desta organização rural. Ele identifica os perigos das atividades agrícolas e florestais, avalia os riscos ocupacionais por Grupo de Exposição Similar (GES) e define medidas de prevenção, priorizadas pela matriz de risco 5×5, com acompanhamento por plano de ação e revisão periódica.";
  }
  return "O presente Programa de Gerenciamento de Riscos (PGR) atende à NR-01 (Disposições Gerais e Gerenciamento de Riscos Ocupacionais) e à NR-09 (Avaliação e Controle das Exposições Ocupacionais a Agentes Físicos, Químicos e Biológicos). Ele identifica os perigos das atividades, avalia os riscos ocupacionais por Grupo de Exposição Similar (GES) e define medidas de prevenção, priorizadas pela matriz de risco 5×5, com acompanhamento por plano de ação e revisão periódica.";
}

const MATRIX_5X5 = {
  header: ["Probabilidade \\ Severidade", "1 - Leve", "2 - Menor", "3 - Moderada", "4 - Maior", "5 - Extrema"],
  rows: [
    ["A - Rara", "2 - TOLERÁVEL", "3 - MODERADO", "4 - SUBSTANCIAL", "5 - INTOLERÁVEL", "5 - INTOLERÁVEL"],
    ["B - Pouco Provável", "2 - TOLERÁVEL", "2 - TOLERÁVEL", "3 - MODERADO", "4 - SUBSTANCIAL", "5 - INTOLERÁVEL"],
    ["C - Possível", "1 - TRIVIAL", "2 - TOLERÁVEL", "3 - MODERADO", "4 - SUBSTANCIAL", "5 - INTOLERÁVEL"],
    ["D - Provável", "1 - TRIVIAL", "2 - TOLERÁVEL", "3 - MODERADO", "3 - MODERADO", "4 - SUBSTANCIAL"],
    ["E - Muito Provável", "1 - TRIVIAL", "1 - TRIVIAL", "2 - TOLERÁVEL", "3 - MODERADO", "3 - MODERADO"],
  ],
};

const PRIORIDADE = {
  header: ["Nível de risco", "Prioridade de ação de controle"],
  rows: [
    ["1 - TRIVIAL", "Manter as medidas existentes e o monitoramento de rotina."],
    ["2 - TOLERÁVEL", "Monitorar periodicamente; avaliar melhorias de baixo custo."],
    ["3 - MODERADO", "Programar medidas de controle com prazos definidos no plano de ação."],
    ["4 - SUBSTANCIAL", "Ação prioritária: implantar controles no menor prazo viável."],
    ["5 - INTOLERÁVEL", "Ação imediata: interromper/adequar a atividade até o controle eficaz."],
  ],
};

function classificationColor(text: string): string {
  if (text.startsWith("1")) return OK;
  if (text.startsWith("2") || text.startsWith("3")) return WARN;
  return BAD;
}

/** Logo oficial da Braseg (dona do documento) — fallback silencioso sem logo. */
function brasegLogo(): { dataUrl: string; bytes: Uint8Array } | null {
  try {
    const bytes = readFileSync(join(__dirname, "braseg-original.png"));
    return { dataUrl: "data:image/png;base64," + bytes.toString("base64"), bytes };
  } catch {
    return null;
  }
}

function buildSections(m: DocumentModel, signature: string | null): Block[] {
  const N = NOMES[m.tipo];
  const blocks: Block[] = [];

  const sumario = [
    "1 Identificação da empresa",
    "2 Responsáveis pela elaboração",
    "3 Histórico de revisões",
    "4 Introdução",
    "5 Identificação",
    "6 Prioridade das Ações de Controle",
    "7 Definições",
    "8 Resumo dos Riscos e Seus Agentes",
    "9 Atribuições e Responsabilidades",
    "10 Metodologia do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR"),
    "11 Avaliações Ambientais",
    "12 Grupos de Exposição Similar (GES)",
    "13 Período de Vigência",
    "14 CARACTERIZAÇÃO GES",
    "15 Plano de Ação",
    "16 Referências Bibliográficas",
    "17 Encerramento",
    "18 Anexo 1 - Validade do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + " perante a " + (m.tipo === "pgrtr" ? "NR 31" : "NR 01"),
    "19 Anexo 2 – Matriz de Risco & Inventário de Risco",
    "20 Anexo 3 – Avaliações ambientais",
  ];
  blocks.push({ t: "h1", text: "SUMÁRIO" });
  for (const s of sumario) blocks.push({ t: "p", text: s, small: true });
  blocks.push({ t: "pagebreak" });

  // 1
  blocks.push({ t: "h1", text: "1 Identificação da empresa" });
  blocks.push({ t: "table", header: ["Campo", "Informação"], widths: ["30%", "*"], style: "plain", rows: [
    ["Razão social", m.razao_social],
    ["CNPJ", m.cnpj],
    ...(m.cnae ? [["CNAE", m.cnae] as string[]] : []),
    ...(m.grau_risco !== null ? [["Grau de risco (NR-04)", String(m.grau_risco)] as string[]] : []),
    ["Endereço", m.endereco_texto],
    ...(m.atividade_principal ? [["Atividade principal", m.atividade_principal] as string[]] : []),
    ...(m.n_funcionarios !== null ? [["Número de funcionários", String(m.n_funcionarios)] as string[]] : []),
  ] });

  // 2
  blocks.push({ t: "h1", text: "2 Responsáveis pela elaboração do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") });
  blocks.push({ t: "p", text: "Elaboração técnica: " + m.consultor });
  blocks.push({ t: "p", text: "Responsável pela empresa: " + (m.responsavel ?? m.razao_social) });

  // 3
  blocks.push({ t: "h1", text: "3 Histórico de revisões" });
  blocks.push({ t: "table", header: ["Revisão", "Data", "Descrição", "Elaborado por"], widths: ["12%", "18%", "*", "30%"], rows: [
    ["01", formatDate(m.valid_from), m.revision_note || "Emissão inicial", m.consultor],
  ] });

  // 4
  blocks.push({ t: "h1", text: "4 Introdução" });
  blocks.push({ t: "p", text: stdIntro(m) });

  // 5
  blocks.push({ t: "h1", text: "5 Identificação" });
  blocks.push({ t: "h2", text: "5.1 Objetivo" });
  blocks.push({ t: "p", text: "Estabelecer o inventário de riscos ocupacionais da organização, definir medidas de prevenção hierarquizadas e garantir a melhoria contínua das condições de segurança e saúde no trabalho." });
  blocks.push({ t: "h2", text: "5.2 Classificação do risco" });
  blocks.push({ t: "p", text: "Os riscos são classificados pela combinação da probabilidade de ocorrência (A a E) com a severidade da consequência (1 a 5), conforme a matriz de risco qualitativa 5×5." });
  blocks.push({ t: "h2", text: "5.3 MODELO – Apreciação de perigos & riscos" });
  blocks.push({ t: "p", text: "Para cada GES, identificam-se os perigos e os agentes de risco associados (codificação eSocial S-1.3, Tabela 24), seguindo-se a avaliação da exposição e a definição das medidas de controle." });
  blocks.push({ t: "h2", text: "5.4 Inventário de risco" });
  blocks.push({ t: "p", text: "O inventário consolidado de riscos encontra-se no Anexo 2 e, por GES, na seção 14." });
  blocks.push({ t: "h2", text: "5.5 Metodologia da Matriz de Risco" });
  blocks.push({ t: "p", text: "Matriz de risco qualitativa 5×5 — probabilidade × severidade:" });
  blocks.push({ t: "table", header: MATRIX_5X5.header, rows: MATRIX_5X5.rows, style: "matrix" });
  blocks.push({ t: "h2", text: "5.6 Metodologia de Ação" });
  blocks.push({ t: "p", text: "As ações de controle seguem a hierarquia de prevenção: eliminação, substituição, controles de engenharia, controles administrativos e, por último, equipamentos de proteção individual." });

  // 6
  blocks.push({ t: "h1", text: "6 Prioridade das Ações de Controle" });
  blocks.push({ t: "h2", text: "6.1 Nível de Risco" });
  blocks.push({ t: "table", header: PRIORIDADE.header, rows: PRIORIDADE.rows, widths: ["30%", "*"] });
  blocks.push({ t: "h2", text: "6.2 Registro, Manutenção e Divulgação do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") });
  blocks.push({ t: "p", text: "Este documento é mantido atualizado, divulgado aos trabalhadores e revisado conforme os gatilhos legais (mudança de processo, inadequação de medidas, acidente ou doença do trabalho e mudança de requisito legal)." });

  // 7
  blocks.push({ t: "h1", text: "7 Definições" });
  blocks.push({ t: "p", text: "Perigo: fonte com potencial de causar lesão ou agravo à saúde. Risco ocupacional: combinação da probabilidade de ocorrência de lesão ou agravo com a severidade da consequência. GES: Grupo de Exposição Similar — grupo de trabalhadores expostos de modo semelhante aos mesmos agentes. PGR/" + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + ": programa de gerenciamento de riscos previsto na " + (m.tipo === "pgrtr" ? "NR-31" : "NR-01") + "." });

  // 8
  blocks.push({ t: "h1", text: "8 Resumo dos Riscos e Seus Agentes" });
  blocks.push({ t: "table", header: ["GES", "Setor", "Agentes de risco"], widths: ["35%", "20%", "*"], rows:
    m.ges.map((g) => [g.code + " — " + g.name, g.sector ?? "-", g.agents.map((a) => a.agent).join("; ") || "-"]),
  });

  // 9
  blocks.push({ t: "h1", text: "9 Atribuições e Responsabilidades" });
  blocks.push({ t: "p", text: "Do empregador: implementar e manter o " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + ", garantir recursos para as medidas de prevenção, informar e capacitar os trabalhadores." });
  blocks.push({ t: "p", text: "Dos empregados: cumprir as medidas de prevenção, utilizar corretamente os EPIs e comunicar imediatamente situações de risco." });
  blocks.push({ t: "p", text: "Do treinamento: capacitação periódica sobre os riscos das atividades e as medidas de controle aplicáveis." });

  // 10
  blocks.push({ t: "h1", text: "10 Metodologia do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") });
  blocks.push({ t: "h2", text: "10.1 Identificação de Perigos" });
  blocks.push({ t: "p", text: "Realizada por levantamento em campo: setores, cargos e atividades, com marcação dos agentes de risco por cargo (catálogo eSocial Tabela 24) e agrupamento em GES." });
  blocks.push({ t: "h2", text: "10.2 Avaliação de Riscos Ocupacionais" });
  blocks.push({ t: "p", text: "Cada GES × agente recebe frequência (A–E) e severidade (1–5); a classificação é calculada pela matriz 5×5 e direciona a prioridade das medidas." });
  blocks.push({ t: "h2", text: "10.3 Controle dos Riscos" });
  blocks.push({ t: "p", text: "Medidas de prevenção coletivas e administrativas antes de EPI, registradas no inventário e acompanhadas pelo plano de ação." });
  if (m.tipo === "pgrtr") {
    blocks.push({ t: "h2", text: "10.4 Condições específicas do trabalho rural" });
    blocks.push({ t: "p", text: "Avaliação das condições meteorológicas antes das atividades; vestuário e EPIs adequados ao campo; proteção contra chuva, ventos fortes, frio e calor excessivo; abrigo seguro em caso de descargas atmosféricas; prevenção e conduta em caso de animais peçonhentos; manuseio seguro de agrotóxicos; operação e manutenção de máquinas agrícolas e florestais conforme fabricante." });
  }

  // 11
  blocks.push({ t: "h1", text: "11 Avaliações Ambientais" });
  blocks.push({ t: "p", text: "Quando aplicáveis, medições quantitativas (ruído, calor, agentes químicos) são realizadas conforme as NRs e os laudos são anexados a este documento. As fotos de evidência por GES integram a caracterização da seção 14." });

  // 12
  blocks.push({ t: "h1", text: "12 Grupos de Exposição Similar (GES)" });
  blocks.push({ t: "h2", text: "12.1 Caracterização dos GES" });
  for (const g of m.ges) {
    blocks.push({ t: "p", text: g.code + " — " + g.name + (g.sector ? " (" + g.sector + ")" : "") });
  }

  // 13
  blocks.push({ t: "h1", text: "13 Período de Vigência" });
  blocks.push({ t: "p", text: "Vigência: " + formatDate(m.valid_from) + " a " + formatDate(m.valid_until) + " (2 anos). Revisão obrigatória: após implementação das medidas de prevenção (riscos residuais); após inovações ou modificações em tecnologias, ambientes, processos ou organização do trabalho; quando identificadas inadequações ou ineficácias das medidas; na ocorrência de acidentes ou doenças relacionadas ao trabalho; e quando houver mudança nos requisitos legais aplicáveis." });

  // 14
  blocks.push({ t: "h1", text: "14 CARACTERIZAÇÃO GES" });
  for (const g of m.ges) {
    const gRisks = m.risks.filter((r) => r.ges_code === g.code);
    blocks.push({ t: "h2", text: g.code + " — " + g.name });
    blocks.push({ t: "p", text: "Atividades: " + (g.activities || "Não descritas.") });
    if (gRisks.length === 0) {
      blocks.push({ t: "p", text: "Nenhum risco inventariado para este GES." });
    } else {
      blocks.push({ t: "table", style: "inventory", header: ["Agente de risco", "Freq.", "Sev.", "Classificação", "Efeitos", "Medidas existentes", "Medidas propostas", "Registro e controle"],
        widths: ["18%", "6%", "6%", "14%", "14%", "14%", "14%", "14%"],
        rows: gRisks.map((r) => [
          r.agent + " (" + r.agent_code + ")",
          r.frequency,
          String(r.severity),
          r.classification,
          r.effects || "-",
          r.existing || "-",
          r.proposed || "-",
          r.record || "-",
        ]),
      });
    }
  }

  // 15
  blocks.push({ t: "h1", text: "15 Plano de Ação" });
  if (m.plan.length === 0) {
    blocks.push({ t: "p", text: "Nenhum item registrado no plano de ação." });
  } else {
    const statusLabel: Record<string, string> = { pendente: "Pendente", em_andamento: "Em andamento", concluido: "Concluído" };
    blocks.push({ t: "table", header: ["Descrição", "Origem", "Responsável", "Prazo", "Status"], widths: ["*", "22%", "16%", "12%", "14%"],
      rows: m.plan.map((p) => [p.description, p.origin ?? "-", p.responsible ?? "-", p.deadline ?? "-", statusLabel[p.status] ?? p.status]) });
  }

  // 16
  blocks.push({ t: "h1", text: "16 Referências Bibliográficas" });
  for (const n of m.nr_titles) blocks.push({ t: "p", text: n.code + " — " + n.title, small: true });
  blocks.push({ t: "p", text: "Catálogo eSocial S-1.3 — Tabela 24 (Agentes Nocivos e Atividades), versão " + m.catalog_version + ".", small: true });
  blocks.push({ t: "p", text: "www.gov.br/trabalho-e-emprego — Normas Regulamentadoras vigentes.", small: true });

  // 17
  blocks.push({ t: "h1", text: "17 Encerramento" });
  blocks.push({ t: "p", text: "Declaramos que este " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + " reflete o inventário de riscos ocupacionais da organização na data de sua emissão e que as medidas nele previstas serão implementadas e monitoradas conforme o plano de ação." });
  if (signature) {
    blocks.push({ t: "img", dataUrl: signature, width: 170 });
  }
  blocks.push({ t: "p", text: "_______________________________________", bold: false });
  blocks.push({ t: "p", text: m.responsavel ?? m.razao_social, bold: true });
  blocks.push({ t: "p", text: "Responsável pela organização", small: true });
  blocks.push({ t: "p", text: "Elaborado por: " + m.consultor + " · " + formatDate(m.valid_from), small: true });

  // 18
  blocks.push({ t: "h1", text: "18 Anexo 1 - Validade do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + " perante a " + (m.tipo === "pgrtr" ? "NR 31" : "NR 01") });
  blocks.push({ t: "p", text: "A avaliação de riscos constitui um processo contínuo e deve ser revista a cada dois anos ou quando da ocorrência das seguintes situações: após implementação das medidas de prevenção (avaliação de riscos residuais); após inovações e modificações nas tecnologias, ambientes, processos, condições, procedimentos e organização do trabalho; quando identificadas inadequações, insuficiências ou ineficácias das medidas de prevenção; na ocorrência de acidentes ou doenças relacionadas ao trabalho; e quando houver mudança nos requisitos legais aplicáveis." });

  // 19
  blocks.push({ t: "h1", text: "19 Anexo 2 – Matriz de Risco & Inventário de Risco" });
  if (m.risks.length === 0) {
    blocks.push({ t: "p", text: "Inventário vazio." });
  } else {
    blocks.push({ t: "table", style: "inventory",
      header: ["GES", "RISCO", "FREQUENCIA", "SEVERIDADE", "CLASSIFICAÇÃO", "EFEITOS", "MEDIDAS DE PROTEÇÃO EXISTENTES", "MEDIDAS DE PROTEÇÃO PROPOSTAS", "FORMA DE REGISTRO E CONTROLE"],
      widths: ["16%", "16%", "8%", "8%", "12%", "12%", "12%", "12%", "12%"],
      rows: m.risks.map((r) => [
        r.ges_code + " — " + r.ges_name,
        r.agent + (r.agent_code ? " (e-Social " + r.agent_code + ")" : ""),
        r.frequency,
        String(r.severity),
        r.classification,
        r.effects || "-",
        r.existing || "-",
        r.proposed || "-",
        r.record || "-",
      ]),
    });
  }

  // 20
  blocks.push({ t: "h1", text: "20 Anexo 3 – Avaliações ambientais" });
  blocks.push({ t: "p", text: "Laudos e medições ambientais, quando existentes, são anexados a este documento. As fotos de evidência por GES estão disponíveis no módulo Segurança do Trabalho do portal." });

  return blocks;
}

// ------------------------------------------------------------------ PDF

function coverPdf(m: DocumentModel): unknown[] {
  const N = NOMES[m.tipo];
  const logo = brasegLogo();
  return [
    ...(logo
      ? [{ image: logo.dataUrl, width: 160, alignment: "center", margin: [0, 40, 0, 0] } as Record<string, unknown>]
      : []),
    { text: "BRASEG CONSULTORIA E TREINAMENTOS", fontSize: 9, bold: true, color: NAVY, alignment: "center", margin: [0, 6, 0, 0], characterSpacing: 2 },
    { text: "Consultoria em Segurança do Trabalho", fontSize: 8.5, color: MUTED, alignment: "center", margin: [0, 2, 0, 0] },
    { text: "Documento elaborado para", fontSize: 9, color: MUTED, alignment: "center", margin: [0, 34, 0, 0], characterSpacing: 1.5 },
    { text: m.razao_social.toUpperCase(), fontSize: 15, bold: true, color: NAVY, alignment: "center", margin: [0, 10, 0, 0] },
    {
      table: { widths: ["*"], body: [[{ text: "", fillColor: AMBER, margin: [0, 0, 0, 0] }]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0.6, paddingBottom: () => 0.6 },
      margin: [150, 18, 150, 0],
    },
    { text: N.completo, fontSize: 22, bold: true, color: BLUE, alignment: "center", margin: [0, 28, 0, 0] },
    { text: N.sub, fontSize: 11, color: INK, alignment: "center", margin: [0, 6, 0, 0] },
    { text: N.nr, fontSize: 10, bold: true, color: AMBER, alignment: "center", margin: [0, 4, 0, 0] },
    {
      text: "DOCUMENTO " + new Date().getFullYear(),
      fontSize: 14,
      bold: true,
      color: "#ffffff",
      alignment: "center",
      fillColor: NAVY,
      margin: [120, 46, 120, 0],
    },
    { text: "Vigência: " + formatDate(m.valid_from) + " a " + formatDate(m.valid_until), fontSize: 10, color: MUTED, alignment: "center", margin: [0, 10, 0, 0] },
    { text: "Elaborado por: " + m.consultor, fontSize: 9, color: MUTED, alignment: "center", margin: [0, 120, 0, 0] },
    { text: "", pageBreak: "after", fontSize: 1 },
  ];
}

function cellPdf(text: string, opts: { header?: boolean; zebra?: boolean; align?: "left" | "center"; color?: string; bold?: boolean } = {}): Record<string, unknown> {
  const fill = opts.header ? NAVY : opts.zebra ? ZEBRA : undefined;
  const out: Record<string, unknown> = { text, style: opts.header ? "th" : "td" };
  if (fill) out.fillColor = fill;
  if (opts.color) out.color = opts.color;
  if (opts.bold) out.bold = true;
  if (opts.align === "center") out.alignment = "center";
  return out;
}

function tablePdf(b: Extract<Block, { t: "table" }>): unknown {
  const body: unknown[][] = [b.header.map((h) => cellPdf(h, { header: true }))];
  b.rows.forEach((row, ri) => {
    body.push(
      row.map((cellText, ci) => {
        const isClassificationCol = b.header[ci] === "Classificação" || b.header[ci] === "CLASSIFICAÇÃO";
        const isMatrixCell = b.style === "matrix" && ci > 0;
        return cellPdf(cellText, {
          zebra: ri % 2 === 1,
          align: b.style === "matrix" && ci > 0 ? "center" : ci >= 1 && ci <= 3 ? "center" : "left",
          color: isClassificationCol || isMatrixCell ? classificationColor(cellText) : undefined,
          bold: isClassificationCol,
        });
      })
    );
  });
  const widths: string[] = b.widths ?? Array(b.header.length).fill("*");
  return {
    table: { headerRows: 1, widths, body },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => LINE,
      vLineColor: () => LINE,
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 3.5,
      paddingBottom: () => 3.5,
    },
    margin: [0, 6, 0, 10],
  };
}

function toPdf(m: DocumentModel, signature: string | null): Promise<Buffer> {
  const blocks = buildSections(m, signature);
  const content: unknown[] = [];

  for (const b of blocks) {
    if (b.t === "h1") {
      content.push({ text: b.text, style: "h1", border: [false, false, false, true], borderColor: [NAVY, NAVY, NAVY, NAVY] });
      if (["4 Introdução", "14 CARACTERIZAÇÃO GES", "18 Anexo 1 - Validade do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + " perante a " + (m.tipo === "pgrtr" ? "NR 31" : "NR 01")].includes(b.text)) {
        content.push({ text: "", pageBreak: "before", fontSize: 1 });
      }
    } else if (b.t === "h2") {
      content.push({ text: b.text, style: "h2" });
    } else if (b.t === "p") {
      content.push({ text: b.text, style: b.center ? "center" : b.small ? "small" : "normal", bold: b.bold ?? false });
    } else if (b.t === "table") {
      content.push(tablePdf(b));
    } else if (b.t === "img") {
      content.push({ image: b.dataUrl, width: b.width, margin: [0, 10, 0, 4] });
    } else if (b.t === "pagebreak") {
      content.push({ text: "", pageBreak: "after", fontSize: 1 });
    }
  }

  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.setLocalAccessPolicy(() => true);
  pdfMake.setFonts({
    Roboto: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" },
  });

  const docDefinition = {
    pageSize: "A4" as const,
    pageMargins: [42, 52, 42, 52],
    header: (currentPage: number) =>
      currentPage > 2
        ? {
            columns: [
              { text: NOMES[m.tipo].titulo + " — " + m.razao_social, fontSize: 7.5, color: MUTED, margin: [42, 22, 0, 0] },
              { text: formatDate(m.valid_from), fontSize: 7.5, color: MUTED, alignment: "right", margin: [0, 22, 42, 0] },
            ],
          }
        : undefined,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "Documento gerado pela plataforma da Braseg Consultoria e Treinamentos", fontSize: 7, color: MUTED, margin: [42, 8, 0, 0] },
        { text: currentPage + " / " + pageCount, fontSize: 8, bold: true, color: NAVY, alignment: "right", margin: [0, 8, 42, 0] },
      ],
    }),
    content: [...coverPdf(m), ...content],
    styles: {
      h1: { fontSize: 12.5, bold: true, color: NAVY, margin: [0, 14, 0, 6] },
      h2: { fontSize: 10.5, bold: true, color: BLUE, margin: [0, 9, 0, 3] },
      normal: { fontSize: 9.5, lineHeight: 1.35, color: INK, margin: [0, 2, 0, 3], alignment: "justify" },
      small: { fontSize: 9, lineHeight: 1.3, color: INK, margin: [0, 1, 0, 1] },
      center: { fontSize: 10, margin: [0, 6, 0, 6], alignment: "center" },
      th: { fontSize: 8, bold: true, color: "#ffffff" },
      td: { fontSize: 8, color: INK },
    },
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBuffer();
}

// ------------------------------------------------------------------ DOCX

function cellDocx(text: string, opts: { header?: boolean; zebra?: boolean; align?: "center" | "left"; color?: string; bold?: boolean } = {}): TableCell {
  return new TableCell({
    shading: opts.header
      ? { type: ShadingType.CLEAR, fill: NAVY.slice(1) }
      : opts.zebra
        ? { type: ShadingType.CLEAR, fill: ZEBRA.slice(1) }
        : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            size: 16,
            bold: opts.header || opts.bold,
            color: opts.header ? "FFFFFF" : opts.color ?? "1F2937",
          }),
        ],
      }),
    ],
  });
}

function tableDocx(b: Extract<Block, { t: "table" }>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: b.header.map((h) => cellDocx(h, { header: true })) }),
      ...b.rows.map((row, ri) =>
        new TableRow({
          children: row.map((cellText, ci) => {
            const isClassificationCol = b.header[ci] === "Classificação" || b.header[ci] === "CLASSIFICAÇÃO";
            const isMatrixCell = b.style === "matrix" && ci > 0;
            return cellDocx(cellText, {
              zebra: ri % 2 === 1,
              align: b.style === "matrix" && ci > 0 ? "center" : ci >= 1 && ci <= 3 ? "center" : "left",
              color: isClassificationCol || isMatrixCell ? classificationColor(cellText) : undefined,
              bold: isClassificationCol,
            });
          }),
        })
      ),
    ],
  });
}

async function toDocx(m: DocumentModel, signature: string | null): Promise<Buffer> {
  const blocks = buildSections(m, signature);
  const children: (Paragraph | Table)[] = [];

  // Capa
  const logo = brasegLogo();
  if (logo) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 800, after: 0 },
        children: [new ImageRun({ data: Buffer.from(logo.bytes), transformation: { width: 220, height: 66 }, type: "png" })],
      })
    );
  }
  children.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 0 }, children: [new TextRun({ text: "BRASEG CONSULTORIA E TREINAMENTOS", size: 18, bold: true, color: NAVY.slice(1), characterSpacing: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 0 }, children: [new TextRun({ text: "Consultoria em Segurança do Trabalho", size: 17, color: "5B6572" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 700, after: 0 }, children: [new TextRun({ text: "Documento elaborado para", size: 18, color: "5B6572", characterSpacing: 16 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 0 }, children: [new TextRun({ text: m.razao_social.toUpperCase(), size: 30, bold: true, color: NAVY.slice(1) })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300, after: 0 },
      border: { bottom: { color: AMBER.slice(1), space: 8, style: BorderStyle.SINGLE, size: 12 } },
      children: [new TextRun({ text: " ", size: 2 })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 420, after: 0 }, children: [new TextRun({ text: NOMES[m.tipo].completo, size: 40, bold: true, color: BLUE.slice(1) })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 140, after: 0 }, children: [new TextRun({ text: NOMES[m.tipo].sub, size: 22, color: "1F2937" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 0 }, children: [new TextRun({ text: NOMES[m.tipo].nr, size: 20, bold: true, color: "B97E1F" })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 700, after: 0 },
      shading: { type: ShadingType.CLEAR, fill: NAVY.slice(1) },
      children: [new TextRun({ text: "DOCUMENTO " + new Date().getFullYear(), size: 26, bold: true, color: "FFFFFF" })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 0 }, children: [new TextRun({ text: "Vigência: " + formatDate(m.valid_from) + " a " + formatDate(m.valid_until), size: 20, color: "5B6572" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2600, after: 0 }, children: [new TextRun({ text: "Elaborado por: " + m.consultor, size: 18, color: "5B6572" })] }),
    new Paragraph({ pageBreakBefore: true, children: [] })
  );

  for (const b of blocks) {
    if (b.t === "h1") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: ["4 Introdução", "14 CARACTERIZAÇÃO GES", "18 Anexo 1 - Validade do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + " perante a " + (m.tipo === "pgrtr" ? "NR 31" : "NR 01")].includes(b.text),
          spacing: { before: 220, after: 120 },
          border: { bottom: { color: NAVY.slice(1), space: 4, style: BorderStyle.SINGLE, size: 8 } },
          children: [new TextRun({ text: b.text, bold: true, color: NAVY.slice(1), size: 25 })],
        })
      );
    } else if (b.t === "h2") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: b.text, bold: true, color: BLUE.slice(1), size: 21 })],
        })
      );
    } else if (b.t === "p") {
      children.push(
        new Paragraph({
          alignment: b.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { after: 80 },
          children: [new TextRun({ text: b.text, bold: b.bold ?? false, size: b.small ? 18 : 20, color: "1F2937" })],
        })
      );
    } else if (b.t === "table") {
      children.push(tableDocx(b));
      children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
    } else if (b.t === "img") {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 80 },
          children: [
            new ImageRun({
              data: Buffer.from(signatureImageBytes(b.dataUrl)),
              transformation: { width: b.width, height: Math.round(b.width * 0.4) },
              type: "png",
            }),
          ],
        })
      );
    } else if (b.t === "pagebreak") {
      children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { size: 20, color: "1F2937" } } } },
    sections: [
      {
        properties: { page: { margin: { top: 850, bottom: 850, left: 900, right: 900 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Documento gerado pela plataforma da Braseg Consultoria e Treinamentos · ", size: 14, color: "5B6572" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, bold: true, color: NAVY.slice(1) }),
                  new TextRun({ text: " / ", size: 14, color: "5B6572" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "5B6572" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function signatureImageBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  if (typeof atob === "function") {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Buffer.from(base64, "base64");
}

export async function renderDocument(m: DocumentModel, signature: string | null): Promise<{ pdf: Buffer; docx: Buffer }> {
  const [pdf, docx] = await Promise.all([toPdf(m, signature), toDocx(m, signature)]);
  return { pdf, docx };
}
