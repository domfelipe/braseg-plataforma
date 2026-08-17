import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  SYSTEM_PROMPT_NF_ACUDIR_V2,
  USER_PROMPT_NF_ACUDIR_V2,
  applyDeterministicFallbacks,
  normalizeExtractedMoneyFields,
  safeParseJson,
} from "../_shared/nf-acudir-extraction.ts";
import { buildInvoiceValidation } from "../_shared/nf-acudir-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// validation moved to _shared/nf-acudir-validation.ts (buildInvoiceValidation)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "fileBase64 and mimeType are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = SYSTEM_PROMPT_NF_ACUDIR_V2;

    const userContent: any[] = [
      {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${fileBase64}` },
      },
      { type: "text", text: USER_PROMPT_NF_ACUDIR_V2 },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro na análise da NF" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    const parsedRes = safeParseJson(content);
    let parsed: any = parsedRes.ok ? parsedRes.data : {};
    if (!parsedRes.ok) {
      console.error("safeParseJson error:", parsedRes.error, "raw:", content?.slice(0, 500));
    }

    // Normalize money/numeric fields, then apply deterministic post-processing fallbacks
    parsed = normalizeExtractedMoneyFields(parsed);
    parsed = applyDeterministicFallbacks(parsed);

    const v = buildInvoiceValidation(parsed);
    parsed = v.validation_data;
    // keep legacy "validation" shape (status + issues) for callers
    const validation = { status: v.validation_status, issues: v.validation_issues };

    return new Response(
      JSON.stringify({
        extracted: parsed,
        validation,
        validation_warnings: v.validation_warnings,
        raw: content,
        parse_error: parsedRes.ok ? null : parsedRes.error,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("analyze-nf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
