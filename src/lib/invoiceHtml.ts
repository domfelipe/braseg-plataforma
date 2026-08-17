import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"clock_invoices">;

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (v: number) => `${Number(v).toFixed(1)}%`;

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  emitida: "Emitida",
  cancelada: "Cancelada",
};

export function generateInvoiceHtml(invoice: Invoice): string {
  const statusLabel = statusLabels[invoice.status] || "Rascunho";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>NF - ${invoice.professional_name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 40px; color: #333; font-size: 14px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 13px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-emitida { background: #dcfce7; color: #166534; }
    .badge-rascunho { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
    .badge-cancelada { background: #fee2e2; color: #991b1b; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #888; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
    .label { font-size: 12px; color: #888; }
    .value { font-size: 14px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-size: 12px; text-transform: uppercase; color: #888; }
    td.right, th.right { text-align: right; }
    .total-row td { font-weight: 700; border-top: 2px solid #333; }
    .notes { background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Nota Fiscal de Serviço</h1>
  <p class="subtitle">
    Gerada em ${format(new Date(invoice.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
    &nbsp;&nbsp;
    <span class="badge badge-${invoice.status}">${statusLabel}</span>
  </p>

  <div class="section">
    <div class="section-title">Profissional</div>
    <div class="grid">
      <div><span class="label">Nome</span><br/><span class="value">${invoice.professional_name}</span></div>
      <div><span class="label">CPF/CNPJ</span><br/><span class="value">${invoice.professional_cpf_cnpj || "—"}</span></div>
      <div><span class="label">Função</span><br/><span class="value">${invoice.professional_role || "—"}</span></div>
      <div><span class="label">Cód. Municipal</span><br/><span class="value">${invoice.municipal_code || "—"}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Período e Serviço</div>
    <div class="grid">
      <div><span class="label">Período</span><br/><span class="value">${format(new Date(invoice.period_from), "dd/MM/yyyy", { locale: ptBR })} a ${format(new Date(invoice.period_to), "dd/MM/yyyy", { locale: ptBR })}</span></div>
      <div><span class="label">Total de Horas</span><br/><span class="value">${Number(invoice.total_hours).toFixed(1)}h</span></div>
    </div>
    ${invoice.service_description ? `<p style="margin-top:8px;"><span class="label">Descrição</span><br/>${invoice.service_description}</p>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Valores</div>
    <table>
      <thead><tr><th>Item</th><th class="right">Alíquota</th><th class="right">Valor</th></tr></thead>
      <tbody>
        <tr><td>Valor Hora</td><td class="right">—</td><td class="right">${fmt(Number(invoice.hourly_rate))}</td></tr>
        <tr><td>Total Bruto (${Number(invoice.total_hours).toFixed(1)}h)</td><td class="right">—</td><td class="right">${fmt(Number(invoice.total_amount))}</td></tr>
        <tr><td>ISS</td><td class="right">${pct(Number(invoice.iss_rate))}</td><td class="right">- ${fmt(Number(invoice.iss_amount))}</td></tr>
        <tr><td>INSS</td><td class="right">${pct(Number(invoice.inss_rate))}</td><td class="right">- ${fmt(Number(invoice.inss_amount))}</td></tr>
        <tr><td>IRRF</td><td class="right">${pct(Number(invoice.irrf_rate))}</td><td class="right">- ${fmt(Number(invoice.irrf_amount))}</td></tr>
        <tr class="total-row"><td>Valor Líquido</td><td class="right"></td><td class="right">${fmt(Number(invoice.net_amount))}</td></tr>
      </tbody>
    </table>
  </div>

  ${invoice.notes ? `<div class="section"><div class="section-title">Observações</div><div class="notes">${invoice.notes}</div></div>` : ""}
</body>
</html>`;
}
