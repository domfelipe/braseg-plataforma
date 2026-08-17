// Edge function: send-swap-email
// Processes one swap email queue item and sends notification via Resend.
// If RESEND_API_KEY is not configured, the queue item is marked 'error' but
// the main flow is never broken because this function is invoked async by trigger.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("SWAP_EMAIL_FROM") || "Escalas <onboarding@resend.dev>";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function markQueue(
  id: string,
  patch: Record<string, unknown>,
) {
  await admin.from("schedule_swap_email_queue").update(patch).eq("id", id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let queueId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    queueId = body?.queue_id ?? null;
    if (!queueId) {
      return new Response(JSON.stringify({ error: "queue_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch queue item
    const { data: item, error: qErr } = await admin
      .from("schedule_swap_email_queue")
      .select("*")
      .eq("id", queueId)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!item) {
      return new Response(JSON.stringify({ error: "queue item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (item.status === "sent") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await markQueue(queueId, {
      status: "processing",
      attempts: (item.attempts ?? 0) + 1,
    });

    if (!RESEND_API_KEY) {
      await markQueue(queueId, {
        status: "error",
        last_error: "RESEND_API_KEY not configured",
      });
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_resend_key" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch swap request + company
    const { data: swap } = await admin
      .from("shift_swap_requests")
      .select("*")
      .eq("id", item.swap_request_id)
      .maybeSingle();

    const { data: company } = await admin
      .from("companies")
      .select("name, trade_name")
      .eq("id", item.company_id)
      .maybeSingle();

    // Fetch profiles + auth emails
    const recipientIds: string[] = item.recipient_user_ids ?? [];
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .in("id", recipientIds.length ? recipientIds : ["00000000-0000-0000-0000-000000000000"]);

    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

    const emails: { email: string; name: string }[] = [];
    for (const uid of recipientIds) {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      const email = u?.user?.email;
      if (email) {
        emails.push({ email, name: profileMap[uid]?.full_name || email });
      }
    }

    if (emails.length === 0) {
      await markQueue(queueId, {
        status: "error",
        last_error: "no recipients with email",
      });
      return new Response(JSON.stringify({ ok: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyName = company?.trade_name || company?.name || "Escala";
    const subject = `[${companyName}] Troca de plantão confirmada`;
    const html = `
      <div style="font-family:Arial,sans-serif;color:#0E2E4F">
        <h2>Troca de plantão confirmada</h2>
        <p>A solicitação de ${swap?.type === "passagem" ? "passagem" : "troca"} de plantão foi aprovada pela administração de <strong>${companyName}</strong> e já consta na escala.</p>
        <p style="color:#306CB9">Acesse o portal para conferir os detalhes.</p>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: emails.map((e) => e.email),
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      await markQueue(queueId, {
        status: "error",
        last_error: `resend ${resp.status}: ${txt.slice(0, 500)}`,
      });
      return new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await markQueue(queueId, {
      status: "sent",
      sent_at: new Date().toISOString(),
      last_error: null,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (queueId) {
      await markQueue(queueId, { status: "error", last_error: msg });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
