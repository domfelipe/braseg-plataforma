// Public endpoint for doctors to submit their invoices via a shareable link.
// No JWT or API key required — only a valid company_id and a small set of required fields.
// Same processing pipeline as `upload-nota-fiscal`: store → AI extract → validate → duplicate check.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SYSTEM_PROMPT_NF_ACUDIR_V2,
  USER_PROMPT_NF_ACUDIR_V2,
  applyDeterministicFallbacks,
  normalizeExtractedMoneyFields,
  safeParseJson,
} from "../_shared/nf-acudir-extraction.ts";
import { buildInvoiceValidation } from "../_shared/nf-acudir-validation.ts";
import { findDuplicateInvoice } from "../_shared/invoice-duplicate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_BYTES = 12 * 1024 * 1024; // 12MB

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method === "GET") {
    // Light endpoint to validate a company_id and return its display name (used by the public form).
    const url = new URL(req.url);
    const companyId = url.searchParams.get("company_id");
    if (!companyId) {
      return new Response(JSON.stringify({ ok: false, message: "company_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, trade_name, logo_url")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data) {
      return new Response(JSON.stringify({ ok: false, message: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, company: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const companyId = formData.get("company_id") as string | null;
    const nomeProfissional = ((formData.get("nome_profissional") as string) || "").trim();
    const telefone = ((formData.get("telefone") as string) || "").trim();
    const cnpj = ((formData.get("cnpj") as string) || "").trim();
    const cidade = ((formData.get("city") as string) || (formData.get("cidade") as string) || "").trim();
    const observacao = ((formData.get("observacao") as string) || "").trim();

    // Basic validation
    if (!companyId) {
      return new Response(JSON.stringify({ success: false, message: "Identificador da empresa ausente." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!file) {
      return new Response(JSON.stringify({ success: false, message: "Envie o arquivo da nota fiscal." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!nomeProfissional || nomeProfissional.length < 3 || nomeProfissional.length > 120) {
      return new Response(JSON.stringify({ success: false, message: "Informe seu nome completo." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!telefone || telefone.replace(/\D/g, "").length < 10) {
      return new Response(JSON.stringify({ success: false, message: "Informe um telefone válido com DDD." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ success: false, message: "Tipo de arquivo inválido (use PDF, PNG, JPEG ou WEBP)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > MAX_FILE_BYTES) {
      return new Response(JSON.stringify({ success: false, message: "Arquivo acima do limite de 12MB." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Confirm company exists (prevents abuse with random UUIDs)
    const { data: company } = await supabase
      .from("companies").select("id").eq("id", companyId).maybeSingle();
    if (!company) {
      return new Response(JSON.stringify({ success: false, message: "Empresa não encontrada." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Early duplicate check using submitted CNPJ — if doctor provided a CNPJ + we can extract NF later,
    // we'll re-check after AI extraction. Skip here if CNPJ blank.

    // Upload file
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const safeFileName = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${companyId}/${year}/${month}/public_${Date.now()}_${safeFileName}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: false });
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ success: false, message: "Falha ao salvar o arquivo." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(storagePath);
    const arquivoUrl = urlData?.publicUrl || storagePath;

    // Create placeholder payment row
    const rawTextParts: string[] = ["[ENVIO PÚBLICO]"];
    if (telefone) rawTextParts.push(`Tel: ${telefone}`);
    if (cnpj) rawTextParts.push(`CNPJ informado: ${cnpj}`);
    if (observacao) rawTextParts.push(observacao);

    const { data: payment, error: insertError } = await supabase
      .from("professional_payments")
      .insert({
        company_id: companyId,
        doctor_name: nomeProfissional,
        doctor_cnpj: cnpj || null,
        amount: 0,
        status: "processando_nf",
        nf_file_url: arquivoUrl,
        nf_raw_text: rawTextParts.join(" | "),
        location: cidade || null,
      })
      .select("id")
      .single();

    if (insertError || !payment) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ success: false, message: "Falha ao registrar a nota." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const paymentId = payment.id;

    // AI extraction
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let extracted: Record<string, any> = {};

    if (LOVABLE_API_KEY) {
      const uint8Array = new Uint8Array(fileBuffer);
      let binary = "";
      for (let i = 0; i < uint8Array.length; i++) binary += String.fromCharCode(uint8Array[i]);
      const fileBase64 = btoa(binary);

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT_NF_ACUDIR_V2 },
              { role: "user", content: [
                { type: "image_url", image_url: { url: `data:${file.type};base64,${fileBase64}` } },
                { type: "text", text: USER_PROMPT_NF_ACUDIR_V2 },
              ]},
            ],
          }),
        });
        if (aiResponse.ok) {
          const result = await aiResponse.json();
          const content = result.choices?.[0]?.message?.content || "";
          const parsed = safeParseJson(content);
          if (parsed.ok) extracted = parsed.data;
        } else {
          console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
        }
      } catch (e) {
        console.error("AI call failed:", e);
      }
    }

    extracted = normalizeExtractedMoneyFields(extracted);
    extracted = applyDeterministicFallbacks(extracted);
    // Prefer submitted CNPJ if AI missed it
    if (!extracted.doctor_cnpj && cnpj) extracted.doctor_cnpj = cnpj;
    if (!extracted.doctor_name && nomeProfissional) extracted.doctor_name = nomeProfissional;

    const v = buildInvoiceValidation(extracted);
    extracted = v.validation_data;

    // Hard duplicate check
    const dup = await findDuplicateInvoice(
      supabase,
      companyId,
      (extracted.doctor_cnpj as string | undefined) || cnpj,
      extracted.nf_number as string | undefined,
      paymentId,
    );

    if (dup) {
      const dupMsg = `Nota já enviada anteriormente (CNPJ ${extracted.doctor_cnpj || cnpj} / NF ${extracted.nf_number}).`;
      await supabase
        .from("professional_payments")
        .update({
          status: "duplicado",
          error_message: dupMsg,
          validation_status: "invalida",
          validation_issues: [{ field: "nf_number", severity: "error", message: dupMsg }],
          validation_data: extracted,
          validated_at: new Date().toISOString(),
          doctor_name: extracted.doctor_name || nomeProfissional,
          doctor_cnpj: extracted.doctor_cnpj || cnpj || null,
          nf_number: extracted.nf_number || null,
        })
        .eq("id", paymentId);

      return new Response(JSON.stringify({
        success: false,
        duplicate: true,
        message: "Esta nota fiscal já foi enviada anteriormente. Não é necessário reenviar.",
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updateData: Record<string, any> = {
      status: "aguardando_pagamento",
      validation_status: v.validation_status,
      validation_issues: v.validation_issues,
      validation_data: extracted,
      validated_at: new Date().toISOString(),
    };
    if (extracted.doctor_name) updateData.doctor_name = extracted.doctor_name;
    if (extracted.doctor_company_name) updateData.doctor_company_name = extracted.doctor_company_name;
    if (extracted.doctor_cnpj) updateData.doctor_cnpj = extracted.doctor_cnpj;
    if (extracted.amount) updateData.amount = Number(extracted.amount) || 0;
    if (extracted.nf_number) updateData.nf_number = extracted.nf_number;
    if (extracted.nf_issue_date) updateData.nf_issue_date = extracted.nf_issue_date;
    if (extracted.nf_description) updateData.nf_description = extracted.nf_description;

    await supabase.from("professional_payments").update(updateData).eq("id", paymentId);

    // Drive sync (non-blocking)
    try {
      await fetch(`${supabaseUrl}/functions/v1/sync-drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ payment_id: paymentId, company_id: companyId }),
      });
    } catch (driveErr) {
      console.error("sync-drive call failed:", driveErr);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Nota recebida com sucesso! Em breve nossa equipe processará seu pagamento.",
      data: { id: paymentId },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-submit-invoice error:", e);
    return new Response(JSON.stringify({ success: false, message: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
