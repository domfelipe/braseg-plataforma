// Read-only audit: for each payment updated in the last N minutes with status='pago'
// and a sicredi_id_transacao, ask Sicredi for the real status. Does NOT mutate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUTH_PATH = "thirdparty/auth/token";
const API_PATH = "multipag";

async function proxyFetch(path: string, options: RequestInit) {
  let proxyUrl = Deno.env.get("SICREDI_PROXY_URL")!;
  if (!/^https?:\/\//i.test(proxyUrl)) proxyUrl = `https://${proxyUrl}`;
  proxyUrl = proxyUrl.replace(/\/+$/, "");
  const proxySecret = Deno.env.get("SICREDI_PROXY_SECRET")!;
  return await fetch(`${proxyUrl}/proxy/${path}`, {
    ...options,
    headers: { ...(options.headers || {}), "x-proxy-secret": proxySecret },
  });
}

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "multipag.pix.pagar multipag.pix.consultar",
    client_id: Deno.env.get("SICREDI_CLIENT_ID")!,
    client_secret: Deno.env.get("SICREDI_CLIENT_SECRET")!,
  });
  const res = await proxyFetch(AUTH_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`auth ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text).access_token;
}

async function pixStatus(token: string, idTransacao: string) {
  const res = await proxyFetch(`${API_PATH}/v1/pagamentos/pix/${idTransacao}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-cooperativa": Deno.env.get("SICREDI_COOPERATIVA")!,
      "x-conta": Deno.env.get("SICREDI_CONTA")!,
      "x-documento": Deno.env.get("SICREDI_DOCUMENTO")!,
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { httpStatus: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const minutes = parseInt(url.searchParams.get("minutes") || "60", 10);
    const limit = parseInt(url.searchParams.get("limit") || "200", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const concurrency = parseInt(url.searchParams.get("concurrency") || "8", 10);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rows, error } = await admin
      .from("professional_payments")
      .select("id, doctor_name, amount, sicredi_id_transacao, sicredi_end_to_end, sicredi_status, status, updated_at")
      .eq("status", "pago")
      .not("sicredi_id_transacao", "is", null)
      .gte("updated_at", new Date(Date.now() - minutes * 60_000).toISOString())
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const token = await getAccessToken();
    const items = rows || [];
    const results: any[] = new Array(items.length);
    let cursor = 0;
    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        const r = items[i];
        try {
          const s = await pixStatus(token, r.sicredi_id_transacao!);
          results[i] = {
            id: r.id, doctor: r.doctor_name, amount: r.amount,
            idTransacao: r.sicredi_id_transacao,
            endToEnd_db: r.sicredi_end_to_end,
            endToEnd_sicredi: s.data?.endToEnd || null,
            sicrediStatus: s.data?.status || null,
            motivoRejeicao: s.data?.motivoRejeicao || null,
            httpStatus: s.httpStatus,
          };
        } catch (e) {
          results[i] = { id: r.id, doctor: r.doctor_name, error: String(e).slice(0, 200) };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    const buckets: Record<string, number> = {};
    for (const r of results) {
      const k = r.sicrediStatus || (r.httpStatus === 404 ? "NAO_ENCONTRADO" : r.error ? "ERRO_CONSULTA" : "SEM_STATUS");
      buckets[k] = (buckets[k] || 0) + 1;
    }

    return new Response(JSON.stringify({ ok: true, total: results.length, buckets, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
