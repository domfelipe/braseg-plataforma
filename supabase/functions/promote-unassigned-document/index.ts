import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isMaster } = await adminClient.rpc("is_master", { _user_id: userId });
    if (!isMaster) return json({ error: "Somente master/super-admin" }, 403);

    const body = await req.json().catch(() => null);
    const inboxId = body?.inbox_id as string | undefined;
    const companyId = body?.company_id as string | undefined;
    const action = (body?.action as string) || "promote";

    if (!inboxId) return json({ error: "inbox_id is required" }, 400);

    const { data: doc, error: docError } = await adminClient
      .from("financial_unassigned_documents")
      .select("*")
      .eq("id", inboxId)
      .maybeSingle();
    if (docError || !doc) return json({ error: "Documento não encontrado" }, 404);

    if (action === "discard") {
      await adminClient
        .from("financial_unassigned_documents")
        .update({ status: "discarded", resolved_at: new Date().toISOString(), resolved_by: userId })
        .eq("id", inboxId);
      return json({ state: "discarded", inbox_id: inboxId });
    }

    if (doc.status === "promoted" && doc.promoted_transaction_id) {
      return json({
        state: "processed",
        inbox_id: inboxId,
        transaction_id: doc.promoted_transaction_id,
        idempotent: true,
      });
    }

    if (!companyId) return json({ error: "company_id is required to promote" }, 400);

    const { data: hasAccess } = await adminClient.rpc("has_company_access", {
      _user_id: userId,
      _company_id: companyId,
    });
    if (!hasAccess) return json({ error: "Sem acesso a esta empresa" }, 403);

    // Idempotency by document hash
    const { data: existingTx } = await adminClient
      .from("financial_transactions")
      .select("id")
      .eq("file_hash", doc.document_sha256)
      .limit(1)
      .maybeSingle();

    if (existingTx) {
      await adminClient
        .from("financial_unassigned_documents")
        .update({
          status: "duplicate",
          company_id: companyId,
          promoted_transaction_id: existingTx.id,
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        })
        .eq("id", inboxId);
      return json({ state: "duplicate", inbox_id: inboxId, transaction_id: existingTx.id }, 200);
    }

    const type = (body?.type as string) === "receita" ? "receita" : "despesa";
    const amount = Number(body?.amount ?? doc.extracted_amount ?? 0);
    if (!(amount > 0)) return json({ error: "Valor deve ser maior que zero" }, 400);

    const paymentDate = (body?.payment_date as string) || doc.extracted_payment_date || null;
    const dueDate =
      (body?.due_date as string) || doc.extracted_due_date || paymentDate ||
      new Date().toISOString().split("T")[0];
    const city = (body?.city as string) || null;
    const description =
      (body?.description as string) || doc.extracted_description || "Comprovante importado";

    let categoryId: string | null = (body?.category_id as string) || null;
    const categoryName = (body?.category_name as string) || null;
    if (!categoryId && categoryName) {
      const { data: catId } = await adminClient.rpc("upsert_financial_category", {
        _company_id: companyId,
        _name: categoryName,
        _type: type,
      });
      if (typeof catId === "string") categoryId = catId;
    }

    // Move the file into the company folder so per-company storage policies apply
    let storagePath = doc.storage_path as string;
    if (!storagePath.startsWith(`${companyId}/`)) {
      const parts = storagePath.split("/");
      const newPath = `${companyId}/${parts.slice(1).join("/")}`;
      const { error: moveError } = await adminClient.storage
        .from(doc.storage_bucket)
        .move(storagePath, newPath);
      if (!moveError) storagePath = newPath;
      else console.error("move error", moveError);
    }

    const { data: signedData } = await adminClient.storage
      .from(doc.storage_bucket)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 5);

    const { data: tx, error: txError } = await adminClient
      .from("financial_transactions")
      .insert({
        company_id: companyId,
        type,
        description,
        amount,
        due_date: dueDate,
        payment_date: paymentDate,
        status: paymentDate ? "pago" : "pendente",
        city,
        category_id: categoryId,
        attachment_url: signedData?.signedUrl || storagePath,
        file_hash: doc.document_sha256,
        notes: (body?.notes as string) || `Promovido da triagem sem empresa (inbox ${inboxId})`,
      })
      .select("id")
      .single();

    if (txError) {
      console.error("promote insert error", txError);
      return json({ error: "Falha ao promover", details: txError.message, state: "failed" }, 500);
    }

    await adminClient.from("financial_source_documents").upsert(
      {
        company_id: companyId,
        transaction_id: tx.id,
        source_type: "manual",
        source_key: `inbox:${doc.document_sha256}`,
        document_sha256: doc.document_sha256,
        storage_bucket: doc.storage_bucket,
        storage_path: storagePath,
        original_filename: doc.original_filename,
        mime_type: doc.mime_type,
        file_size_bytes: doc.file_size_bytes,
        attachment_status: "stored",
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        metadata: { promoted_from_inbox: inboxId, promoted_by: userId },
      },
      { onConflict: "company_id,source_key" }
    );

    await adminClient.from("financial_backfill_audit").insert({
      transaction_id: tx.id,
      company_id: companyId,
      batch: "inbox-promotion",
      field: "insert",
      old_value: null,
      new_value: String(amount),
      reason: `Promocao manual de documento sem empresa (inbox ${inboxId})`,
      action: "insert",
      user_id: userId,
      metadata: { sha256: doc.document_sha256, city, category_id: categoryId },
    });

    await adminClient
      .from("financial_unassigned_documents")
      .update({
        status: "promoted",
        company_id: companyId,
        storage_path: storagePath,
        promoted_transaction_id: tx.id,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq("id", inboxId);

    return json({ state: "processed", inbox_id: inboxId, transaction_id: tx.id });
  } catch (err) {
    console.error("promote-unassigned-document error", err);
    return json(
      { state: "failed", error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
