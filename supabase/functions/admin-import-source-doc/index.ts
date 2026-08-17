// Admin-only ingest of a single receipt document.
// Given { source_key, company_id, sha256, size_bytes, mime_type, filename },
// either returns a signed upload URL (new file) or marks it as duplicate (already stored).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  source_key: z.string().min(3).max(200),
  company_id: z.string().uuid(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size_bytes: z.number().int().nonnegative().max(50_000_000),
  mime_type: z.string().default("application/pdf"),
  filename: z.string().min(1).max(255),
  transaction_id: z.string().uuid().optional(),
  batch_label: z.string().max(80).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(url, service);
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["master", "super-admin"]);
    if (!roleRows || roleRows.length === 0) {
      return new Response(JSON.stringify({ error: "Somente master/super-admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const b = parsed.data;
    const storagePath = `${b.company_id}/${b.sha256}.pdf`;
    const batch = b.batch_label ?? `admin-ui:${new Date().toISOString().slice(0, 10)}`;

    // 1) Duplicate by sha inside same company?
    const { data: dupBySha } = await admin
      .from("financial_source_documents")
      .select("id, source_key, transaction_id")
      .eq("company_id", b.company_id)
      .eq("document_sha256", b.sha256)
      .maybeSingle();

    // 2) Same source_key already?
    const { data: bySourceKey } = await admin
      .from("financial_source_documents")
      .select("id, attachment_status, document_sha256, transaction_id")
      .eq("source_key", b.source_key)
      .maybeSingle();

    // Case A: SHA already exists for another source_key → link as duplicate_confirmed (no re-upload)
    if (dupBySha && (!bySourceKey || bySourceKey.id !== dupBySha.id)) {
      if (bySourceKey) {
        await admin.from("financial_source_documents")
          .update({
            attachment_status: "stored",
            processing_status: "duplicate_confirmed",
            duplicate_of_document_id: dupBySha.id,
            original_filename: b.filename,
            mime_type: b.mime_type,
            file_size_bytes: b.size_bytes,
            processed_at: new Date().toISOString(),
            metadata: { import_batch: batch, duplicate_of_source_key: dupBySha.source_key, duplicate_sha256: b.sha256 },
          })
          .eq("id", bySourceKey.id);
      } else {
        await admin.from("financial_source_documents").insert({
          company_id: b.company_id,
          source_type: "chatwoot",
          source_key: b.source_key,
          duplicate_of_document_id: dupBySha.id,
          attachment_status: "stored",
          processing_status: "duplicate_confirmed",
          original_filename: b.filename,
          mime_type: b.mime_type,
          file_size_bytes: b.size_bytes,
          storage_bucket: "receipts",
          storage_path: storagePath,
          processed_at: new Date().toISOString(),
          metadata: { import_batch: batch, duplicate_of_source_key: dupBySha.source_key, duplicate_sha256: b.sha256 },
        });
      }
      return new Response(JSON.stringify({ status: "duplicate", storage_path: storagePath, duplicate_of: dupBySha.source_key }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Case B: New file → sign upload URL, then upsert row as pending
    const { data: signed, error: signErr } = await admin.storage
      .from("receipts")
      .createSignedUploadUrl(storagePath, { upsert: true });
    if (signErr) throw signErr;

    if (bySourceKey) {
      await admin.from("financial_source_documents").update({
        document_sha256: b.sha256,
        storage_bucket: "receipts",
        storage_path: storagePath,
        original_filename: b.filename,
        mime_type: b.mime_type,
        file_size_bytes: b.size_bytes,
        attachment_status: "downloading",
        processing_status: "processing",
        transaction_id: b.transaction_id ?? bySourceKey.transaction_id ?? null,
        last_error_code: null,
        last_error_message: null,
        metadata: { import_batch: batch, pending_upload: true },
      }).eq("id", bySourceKey.id);
    } else {
      await admin.from("financial_source_documents").insert({
        company_id: b.company_id,
        source_type: "chatwoot",
        source_key: b.source_key,
        document_sha256: b.sha256,
        storage_bucket: "receipts",
        storage_path: storagePath,
        original_filename: b.filename,
        mime_type: b.mime_type,
        file_size_bytes: b.size_bytes,
        attachment_status: "downloading",
        processing_status: "processing",
        transaction_id: b.transaction_id ?? null,
        metadata: { import_batch: batch, pending_upload: true },
      });
    }

    return new Response(JSON.stringify({
      status: "upload_required",
      storage_bucket: "receipts",
      storage_path: storagePath,
      upload_url: signed.signedUrl,
      upload_token: signed.token,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("admin-import-source-doc error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
