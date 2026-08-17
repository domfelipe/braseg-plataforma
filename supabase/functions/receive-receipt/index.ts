import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveCanonicalCity } from "../_shared/company-city-contract.ts";
import { extractApiKeyCandidates, isAuthorizedApiKey } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

const VALID_TYPES = ["receita", "despesa"];
const ESCRITORIO_COMPANY_ID = "e8f5e3a1-1b2c-4d5e-9f0a-1b2c3d4e5f6a";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

const sanitizeName = (name: string) =>
  (name || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const expectedKey = Deno.env.get("INVOICE_WEBHOOK_API_KEY");
    // Header-based auth is validated BEFORE the file/body is processed.
    const headerCandidates = extractApiKeyCandidates(req.headers.entries());
    const headerAuthorized = isAuthorizedApiKey(headerCandidates, expectedKey);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const apiKey = formData.get("api_key") as string | null;
    const rawCompanyId = (formData.get("company_id") as string | null) || null;
    const type = (formData.get("type") as string) || "despesa";
    const city =
      (formData.get("city") as string) || (formData.get("cidade") as string) || null;
    const messageText = formData.get("message_text") as string | null;
    const senderPhone = formData.get("sender_phone") as string | null;
    const chatwootAccountId = formData.get("chatwoot_account_id") as string | null;
    const conversationId = formData.get("conversation_id") as string | null;
    const messageId = formData.get("message_id") as string | null;
    const whatsappMinimal =
      String(formData.get("whatsapp_minimal") ?? "").toLowerCase() === "true";

    if (!headerAuthorized && !isAuthorizedApiKey([apiKey], expectedKey)) {
      return json({ error: "Invalid API key" }, 401);
    }

    // company_id is now OPTIONAL: a receipt without caption must never be dropped.
    if (!file) return json({ error: "file is required" }, 400);
    if (!VALID_TYPES.includes(type)) {
      return json({ error: "type must be 'receita' or 'despesa'" }, 400);
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      return json({ error: "File type not allowed. Use PDF, JPG, PNG or WebP." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const fileBuffer = await file.arrayBuffer();

    // ---- 1) Hash first: identity of the document before any business decision
    const digest = await crypto.subtle.digest("SHA-256", fileBuffer);
    const fileHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // ---- 2) Deterministic dedup (any company + inbox)
    const { data: dupTx } = await adminClient
      .from("financial_transactions")
      .select("id, company_id, description, amount, created_at")
      .eq("file_hash", fileHash)
      .limit(1)
      .maybeSingle();

    if (dupTx) {
      return json(
        {
          state: "duplicate",
          success: false,
          duplicate: true,
          transaction_id: dupTx.id,
          existing_id: dupTx.id,
          message: "Comprovante já registrado anteriormente",
          existing: dupTx,
        },
        409
      );
    }

    const { data: dupInbox } = await adminClient
      .from("financial_unassigned_documents")
      .select("id, status")
      .eq("document_sha256", fileHash)
      .limit(1)
      .maybeSingle();

    if (dupInbox) {
      return json(
        {
          state: "needs_review",
          success: false,
          duplicate: true,
          inbox_id: dupInbox.id,
          transaction_id: null,
          message: "Comprovante já está na fila de triagem sem empresa definida",
        },
        200
      );
    }

    // ---- 2b) Minimal contract: hard server-side barrier for company_id + city.
    // Never accept an empty/foreign/guessed city, never create a R$ 0,00 transaction.
    let minimalCity: string | null = null;
    if (whatsappMinimal) {
      const resolution = resolveCanonicalCity(rawCompanyId, city);
      if (!resolution.ok) {
        const reason = "invalid_company_or_city";
        const safeName0 = sanitizeName(file.name);
        const now0 = new Date();
        const path0 = `inbox/${now0.getFullYear()}/${String(now0.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${safeName0}`;

        const { error: upErr0 } = await adminClient.storage
          .from("receipts")
          .upload(path0, fileBuffer, { contentType: file.type });
        if (upErr0) console.error("Upload error (invalid pair):", upErr0);

        const { data: inbox0 } = await adminClient
          .from("financial_unassigned_documents")
          .insert({
            company_id: null,
            document_sha256: fileHash,
            storage_bucket: "receipts",
            storage_path: path0,
            original_filename: safeName0,
            mime_type: file.type,
            file_size_bytes: fileBuffer.byteLength,
            source_type: "whatsapp",
            chatwoot_account_id: chatwootAccountId ? Number(chatwootAccountId) : null,
            conversation_id: conversationId ? Number(conversationId) : null,
            message_id: messageId ? Number(messageId) : null,
            reason,
            status: "needs_review",
            metadata: {
              message_text: messageText ?? null,
              sender_phone: senderPhone ?? null,
              received_company_id: rawCompanyId,
              received_city: city ?? null,
              whatsapp_minimal: true,
            },
          })
          .select("id")
          .maybeSingle();

        return json(
          {
            state: "needs_review",
            success: false,
            transaction_id: null,
            inbox_id: inbox0?.id ?? null,
            reason,
            message: "Empresa ou cidade não reconhecida",
          },
          422
        );
      }
      minimalCity = resolution.city;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let extracted: Record<string, unknown> | null = null;

    if (LOVABLE_API_KEY) {
      try {
        const uint8 = new Uint8Array(fileBuffer);
        let binary = "";
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        const base64 = btoa(binary);

        const minimalPrompt = `Você é um assistente especializado em analisar comprovantes de pagamento brasileiros.
Extraia APENAS os campos contábeis abaixo em JSON:

{
  "amount": 1234.56,
  "due_date": "2026-03-15",
  "payment_date": "2026-03-14",
  "is_paid": true
}

Regras:
- amount: valor numérico, sem formatação. Use o valor efetivamente pago.
- due_date/payment_date: formato YYYY-MM-DD. Null se não constar.
- is_paid: true se o comprovante indica pagamento efetuado.
- NÃO extraia descrição, favorecido, pagador, CNPJ, observações ou categoria.
- Se não conseguir extrair um campo, use null.
- Retorne APENAS o JSON, sem explicações.`;

        const fullPrompt = `Você é um assistente especializado em analisar comprovantes de pagamento brasileiros.
Analise a imagem/PDF do comprovante e extraia os seguintes campos em JSON:

{
  "description": "Descrição curta do pagamento",
  "amount": 1234.56,
  "due_date": "2026-03-15",
  "payment_date": "2026-03-14",
  "type": "despesa",
  "notes": "Observações relevantes como beneficiário, número do documento, etc",
  "category_suggestion": "Sugestão de categoria",
  "is_paid": true,
  "payer_name": "Razão social do PAGADOR (quem pagou)",
  "payer_cnpj": "CNPJ do PAGADOR somente números",
  "beneficiary_name": "Razão social do BENEFICIÁRIO (quem recebeu)"
}

Regras:
- amount: valor numérico, sem formatação. Use o valor efetivamente pago.
- due_date/payment_date: formato YYYY-MM-DD. Null se não constar.
- payer_cnpj: CNPJ/CPF do pagador/conta de origem, somente dígitos. NUNCA use o CNPJ do beneficiário.
- type: "despesa" para pagamentos feitos, "receita" para recebimentos. Na dúvida, "despesa".
- is_paid: true se o comprovante indica pagamento efetuado.
- Se não conseguir extrair um campo, use null.
- Retorne APENAS o JSON, sem explicações.`;

        const systemPrompt = whatsappMinimal ? minimalPrompt : fullPrompt;

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
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:${file.type};base64,${base64}` } },
                  {
                    type: "text",
                    text: messageText
                      ? `Analise este comprovante. Contexto adicional da mensagem: "${messageText}"`
                      : "Analise este comprovante de pagamento e extraia as informações.",
                  },
                ],
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          const content = aiResult.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            extracted = whatsappMinimal
              ? {
                  amount: parsed?.amount ?? null,
                  payment_date: parsed?.payment_date ?? null,
                  due_date: parsed?.due_date ?? null,
                  is_paid: parsed?.is_paid ?? null,
                }
              : parsed;
          }
        } else {
          console.error("AI error:", aiResponse.status, await aiResponse.text());
        }
      } catch (aiErr) {
        console.error("AI extraction failed:", aiErr);
      }
    }

    // ---- 4) Resolve company: caption > "Escritório - Cidade" > payer CNPJ/name
    // In the minimal WhatsApp contract, company_id always comes from the payload
    // and "Escritório <cidade>" is a CITY, never a company redirect.
    const escritorioPattern = /escrit[óo]rio\s*[-–]\s*(.+)/i;
    const escritorioMatch = whatsappMinimal
      ? null
      : (messageText || "").match(escritorioPattern);
    const escritorioCity = escritorioMatch ? escritorioMatch[1].trim() : null;

    let targetCompanyId: string | null = escritorioMatch
      ? ESCRITORIO_COMPANY_ID
      : rawCompanyId;
    let companyResolvedBy = escritorioMatch ? "caption_escritorio" : rawCompanyId ? "payload" : null;

    if (!targetCompanyId) {
      const payerCnpj = onlyDigits(extracted?.payer_cnpj);
      const payerName = String(extracted?.payer_name ?? "").trim();
      const { data: companies } = await adminClient.from("companies").select("id, name, cnpj");
      if (companies) {
        if (payerCnpj.length >= 11) {
          const byCnpj = companies.find((c) => onlyDigits(c.cnpj) === payerCnpj);
          if (byCnpj) {
            targetCompanyId = byCnpj.id;
            companyResolvedBy = "payer_cnpj";
          }
        }
        if (!targetCompanyId && payerName) {
          const norm = (s: string) =>
            s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          const target = norm(payerName);
          const byName = companies.find((c) => {
            const cn = norm(c.name);
            return cn.length >= 4 && (target.includes(cn) || cn.includes(target));
          });
          if (byName) {
            targetCompanyId = byName.id;
            companyResolvedBy = "payer_name";
          }
        }
      }
    }

    const extractedAmount = Number(extracted?.amount ?? 0);
    const hasAmount = Number.isFinite(extractedAmount) && extractedAmount > 0;

    // ---- 5) Store the file (inbox folder when company is unknown)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const safeName = sanitizeName(file.name);
    const folder = targetCompanyId ?? "inbox";
    const filePath = `${folder}/${year}/${month}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await adminClient.storage
      .from("receipts")
      .upload(filePath, fileBuffer, { contentType: file.type });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return json({ error: "Failed to upload file", details: uploadError.message }, 500);
    }

    const { data: signedData } = await adminClient.storage
      .from("receipts")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 5);
    const fileUrl = signedData?.signedUrl || filePath;

    // ---- 6) No company OR no reliable amount => inbox queue (never a 0,00 transaction)
    if (!targetCompanyId || !hasAmount) {
      const reason = !targetCompanyId
        ? "Empresa não identificada pelo CNPJ/nome do pagador"
        : "Valor não identificado no comprovante";

      const { data: inboxRow, error: inboxError } = await adminClient
        .from("financial_unassigned_documents")
        .insert({
          company_id: targetCompanyId,
          document_sha256: fileHash,
          storage_bucket: "receipts",
          storage_path: filePath,
          original_filename: safeName,
          mime_type: file.type,
          file_size_bytes: fileBuffer.byteLength,
          source_type: "whatsapp",
          chatwoot_account_id: chatwootAccountId ? Number(chatwootAccountId) : null,
          conversation_id: conversationId ? Number(conversationId) : null,
          message_id: messageId ? Number(messageId) : null,
          payer_cnpj: onlyDigits(extracted?.payer_cnpj) || null,
          payer_name: (extracted?.payer_name as string) || null,
          extracted_amount: hasAmount ? extractedAmount : null,
          extracted_due_date: (extracted?.due_date as string) || null,
          extracted_payment_date: (extracted?.payment_date as string) || null,
          extracted_description: (extracted?.description as string) || null,
          reason,
          status: "needs_review",
          metadata: {
            message_text: messageText ?? null,
            sender_phone: senderPhone ?? null,
            beneficiary_name: extracted?.beneficiary_name ?? null,
            category_suggestion: extracted?.category_suggestion ?? null,
            extracted,
          },
        })
        .select("id")
        .single();

      if (inboxError) {
        console.error("Inbox insert error:", inboxError);
        return json({ error: "Failed to queue document", details: inboxError.message }, 500);
      }

      return json(
        {
          state: "needs_review",
          success: false,
          transaction_id: null,
          inbox_id: inboxRow.id,
          reason,
          data: extracted,
        },
        200
      );
    }

    // ---- 7) Company known and amount valid: deterministic city/category inference
    // Minimal contract: city sent by the parser is canonical, no category inference.
    let inferredCity: string | null = null;
    let inferredCategoryName: string | null = null;
    if (messageText && !whatsappMinimal) {
      try {
        const { data: cityRpc } = await adminClient.rpc("infer_financial_city_from_message", {
          _company_id: targetCompanyId,
          _message: messageText,
        });
        if (typeof cityRpc === "string") inferredCity = cityRpc;
      } catch (e) {
        console.error("city rpc error", e);
      }
      try {
        const { data: catRpc } = await adminClient.rpc("infer_financial_category_name", {
          _message: messageText,
        });
        if (typeof catRpc === "string") inferredCategoryName = catRpc;
      } catch (e) {
        console.error("cat rpc error", e);
      }
    }

    const canonicalCity = (city || "").trim() || null;

    const txType = whatsappMinimal
      ? "despesa"
      : VALID_TYPES.includes(String(extracted?.type))
        ? String(extracted?.type)
        : type;
    const paymentDate = (extracted?.payment_date as string) || null;
    const dueDate =
      (extracted?.due_date as string) || paymentDate || now.toISOString().split("T")[0];
    const baseNotes = senderPhone
      ? `Enviado por: ${senderPhone}${messageText ? ` | Msg: ${messageText}` : ""}`
      : messageText || "";
    const aiNotes = whatsappMinimal ? "" : (extracted?.notes as string) || "";

    let categoryId: string | null = null;
    const catName = whatsappMinimal
      ? null
      : inferredCategoryName || (extracted?.category_suggestion as string) || null;
    if (catName) {
      try {
        const { data: catId } = await adminClient.rpc("upsert_financial_category", {
          _company_id: targetCompanyId,
          _name: catName,
          _type: txType,
        });
        if (typeof catId === "string") categoryId = catId;
      } catch (e) {
        console.error("upsert cat rpc error", e);
      }
    }

    const { data: txData, error: txError } = await adminClient
      .from("financial_transactions")
      .insert({
        company_id: targetCompanyId,
        type: txType,
        description: whatsappMinimal
          ? ""
          : (extracted?.description as string) || "Comprovante recebido",
        amount: extractedAmount,
        due_date: dueDate,
        payment_date: extracted?.is_paid ? paymentDate || dueDate : paymentDate,
        status: extracted?.is_paid ? "pago" : "pendente",
        attachment_url: fileUrl,
        file_hash: fileHash,
        city: whatsappMinimal
          ? minimalCity ?? canonicalCity
          : escritorioCity || inferredCity || city,
        category_id: categoryId,
        notes: [baseNotes, aiNotes].filter(Boolean).join("\n---\n") || null,
      })
      .select("id")
      .single();

    if (txError) {
      console.error("Insert error:", txError);
      if ((txError as { code?: string }).code === "23505") {
        return json(
          { state: "duplicate", success: false, duplicate: true, transaction_id: null },
          409
        );
      }
      return json(
        { error: "Failed to create transaction", details: txError.message, state: "failed" },
        500
      );
    }

    const transactionId = txData.id;

    try {
      const { error: srcError } = await adminClient.from("financial_source_documents").upsert(
        {
          company_id: targetCompanyId,
          transaction_id: transactionId,
          source_type: "whatsapp",
          source_key: `whatsapp:${fileHash}`,
          document_sha256: fileHash,
          storage_bucket: "receipts",
          storage_path: filePath,
          original_filename: safeName,
          mime_type: file.type,
          file_size_bytes: fileBuffer.byteLength,
          attachment_status: "stored",
          processing_status: "processed",
          processed_at: new Date().toISOString(),
          metadata: {
            sender_phone: senderPhone ?? null,
            company_resolved_by: companyResolvedBy,
            payer_cnpj: onlyDigits(extracted?.payer_cnpj) || null,
          },
        },
        { onConflict: "company_id,source_key" }
      );
      if (srcError) console.error("source document upsert error:", srcError);
    } catch (e) {
      console.error("source document upsert failed", e);
    }

    return json({
      state: "processed",
      success: true,
      transaction_id: transactionId,
      id: transactionId,
      company_id: targetCompanyId,
      company_resolved_by: companyResolvedBy,
      extracted: !!extracted,
      data: extracted,
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return json(
      { state: "failed", error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
