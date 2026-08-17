// Idempotent, auditable import of Chatwoot receipt attachments by direct URL.
// Batch: chatwoot-milena-pos-2026-07-29-1416
// dry_run=true (default) => no writes to financial_transactions.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANIES: Record<string, { id: string; label: string }> = {
  acudir: { id: "7690fb96-6492-48ad-a410-f39092987db6", label: "Acudir" },
  forte: { id: "c963c261-bde2-4da9-9f02-829e8e48d25c", label: "Forte" },
  smg: { id: "da1f794b-d847-4137-a0b8-f1a932bce3b8", label: "SMG" },
  roversi: { id: "cb494ec4-d109-4541-aada-e5e07ab4e03e", label: "Roversi" },
  vgaf: { id: "6517a33a-ac87-4644-b300-4327c46dcbd0", label: "VGAF" },
};

const Item = z.object({
  message_id: z.number().int().positive(),
  caption: z.string().min(1).max(500),
  attachment_url: z.string().url(),
});

const Body = z.object({
  dry_run: z.boolean().default(true),
  batch: z.string().min(3).max(80).default("chatwoot-milena-pos-2026-07-29-1416"),
  account_id: z.number().int().default(9),
  conversation_id: z.number().int().default(2),
  only_message_ids: z.array(z.number().int()).optional(),
  items: z.array(Item).min(1).max(60),
});

const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];

