// Edge function: dashboard-ai-summary
// Generates an executive daily summary of the company using Lovable AI Gateway.
// Caches result in ai_daily_summaries (one row per company/day). Use ?force=true to regenerate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function todayLocal() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Validate user
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SERVICE_ROLE_KEY },
    });
    if (!userResp.ok) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const user = await userResp.json();

    const { company_id, force } = await req.json();
    if (!company_id) return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const today = todayLocal();

    // Cache check
    if (!force) {
      const { data: cached } = await admin
        .from("ai_daily_summaries")
        .select("*")
        .eq("company_id", company_id)
        .eq("summary_date", today)
        .maybeSingle();
      if (cached) {
        return new Response(JSON.stringify({ ...cached, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Collect data
    const monthStart = today.slice(0, 7) + "-01";
    const next7 = addDays(today, 7);
    const next30 = addDays(today, 30);

    const [
      { data: company },
      { data: txMonth },
      { data: txOverdue },
      { data: txUpcoming },
      { data: payPending },
      { data: clockToday },
      { data: fleetReminders },
      { data: assignmentsToday },
    ] = await Promise.all([
      admin.from("companies").select("name, trade_name, cnpj").eq("id", company_id).maybeSingle(),
      admin.from("financial_transactions").select("type, amount, status, due_date")
        .eq("company_id", company_id).neq("status", "cancelado")
        .gte("due_date", monthStart).lte("due_date", addDays(monthStart, 31)),
      admin.from("financial_transactions").select("description, amount, due_date")
        .eq("company_id", company_id).eq("status", "pendente").lt("due_date", today).limit(20),
      admin.from("financial_transactions").select("description, amount, due_date, type")
        .eq("company_id", company_id).eq("status", "pendente")
        .gte("due_date", today).lte("due_date", next7).order("due_date").limit(20),
      admin.from("professional_payments").select("doctor_name, amount, status")
        .eq("company_id", company_id).eq("status", "aguardando_pagamento").limit(20),
      admin.from("clock_entries").select("id").eq("company_id", company_id)
        .gte("timestamp", today + "T00:00:00").lte("timestamp", today + "T23:59:59"),
      admin.from("fleet_reminders").select("title, due_date, type")
        .eq("company_id", company_id).neq("status", "pago").lte("due_date", next30).order("due_date").limit(15),
      admin.from("shift_assignments").select("id, grade_id, schedule_grades!inner(schedule_id, schedules!inner(company_id))")
        .eq("date", today).eq("schedule_grades.schedules.company_id", company_id),
    ]);

    const receitas = (txMonth || []).filter(t => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const despesas = (txMonth || []).filter(t => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    const overdueTotal = (txOverdue || []).reduce((s, t) => s + Number(t.amount), 0);
    const pendingPayTotal = (payPending || []).reduce((s, t) => s + Number(t.amount), 0);

    const metrics = {
      receitas_mes: receitas,
      despesas_mes: despesas,
      saldo_mes: receitas - despesas,
      vencidas_count: (txOverdue || []).length,
      vencidas_total: overdueTotal,
      vencendo_7d_count: (txUpcoming || []).length,
      nfs_pendentes: (payPending || []).length,
      nfs_pendentes_total: pendingPayTotal,
      pontos_hoje: (clockToday || []).length,
      escalas_hoje: (assignmentsToday || []).length,
      lembretes_frota_30d: (fleetReminders || []).length,
    };

    // Build prompt
    const ctx = `
Empresa: ${company?.trade_name || company?.name}
Data: ${today}

FINANCEIRO (mês atual):
- Receitas: ${fmtBRL(receitas)}
- Despesas: ${fmtBRL(despesas)}
- Saldo: ${fmtBRL(receitas - despesas)}

CONTAS VENCIDAS (${(txOverdue || []).length}, total ${fmtBRL(overdueTotal)}):
${(txOverdue || []).slice(0, 8).map(t => `- ${t.description} | ${fmtBRL(Number(t.amount))} | venceu em ${t.due_date}`).join("\n") || "(nenhuma)"}

CONTAS VENCENDO EM 7 DIAS (${(txUpcoming || []).length}):
${(txUpcoming || []).slice(0, 8).map(t => `- [${t.type}] ${t.description} | ${fmtBRL(Number(t.amount))} | ${t.due_date}`).join("\n") || "(nenhuma)"}

NOTAS FISCAIS AGUARDANDO PAGAMENTO (${(payPending || []).length}, total ${fmtBRL(pendingPayTotal)}):
${(payPending || []).slice(0, 8).map(p => `- ${p.doctor_name} | ${fmtBRL(Number(p.amount))}`).join("\n") || "(nenhuma)"}

OPERACIONAL:
- Registros de ponto hoje: ${(clockToday || []).length}
- Escalas planejadas hoje: ${(assignmentsToday || []).length}

FROTA — Vencimentos próximos (30 dias):
${(fleetReminders || []).slice(0, 8).map(r => `- ${r.title} (${r.type}) | ${r.due_date}`).join("\n") || "(nenhum)"}
`.trim();

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um analista executivo da empresa. Gere um briefing diário em português do Brasil, direto, com tom profissional e propositivo. Sempre responda usando a função 'briefing'.",
          },
          { role: "user", content: `Com base nos dados a seguir, gere o briefing diário:\n\n${ctx}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "briefing",
              description: "Briefing executivo diário",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Resumo executivo em 2-4 frases curtas (markdown permitido)" },
                  highlights: {
                    type: "array",
                    description: "3 a 5 destaques positivos ou neutros do dia",
                    items: { type: "string" },
                  },
                  alerts: {
                    type: "array",
                    description: "Alertas críticos ou ações recomendadas (até 5)",
                    items: {
                      type: "object",
                      properties: {
                        severity: { type: "string", enum: ["info", "warning", "critical"] },
                        title: { type: "string" },
                        action: { type: "string", description: "Ação recomendada curta" },
                      },
                      required: ["severity", "title", "action"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["summary", "highlights", "alerts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "briefing" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione fundos no workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha ao gerar resumo" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;
    if (!args) {
      return new Response(JSON.stringify({ error: "Resposta da IA inválida" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const row = {
      company_id,
      summary_date: today,
      summary_text: args.summary,
      highlights: args.highlights || [],
      alerts: args.alerts || [],
      metrics,
      generated_at: new Date().toISOString(),
      generated_by: user.id,
    };

    const { data: saved, error: saveErr } = await admin
      .from("ai_daily_summaries")
      .upsert(row, { onConflict: "company_id,summary_date" })
      .select()
      .single();

    if (saveErr) {
      console.error("Save error", saveErr);
      return new Response(JSON.stringify({ ...row, cached: false, save_error: saveErr.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ...saved, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
