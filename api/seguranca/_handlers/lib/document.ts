import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import pdfMake from "pdfmake";
import type { DocumentModel } from "./model.js";
import { formatDate } from "./model.js";

/**
 * Gerador de documentos PGR/PGRTR — réplica da anatomia dos 20 itens dos
 * documentos reais da Braseg (DINAMI/FISHER/LENÇÓIS), a partir de um modelo
 * de dados único. Renderiza PDF (pdfmake) e DOCX (docx) editável.
 */

type Block =
  | { t: "h1"; text: string }
  | { t: "h2"; text: string }
  | { t: "p"; text: string; bold?: boolean; center?: boolean; small?: boolean }
  | { t: "table"; header: string[]; rows: string[][]; widths?: string[] }
  | { t: "img"; dataUrl: string; width: number }
  | { t: "pagebreak" };

const NOMES = {
  pgr: {
    titulo: "PGR - PROGRAMA DE GERENCIAMENTO DE RISCOS",
    sub: "GRO - GERENCIAMENTO DE RISCOS OCUPACIONAIS",
    nr: "NR-01 | NR-09",
  },
  pgrtr: {
    titulo: "PGRTR - PROGRAMA DE GERENCIAMENTO DE RISCOS NO TRABALHO RURAL",
    sub: "GERENCIAMENTO DE RISCOS OCUPACIONAIS NO TRABALHO RURAL",
    nr: "NR 31 – ITEM 31.3",
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

function buildSections(m: DocumentModel, signature: string | null): Block[] {
  const N = NOMES[m.tipo];
  const blocks: Block[] = [];

  // Capa
  blocks.push(
    { t: "p", text: "", bold: false },
    { t: "p", text: m.razao_social.toUpperCase(), center: true },
    { t: "p", text: "", bold: false },
    { t: "p", text: N.titulo, center: true, bold: true },
    { t: "p", text: N.sub, center: true },
    { t: "p", text: N.nr, center: true },
    { t: "p", text: "", bold: false },
    { t: "p", text: "DOCUMENTO " + new Date().getFullYear(), center: true, bold: true },
    { t: "p", text: "Vigência: " + formatDate(m.valid_from) + " a " + formatDate(m.valid_until), center: true, small: true },
    { t: "pagebreak" }
  );

  // Sumário
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
  blocks.push({ t: "p", text: "Razão social: " + m.razao_social });
  blocks.push({ t: "p", text: "CNPJ: " + m.cnpj });
  if (m.cnae) blocks.push({ t: "p", text: "CNAE: " + m.cnae });
  if (m.grau_risco !== null) blocks.push({ t: "p", text: "Grau de risco (NR-04): " + m.grau_risco });
  blocks.push({ t: "p", text: "Endereço: " + m.endereco_texto });
  if (m.atividade_principal) blocks.push({ t: "p", text: "Atividade principal: " + m.atividade_principal });
  if (m.n_funcionarios !== null) blocks.push({ t: "p", text: "Número de funcionários: " + m.n_funcionarios });

  // 2
  blocks.push({ t: "h1", text: "2 Responsáveis pela elaboração do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") });
  blocks.push({ t: "p", text: "Elaboração técnica: " + m.consultor });
  blocks.push({ t: "p", text: "Responsável pela empresa: " + (m.responsavel ?? m.razao_social) });

  // 3
  blocks.push({ t: "h1", text: "3 Histórico de revisões" });
  blocks.push({
    t: "table",
    header: ["Revisão", "Data", "Descrição", "Elaborado por"],
    rows: [["01", formatDate(m.valid_from), m.revision_note || "Emissão inicial", m.consultor]],
  });

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
  blocks.push({ t: "table", header: MATRIX_5X5.header, rows: MATRIX_5X5.rows });
  blocks.push({ t: "h2", text: "5.6 Metodologia de Ação" });
  blocks.push({ t: "p", text: "As ações de controle seguem a hierarquia de prevenção: eliminação, substituição, controles de engenharia, controles administrativos e, por último, equipamentos de proteção individual." });

  // 6
  blocks.push({ t: "h1", text: "6 Prioridade das Ações de Controle" });
  blocks.push({ t: "h2", text: "6.1 Nível de Risco" });
  blocks.push({ t: "table", header: PRIORIDADE.header, rows: PRIORIDADE.rows });
  blocks.push({ t: "h2", text: "6.2 Registro, Manutenção e Divulgação do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") });
  blocks.push({ t: "p", text: "Este documento é mantido atualizado, divulgado aos trabalhadores e revisado conforme os gatilhos legais (mudança de processo, inadequação de medidas, acidente ou doença do trabalho e mudança de requisito legal)." });

  // 7
  blocks.push({ t: "h1", text: "7 Definições" });
  blocks.push({ t: "p", text: "Perigo: fonte com potencial de causar lesão ou agravo à saúde. Risco ocupacional: combinação da probabilidade de ocorrência de lesão ou agravo com a severidade da consequência. GES: Grupo de Exposição Similar — grupo de trabalhadores expostos de modo semelhante aos mesmos agentes. PGR/" + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + ": programa de gerenciamento de riscos previsto na " + (m.tipo === "pgrtr" ? "NR-31" : "NR-01") + "." });

  // 8
  blocks.push({ t: "h1", text: "8 Resumo dos Riscos e Seus Agentes" });
  blocks.push({
    t: "table",
    header: ["GES", "Setor", "Agentes de risco"],
    rows: m.ges.map((g) => [g.code + " — " + g.name, g.sector ?? "-", g.agents.map((a) => a.agent).join("; ") || "-"]),
  });

  // 9
  blocks.push({ t: "h1", text: "9 Atribuições e Responsabilidades" });
  blocks.push({ t: "p", text: "Do empregador: implementar e manter o " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + ", garantir recursos para as medidas de prevenção, informar e capacitar os trabalhadores.", bold: false });
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
      blocks.push({
        t: "table",
        header: ["Agente de risco", "Freq.", "Sev.", "Classificação", "Efeitos", "Medidas existentes", "Medidas propostas", "Registro e controle"],
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
    blocks.push({
      t: "table",
      header: ["Descrição", "Origem", "Responsável", "Prazo", "Status"],
      rows: m.plan.map((p) => [p.description, p.origin ?? "-", p.responsible ?? "-", p.deadline ?? "-", statusLabel[p.status] ?? p.status]),
    });
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
    blocks.push({ t: "img", dataUrl: signature, width: 180 });
  }
  blocks.push({ t: "p", text: "_______________________________________", bold: false });
  blocks.push({ t: "p", text: m.responsavel ?? m.razao_social });
  blocks.push({ t: "p", text: "Responsável pela organização" });
  blocks.push({ t: "p", text: "Elaborado por: " + m.consultor + " · " + formatDate(m.valid_from) });

  // 18
  blocks.push({ t: "h1", text: "18 Anexo 1 - Validade do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + " perante a " + (m.tipo === "pgrtr" ? "NR 31" : "NR 01") });
  blocks.push({ t: "p", text: "A avaliação de riscos constitui um processo contínuo e deve ser revista a cada dois anos ou quando da ocorrência das seguintes situações: após implementação das medidas de prevenção (avaliação de riscos residuais); após inovações e modificações nas tecnologias, ambientes, processos, condições, procedimentos e organização do trabalho; quando identificadas inadequações, insuficiências ou ineficácias das medidas de prevenção; na ocorrência de acidentes ou doenças relacionadas ao trabalho; e quando houver mudança nos requisitos legais aplicáveis." });

  // 19
  blocks.push({ t: "h1", text: "19 Anexo 2 – Matriz de Risco & Inventário de Risco" });
  if (m.risks.length === 0) {
    blocks.push({ t: "p", text: "Inventário vazio." });
  } else {
    blocks.push({
      t: "table",
      header: ["GES", "RISCO", "FREQUENCIA", "SEVERIDADE", "CLASSIFICAÇÃO", "EFEITOS", "MEDIDAS DE PROTEÇÃO EXISTENTES", "MEDIDAS DE PROTEÇÃO PROPOSTAS", "FORMA DE REGISTRO E CONTROLE"],
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

// ---------------------------------------------------------------- PDF (pdfmake)

function toPdf(m: DocumentModel, signature: string | null): Promise<Buffer> {
  const blocks = buildSections(m, signature);
  const content: unknown[] = [];

  for (const b of blocks) {
    if (b.t === "h1") {
      content.push({ text: b.text, style: "h1", pageBreak: b.text === "SUMÁRIO" ? undefined : undefined });
      if (["4 Introdução", "5 Identificação", "6 Prioridade das Ações de Controle", "7 Definições", "8 Resumo dos Riscos e Seus Agentes", "9 Atribuições e Responsabilidades", "10 Metodologia do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR"), "11 Avaliações Ambientais", "12 Grupos de Exposição Similar (GES)", "13 Período de Vigência", "14 CARACTERIZAÇÃO GES", "15 Plano de Ação", "16 Referências Bibliográficas", "17 Encerramento", "18 Anexo 1 - Validade do " + (m.tipo === "pgrtr" ? "PGRTR" : "PGR") + " perante a " + (m.tipo === "pgrtr" ? "NR 31" : "NR 01"), "19 Anexo 2 – Matriz de Risco & Inventário de Risco", "20 Anexo 3 – Avaliações ambientais"].includes(b.text)) {
        content.push({ text: "", pageBreak: "before", fontSize: 1 });
      }
    } else if (b.t === "h2") {
      content.push({ text: b.text, style: "h2" });
    } else if (b.t === "p") {
      content.push({ text: b.text, style: b.center ? "center" : b.small ? "small" : "normal", bold: b.bold ?? false, alignment: b.center ? "center" : undefined });
    } else if (b.t === "table") {
      content.push({
        table: {
          headerRows: 1,
          widths: b.widths ?? Array(b.header.length).fill("*"),
          body: [b.header.map((h) => ({ text: h, style: "th" })), ...b.rows.map((r) => r.map((c) => ({ text: c, style: "td" })))],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#9aa4b2",
          vLineColor: () => "#9aa4b2",
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
        margin: [0, 4, 0, 8],
      });
    } else if (b.t === "img") {
      content.push({ image: b.dataUrl, width: b.width, alignment: "left", margin: [0, 8, 0, 4] });
    } else if (b.t === "pagebreak") {
      content.push({ text: "", pageBreak: "after", fontSize: 1 });
    }
  }

  // pdfmake 0.3: instância singleton no Node (js/index.js) — fontes padrão PDF
  pdfMake.setUrlAccessPolicy(() => false); // sem downloads remotos
  pdfMake.setLocalAccessPolicy(() => true); // imagens apenas via data URLs
  pdfMake.setFonts({
    Roboto: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  });

  const docDefinition = {
    pageSize: "A4" as const,
    pageMargins: [40, 48, 40, 48],
    footer: (currentPage: number, pageCount: number) => ({
      text: currentPage + " / " + pageCount,
      alignment: "center" as const,
      fontSize: 8,
      color: "#666",
      margin: [0, 12, 0, 0],
    }),
    content,
    styles: {
      h1: { fontSize: 13, bold: true, color: "#002e5a", margin: [0, 12, 0, 4] },
      h2: { fontSize: 11, bold: true, color: "#1f3d9d", margin: [0, 8, 0, 2] },
      normal: { fontSize: 10, margin: [0, 2, 0, 2] },
      small: { fontSize: 9, margin: [0, 1, 0, 1], color: "#333" },
      center: { fontSize: 11, margin: [0, 6, 0, 6], alignment: "center" },
      th: { fontSize: 8.5, bold: true, color: "#ffffff", fillColor: "#002e5a" },
      td: { fontSize: 8.5, color: "#222" },
    },
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#222" },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBuffer();
}

// ---------------------------------------------------------------- DOCX (docx)

function cell(text: string, bold = false): TableCell {
  return new TableCell({
    width: { size: 100, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18, font: "Inter" })], spacing: { after: 20 } })],
  });
}

async function toDocx(m: DocumentModel, signature: string | null): Promise<Buffer> {
  const blocks = buildSections(m, signature);
  const children: (Paragraph | Table)[] = [];

  for (const b of blocks) {
    if (b.t === "h1") {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: b.text, bold: true, color: "002E5A" })], pageBreakBefore: children.length > 0 && b.text !== "SUMÁRIO" ? true : false, spacing: { before: 200, after: 120 } }));
    } else if (b.t === "h2") {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: b.text, bold: true, color: "1F3D9D" })], spacing: { before: 140, after: 60 } }));
    } else if (b.t === "p") {
      children.push(new Paragraph({ alignment: b.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED, children: [new TextRun({ text: b.text, bold: b.bold ?? false, size: b.small ? 18 : 20, font: "Inter" })], spacing: { after: 80 } }));
    } else if (b.t === "table") {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: b.header.map((h) => cell(h, true)) }),
          ...b.rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
        ],
      }));
      children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
    } else if (b.t === "img") {
      children.push(new Paragraph({ children: [new ImageRun({ data: Buffer.from(signatureImageBytes(b.dataUrl)), transformation: { width: b.width, height: Math.round(b.width * 0.4) }, type: "jpg" })], spacing: { after: 80 } }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Inter", size: 20 } } } },
    sections: [{ children }],
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