function norm(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCompanyKey(caption: string): string | null {
  const m = norm(caption);
  if (/\bvgaf\b/.test(m)) return "vgaf";
  if (/\bsmg\b/.test(m)) return "smg";
  if (/\bacudir\b/.test(m)) return "acudir";
  if (/\bforte\b/.test(m)) return "forte";
  if (/\broversi\b/.test(m)) return "roversi";
  return null;
}

async function sha256Hex(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extFor(mime: string) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

const SYSTEM_PROMPT = `Você é um assistente especializado em analisar comprovantes de pagamento brasileiros.
Analise a imagem/PDF do comprovante e extraia os seguintes campos em JSON:

{
  "description": "Descrição curta do pagamento",
  "amount": 1234.56,
  "due_date": "2026-07-30",
  "payment_date": "2026-07-30",
  "type": "despesa",
  "notes": "Observações relevantes como beneficiário, número do documento, etc",
  "category_suggestion": "Sugestão de categoria",
  "is_paid": true
}

Regras:
- amount: valor numérico, sem formatação, EXTRAÍDO DO COMPROVANTE. Nunca invente. Se ilegível, use null.
- due_date: YYYY-MM-DD. Se não houver, use a data do pagamento.
- payment_date: data efetiva do pagamento, YYYY-MM-DD. Null se não constar.
- type: "despesa" para pagamentos feitos, "receita" para recebimentos. Na dúvida, "despesa".
- is_paid: true SOMENTE se o comprovante prova que o pagamento foi efetuado.
- Se não conseguir extrair um campo, use null.
- Retorne APENAS o JSON, sem explicações.`;

function parseMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const isoDate = (v: unknown) => {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service);

    // Ops path: shared secret header (admin-run imports, no browser session)
    const opsSecret = Deno.env.get("IMPORT_OPS_SECRET");
    const opsHeader = req.headers.get("x-import-ops-secret");
    const viaOps = !!opsSecret && !!opsHeader && opsHeader === opsSecret;

    const auth = req.headers.get("Authorization");
    if (!viaOps && !auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = (auth ?? "").replace("Bearer ", "");
    let userId: string | null = null;

    let jwtRole: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      jwtRole = payload?.role ?? null;
    } catch { /* not a JWT */ }
    const isServiceRole = token === service || jwtRole === "service_role";
    if (!viaOps && !isServiceRole) {

      const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
      const { data: claims } = await userClient.auth.getClaims(token);
      userId = (claims?.claims?.sub as string) ?? null;
      if (!userId) return json({ error: "Unauthorized", detail: `jwt_role=${jwtRole ?? "none"}` }, 401);
      const { data: roles } = await admin.from("user_roles").select("role")
        .eq("user_id", userId).in("role", ["master", "super-admin"]);
      if (!roles || roles.length === 0) return json({ error: "Somente master/super-admin" }, 403);
    }


    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const items = b.only_message_ids
      ? b.items.filter((i) => b.only_message_ids!.includes(i.message_id))
      : b.items;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY ausente" }, 500);

    const report: any[] = [];

    for (const it of items) {
      const sourceKey = `src:chatwoot:${b.account_id}:${b.conversation_id}:${it.message_id}`;
      const row: any = {
        message_id: it.message_id,
        caption: it.caption,
        source_key: sourceKey,
        outcome: "needs_review",
        reason: null,
        amount: null,
        company: null,
        category: null,
        city: null,
        due_date: null,
        payment_date: null,
        status: null,
        transaction_id: null,
        sha256: null,
        confidence: null,
        notes: null,

      };

      try {
        // 1) company from caption
        const key = inferCompanyKey(it.caption);
        if (!key) {
          row.reason = "empresa_nao_identificada_na_legenda";
          report.push(row);
          continue;
        }
        const company = COMPANIES[key];
        row.company = company.label;

        // 2) download bytes (follow redirects)
        const res = await fetch(it.attachment_url, { redirect: "follow" });
        if (!res.ok) {
          row.reason = `download_falhou_http_${res.status}`;
          report.push(row);
          continue;
        }
        const buf = await res.arrayBuffer();
        let mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        if (!ALLOWED_MIMES.includes(mime)) {
          if (/\.pdf($|\?)/i.test(it.attachment_url)) mime = "application/pdf";
          else {
            row.reason = `mime_nao_suportado:${mime || "desconhecido"}`;
            report.push(row);
            continue;
          }
        }
        if (buf.byteLength < 500) {
          row.reason = "arquivo_vazio_ou_invalido";
          report.push(row);
          continue;
        }
        const sha = await sha256Hex(buf);
        row.sha256 = sha;
        const storagePath = `${company.id}/${sha}.${extFor(mime)}`;

        // 3) dedupe layers
        const { data: dupTx } = await admin
          .from("financial_transactions")
          .select("id, amount, status, city, due_date, payment_date")
          .eq("company_id", company.id)
          .eq("file_hash", sha)
          .maybeSingle();

        const { data: existingDoc } = await admin
          .from("financial_source_documents")
          .select("id, transaction_id, document_sha256, processing_status")
          .eq("source_key", sourceKey)
          .maybeSingle();

        const { data: dupDoc } = await admin
          .from("financial_source_documents")
          .select("id, source_key, transaction_id")
          .eq("company_id", company.id)
          .eq("document_sha256", sha)
          .maybeSingle();

        if (dupTx) {
          row.outcome = "already_exists";
          row.reason = "file_hash ja existe em financial_transactions";
          row.transaction_id = dupTx.id;
          row.amount = Number(dupTx.amount);
          row.status = dupTx.status;
          row.city = dupTx.city;
          row.due_date = dupTx.due_date;
          row.payment_date = dupTx.payment_date;
          if (!b.dry_run) {
            await admin.from("financial_source_documents").upsert({
              company_id: company.id,
              source_type: "chatwoot",
              source_key: sourceKey,
              chatwoot_account_id: b.account_id,
              conversation_id: b.conversation_id,
              attachment_message_id: it.message_id,
              document_sha256: sha,
              storage_bucket: "receipts",
              storage_path: storagePath,
              original_filename: decodeURIComponent(it.attachment_url.split("/").pop() || "comprovante"),
              mime_type: mime,
              file_size_bytes: buf.byteLength,
              attachment_status: "stored",
              processing_status: "duplicate_confirmed",
              transaction_id: dupTx.id,
              duplicate_of_document_id: dupDoc?.id ?? null,
              processed_at: new Date().toISOString(),
              metadata: { import_batch: b.batch, caption: it.caption },
            }, { onConflict: "source_key" });
          }
          report.push(row);
          continue;
        }

        if (dupDoc && (!existingDoc || existingDoc.id !== dupDoc.id)) {
          row.outcome = "duplicate";
          row.reason = `sha256 identico ao documento ${dupDoc.source_key}`;
          row.transaction_id = dupDoc.transaction_id;
          report.push(row);
          continue;
        }

        // 4) deterministic inference (city + category) from caption
        const [{ data: cityRpc }, { data: catRpc }] = await Promise.all([
          admin.rpc("infer_financial_city_from_message", { _company_id: company.id, _message: it.caption }),
          admin.rpc("infer_financial_category_name", { _message: it.caption }),
        ]);
        const inferredCity = typeof cityRpc === "string" ? cityRpc : null;
        const inferredCategory = typeof catRpc === "string" ? catRpc : null;
        row.city = inferredCity;

        // 5) AI extraction (same prompt/model as receive-receipt)
        const u8 = new Uint8Array(buf);
        let binary = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < u8.length; i += CHUNK) {
          binary += String.fromCharCode(...u8.subarray(i, i + CHUNK));
        }
        const base64 = btoa(binary);

        let extracted: Record<string, unknown> | null = null;
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  mime === "application/pdf"
                    ? { type: "file", file: { filename: "comprovante.pdf", file_data: `data:application/pdf;base64,${base64}` } }
                    : { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
                  { type: "text", text: `Analise este comprovante. Contexto da legenda do WhatsApp: "${it.caption}". O valor deve vir do comprovante, nunca da legenda.` },
                ],
              },
            ],
          }),
        });

        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          const content = aiJson.choices?.[0]?.message?.content || "";
          const m = content.match(/\{[\s\S]*\}/);
          if (m) { try { extracted = JSON.parse(m[0]); } catch { /* ignore */ } }
        } else {
          row.reason = `ia_http_${aiRes.status}: ${(await aiRes.text()).slice(0, 160)}`;
        }

        const amount = parseMoney(extracted?.amount);
        const paymentDate = isoDate(extracted?.payment_date);
        const dueDate = isoDate(extracted?.due_date) || paymentDate;
        const type = extracted?.type === "receita" ? "receita" : "despesa";
        const isPaid = extracted?.is_paid === true && !!paymentDate;
        const category = inferredCategory || (extracted?.category_suggestion ? String(extracted.category_suggestion) : null);

        // Regra determinística: legenda com ferias/férias em Forte/SMG => Folha/Salários
        const capNorm = it.caption.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const overrideNotes: string[] = [];
        let finalCategory = category;
        if (/\bferias\b/.test(capNorm) && (company.label === "Forte" || company.label === "SMG")) {
          finalCategory = "Folha/Salários";
        }
        // Exceção determinística: legenda de pedágio prevalece sobre a regra de férias
        if (/pedagio/.test(capNorm)) {
          finalCategory = "Pedágio/Reembolso";
          if (/\bferias\b/.test(capNorm)) {
            overrideNotes.push('Override: categoria forçada para Pedágio/Reembolso; legenda também contém "férias" (impressão de férias), natureza real é pedágio/reembolso.');
          }
        }
        // Divergência documental: legenda indica empresa operacional, pagador do PDF pode ser outro
        const extractedNotesStr = String((extracted?.notes as unknown) ?? (extracted?.observacoes as unknown) ?? "");
        const payerNorm = extractedNotesStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (company.label === "Roversi" && /smg/.test(payerNorm)) {
          overrideNotes.push("Divergencia documental: empresa operacional da legenda = Roversi (mantida); pagador no comprovante = SMG Servicos Ltda.");
        }

        row.amount = amount;
        row.category = finalCategory;
        row.confidence = (extracted?.confidence as unknown) ?? null;
        row.notes = (extracted?.notes as unknown) ?? (extracted?.observacoes as unknown) ?? null;
        if (overrideNotes.length) (row as Record<string, unknown>).overrides = overrideNotes;

        row.due_date = dueDate;
        row.payment_date = paymentDate;
        row.status = amount ? (isPaid ? "pago" : "pendente") : null;

        if (!amount) {
          row.outcome = "needs_review";
          row.reason = row.reason || (extracted ? "valor_nao_extraido_do_comprovante" : "extracao_ia_falhou");
          if (!b.dry_run) {
            await admin.storage.from("receipts").upload(storagePath, buf, { contentType: mime, upsert: true });
            const { data: doc } = await admin.from("financial_source_documents").upsert({
              company_id: company.id, source_type: "chatwoot", source_key: sourceKey,
              chatwoot_account_id: b.account_id, conversation_id: b.conversation_id,
              attachment_message_id: it.message_id, document_sha256: sha,
              storage_bucket: "receipts", storage_path: storagePath,
              original_filename: decodeURIComponent(it.attachment_url.split("/").pop() || "comprovante"),
              mime_type: mime, file_size_bytes: buf.byteLength,
              attachment_status: "stored", processing_status: "needs_review",
              last_error_code: "no_amount", last_error_message: row.reason,
              metadata: { import_batch: b.batch, caption: it.caption, extracted },
            }, { onConflict: "source_key" }).select("id").single();
            if (doc) {
              await admin.from("financial_document_staging").upsert({
                company_id: company.id, source_document_id: doc.id,
                extracted_amount: null, extracted_due_date: dueDate,
                status: "needs_review", last_error_code: "no_amount", last_error_message: row.reason,
              }, { onConflict: "source_document_id" });
            }
          }
          report.push(row);
          continue;
        }

        if (b.dry_run) {
          row.outcome = "would_insert";
          report.push(row);
          continue;
        }

        // 6) persist: storage + source document + transaction + audit
        const up = await admin.storage.from("receipts").upload(storagePath, buf, { contentType: mime, upsert: true });
        if (up.error) throw up.error;
        const { data: signed } = await admin.storage.from("receipts")
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 5);

        let categoryId: string | null = null;
        if (finalCategory) {
          const { data: catId } = await admin.rpc("upsert_financial_category", {
            _company_id: company.id, _name: finalCategory, _type: type,
          });
          if (typeof catId === "string") categoryId = catId;
        }

        const { data: tx, error: txErr } = await admin.from("financial_transactions").insert({
          company_id: company.id,
          type,
          description: (extracted?.description ? String(extracted.description) : it.caption).slice(0, 240),
          amount,
          due_date: dueDate,
          payment_date: isPaid ? paymentDate : null,
          status: isPaid ? "pago" : "pendente",
          category_id: categoryId,
          city: inferredCity,
          file_hash: sha,
          attachment_url: signed?.signedUrl || storagePath,
          created_by: userId,
          notes: `Chatwoot ${b.account_id}/${b.conversation_id} msg ${it.message_id} | Msg: ${it.caption}${extracted?.notes ? `\n---\n${extracted.notes}` : ""}${overrideNotes.length ? `\n---\n${overrideNotes.join("\n")}` : ""}`,
        }).select("id").single();
        if (txErr) throw txErr;

        row.transaction_id = tx.id;
        row.outcome = "inserted";
        row.reason = null;

        const { data: doc } = await admin.from("financial_source_documents").upsert({
          company_id: company.id, source_type: "chatwoot", source_key: sourceKey,
          chatwoot_account_id: b.account_id, conversation_id: b.conversation_id,
          attachment_message_id: it.message_id, document_sha256: sha,
          storage_bucket: "receipts", storage_path: storagePath,
          original_filename: decodeURIComponent(it.attachment_url.split("/").pop() || "comprovante"),
          mime_type: mime, file_size_bytes: buf.byteLength,
          attachment_status: "stored", processing_status: "processed",
          transaction_id: tx.id, processed_at: new Date().toISOString(),
          metadata: { import_batch: b.batch, caption: it.caption, extracted, overrides: overrideNotes },
        }, { onConflict: "source_key" }).select("id").single();

        if (doc) {
          await admin.from("financial_document_staging").upsert({
            company_id: company.id, source_document_id: doc.id,
            legacy_transaction_id: tx.id, extracted_amount: amount, extracted_due_date: dueDate,
            status: "resolved", resolved_at: new Date().toISOString(),
          }, { onConflict: "source_document_id" });
        }

        await admin.from("financial_backfill_audit").insert({
          transaction_id: tx.id, company_id: company.id, batch: b.batch,
          field: "insert", old_value: null, new_value: String(amount),
          reason: `${it.caption} (msg ${it.message_id})`, action: "chatwoot_import", user_id: userId,
          metadata: { sha256: sha, message_id: it.message_id, storage_path: storagePath, extracted, overrides: overrideNotes },
        });
      } catch (e) {
        row.outcome = "needs_review";
        row.reason = `erro: ${String((e as Error).message ?? e).slice(0, 200)}`;
      }
      report.push(row);
    }

    const summary: Record<string, number> = {};
    let totalAmount = 0;
    for (const r of report) {
      summary[r.outcome] = (summary[r.outcome] || 0) + 1;
      if ((r.outcome === "would_insert" || r.outcome === "inserted") && r.amount) totalAmount += Number(r.amount);
    }

    return json({ ok: true, dry_run: b.dry_run, batch: b.batch, total: report.length, summary, total_amount: Number(totalAmount.toFixed(2)), report });
  } catch (e) {
    console.error("import-chatwoot-receipts", e);
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
