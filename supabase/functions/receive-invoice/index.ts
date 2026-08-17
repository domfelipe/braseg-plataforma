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
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // --- 1. Parse multipart/form-data ---
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const apiKey = formData.get("api_key") as string | null;
    const companyId = formData.get("company_id") as string | null;
    const city = (formData.get("city") as string) || (formData.get("cidade") as string) || null;
    const doctorPhone = (formData.get("doctor_phone") as string) || "";
    const messageText = (formData.get("message_text") as string) || "";

    // --- 2. Validate API key ---
    const expectedKey = Deno.env.get("INVOICE_WEBHOOK_API_KEY");
    if (!expectedKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Invalid or missing api_key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- 3. Validate required fields ---
    if (!file) {
      return new Response(JSON.stringify({ error: "Field 'file' is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!companyId) {
      return new Response(JSON.stringify({ error: "Field 'company_id' is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file type
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type: ${file.type}. Allowed: PDF, PNG, JPEG, WEBP` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- 4. Init Supabase with service role (bypass RLS) ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // --- 5. Upload file to Storage ---
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    // Sanitize filename: strip diacritics (Ç → C, ã → a) and replace non-ASCII/unsafe chars.
    // Supabase Storage rejects non-ASCII characters in object keys.
    const safeOriginalName = (file.name || "nota.pdf")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.\-]+/g, "_");
    const fileName = `${Date.now()}_${safeOriginalName}`;
    const storagePath = `${companyId}/${year}/${month}/${fileName}`;

    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload file", details: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get file URL
    const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(storagePath);
    const nfFileUrl = urlData?.publicUrl || storagePath;

    // --- 6. Create payment record with status processando_nf ---
    const { data: payment, error: insertError } = await supabase
      .from("professional_payments")
      .insert({
        company_id: companyId,
        doctor_name: doctorPhone || "Aguardando identificação",
        amount: 0,
        status: "processando_nf",
        nf_file_url: nfFileUrl,
        nf_raw_text: messageText || null,
        location: city,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create payment record", details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentId = payment.id;

    // --- 7. Convert file to base64 and call AI analysis ---
    const uint8Array = new Uint8Array(fileBuffer);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const fileBase64 = btoa(binary);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Update record with error
      await supabase
        .from("professional_payments")
        .update({ status: "erro_processamento", error_message: "LOVABLE_API_KEY not configured" })
        .eq("id", paymentId);

      return new Response(JSON.stringify({ id: paymentId, status: "erro_processamento", error: "AI key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = SYSTEM_PROMPT_NF_ACUDIR_V2;

    const userContent = [
      {
        type: "image_url",
        image_url: { url: `data:${file.type};base64,${fileBase64}` },
      },
      { type: "text", text: USER_PROMPT_NF_ACUDIR_V2 },
    ];

    let extracted: Record<string, any> = {};

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
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });

      if (aiResponse.ok) {
        const result = await aiResponse.json();
        const content = result.choices?.[0]?.message?.content || "";
        const parsedRes = safeParseJson(content);
        if (parsedRes.ok) {
          extracted = parsedRes.data;
        } else {
          console.error("safeParseJson error:", parsedRes.error, "raw:", content?.slice(0, 500));
        }
      } else {
        console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
      }
    } catch (aiErr) {
      console.error("AI call failed:", aiErr);
    }

    // --- 7b. Normalize money/numeric fields, then apply deterministic post-processing fallbacks ---
    extracted = normalizeExtractedMoneyFields(extracted);
    extracted = applyDeterministicFallbacks(extracted);

    // --- 7c. Validate extracted data (shared blocking/warning split) ---
    const v = buildInvoiceValidation(extracted);
    extracted = v.validation_data;

    // --- 7d. Hard duplicate check: same CNPJ + NF number for this company ---
    const dup = await findDuplicateInvoice(
      supabase,
      companyId,
      extracted.doctor_cnpj as string | undefined,
      extracted.nf_number as string | undefined,
      paymentId,
    );

    if (dup) {
      const dupMsg = `Nota duplicada: CNPJ ${extracted.doctor_cnpj} / NF ${extracted.nf_number} já existe (pagamento ${dup.id}, status ${dup.status}).`;
      await supabase
        .from("professional_payments")
        .update({
          status: "duplicado",
          error_message: dupMsg,
          validation_status: "invalida",
          validation_issues: [{ field: "nf_number", severity: "error", message: dupMsg }],
          validation_data: extracted,
          validated_at: new Date().toISOString(),
          doctor_name: extracted.doctor_name || undefined,
          doctor_cnpj: extracted.doctor_cnpj || undefined,
          nf_number: extracted.nf_number || undefined,
        })
        .eq("id", paymentId);

      return new Response(
        JSON.stringify({
          success: false,
          duplicate: true,
          id: paymentId,
          existing_payment_id: dup.id,
          status: "duplicado",
          error: dupMsg,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- 8. Update record with extracted data ---
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

    const { error: updateError } = await supabase
      .from("professional_payments")
      .update(updateData)
      .eq("id", paymentId);

    if (updateError) {
      console.error("Update error:", updateError);
      // Registra a falha no próprio pagamento para não ficar preso em processando_nf
      await supabase
        .from("professional_payments")
        .update({
          error_message: `Falha ao gravar extração: ${updateError.message}`,
        })
        .eq("id", paymentId);

      return new Response(
        JSON.stringify({
          success: false,
          id: paymentId,
          error: "Falha ao gravar dados extraídos",
          details: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // --- 9b. Trigger Google Drive sync (non-blocking) ---
    try {
      const driveRes = await fetch(`${supabaseUrl}/functions/v1/sync-drive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ payment_id: paymentId, company_id: companyId }),
      });
      if (!driveRes.ok) console.error("sync-drive error:", await driveRes.text());
      else console.log("sync-drive success for payment", paymentId);
    } catch (driveErr) {
      console.error("sync-drive call failed:", driveErr);
    }

    // --- 9. Return success ---
    return new Response(
      JSON.stringify({
        success: true,
        id: paymentId,
        status: "aguardando_pagamento",
        extracted,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("receive-invoice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
