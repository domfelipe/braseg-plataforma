import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user via anon client
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Parse form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const companyId = formData.get("company_id") as string | null;
    const type = (formData.get("type") as string) || "despesa";

    // Validate
    if (!file) {
      return new Response(JSON.stringify({ error: "file is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!companyId) {
      return new Response(JSON.stringify({ error: "company_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTypes = ["receita", "despesa"];
    if (!validTypes.includes(type)) {
      return new Response(
        JSON.stringify({ error: "type must be 'receita' or 'despesa'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check company access
    const { data: hasAccess } = await adminClient.rpc("has_company_access", {
      _user_id: userId,
      _company_id: companyId,
    });

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file type
    const allowedMimes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
    ];
    if (!allowedMimes.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: "File type not allowed. Use PDF, JPG, PNG or WebP." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload file
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const filePath = `${companyId}/${year}/${month}/${Date.now()}_${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from("receipts")
      .upload(filePath, fileBuffer, { contentType: file.type });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload file", details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get signed URL
    const { data: signedData } = await adminClient.storage
      .from("receipts")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 5);

    const fileUrl = signedData?.signedUrl || filePath;

    // Create temporary transaction
    const { data: txData, error: txError } = await adminClient
      .from("financial_transactions")
      .insert({
        company_id: companyId,
        type,
        description: "Processando comprovante...",
        amount: 0,
        due_date: now.toISOString().split("T")[0],
        status: "processando",
        attachment_url: fileUrl,
        created_by: userId,
      })
      .select("id")
      .single();

    if (txError) {
      console.error("Insert error:", txError);
      return new Response(
        JSON.stringify({ error: "Failed to create transaction", details: txError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transactionId = txData.id;

    // AI extraction
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let extracted: Record<string, unknown> | null = null;

    if (LOVABLE_API_KEY) {
      try {
        const uint8 = new Uint8Array(fileBuffer);
        let binary = "";
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);

        const systemPrompt = `Você é um assistente especializado em analisar comprovantes de pagamento brasileiros.
Analise a imagem/PDF do comprovante e extraia os seguintes campos em JSON:

{
  "description": "Descrição curta do pagamento (ex: 'Conta de luz - CEEE', 'Aluguel escritório', 'Folha de pagamento Jan/2026')",
  "amount": 1234.56,
  "due_date": "2026-03-15",
  "payment_date": "2026-03-14",
  "type": "despesa",
  "notes": "Observações relevantes como beneficiário, número do documento, etc",
  "category_suggestion": "Sugestão de categoria (ex: 'Energia Elétrica', 'Aluguel', 'Folha de Pagamento', 'Água e Saneamento', 'Telefonia', 'Material de Escritório')",
  "is_paid": true
}

Regras:
- amount: valor numérico, sem formatação. Use o valor efetivamente pago quando disponível.
- due_date: data de vencimento no formato YYYY-MM-DD. Se não houver, use a data do pagamento.
- payment_date: data em que o pagamento foi efetuado, formato YYYY-MM-DD. Null se não constar.
- type: "despesa" para pagamentos feitos, "receita" para recebimentos. Na dúvida, use "despesa".
- is_paid: true se o comprovante indica que o pagamento já foi efetuado.
- Se não conseguir extrair um campo, use null.
- Retorne APENAS o JSON, sem explicações.`;

        const userContent = [
          {
            type: "image_url",
            image_url: { url: `data:${file.type};base64,${base64}` },
          },
          {
            type: "text",
            text: "Analise este comprovante de pagamento e extraia as informações.",
          },
        ];

        const aiResponse = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
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
          }
        );

        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          const content = aiResult.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extracted = JSON.parse(jsonMatch[0]);
          }
        } else {
          const errText = await aiResponse.text();
          console.error("AI error:", aiResponse.status, errText);
        }
      } catch (aiErr) {
        console.error("AI extraction failed:", aiErr);
      }
    }

    // Update transaction with extracted data
    const updatePayload: Record<string, unknown> = {};

    // Check if AI extracted description matches "Escritório - [CIDADE]" pattern for rerouting
    const ESCRITORIO_COMPANY_ID = "e8f5e3a1-1b2c-4d5e-9f0a-1b2c3d4e5f6a";
    const escritorioPattern = /escrit[óo]rio\s*[-–]\s*(.+)/i;
    let targetCompanyId = companyId;

    if (extracted) {
      const descForRouting = String(extracted.description || "");
      const escritorioMatch = descForRouting.match(escritorioPattern);
      if (escritorioMatch) {
        targetCompanyId = ESCRITORIO_COMPANY_ID;
        updatePayload.company_id = ESCRITORIO_COMPANY_ID;
        updatePayload.city = escritorioMatch[1].trim();
      }

      if (extracted.description) updatePayload.description = extracted.description;
      if (extracted.amount && Number(extracted.amount) > 0)
        updatePayload.amount = Number(extracted.amount);
      if (extracted.due_date) updatePayload.due_date = extracted.due_date;
      if (extracted.payment_date) updatePayload.payment_date = extracted.payment_date;
      if (extracted.type && validTypes.includes(extracted.type as string))
        updatePayload.type = extracted.type;
      if (extracted.notes) updatePayload.notes = extracted.notes;

      updatePayload.status = extracted.is_paid ? "pago" : "pendente";

      // Try to find or create category
      if (extracted.category_suggestion) {
        const catName = String(extracted.category_suggestion);
        const txType = (extracted.type as string) || type;
        const { data: existingCat } = await adminClient
          .from("financial_categories")
          .select("id")
          .eq("company_id", targetCompanyId)
          .eq("type", txType)
          .ilike("name", catName)
          .limit(1)
          .maybeSingle();

        if (existingCat) {
          updatePayload.category_id = existingCat.id;
        } else {
          const { data: newCat } = await adminClient
            .from("financial_categories")
            .insert({ company_id: targetCompanyId, name: catName, type: txType })
            .select("id")
            .single();
          if (newCat) updatePayload.category_id = newCat.id;
        }
      }
    } else {
      updatePayload.status = "pendente";
      updatePayload.description = "Comprovante recebido (extração falhou)";
    }

    if (Object.keys(updatePayload).length > 0) {
      await adminClient
        .from("financial_transactions")
        .update(updatePayload)
        .eq("id", transactionId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: transactionId,
        extracted: !!extracted,
        data: extracted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
