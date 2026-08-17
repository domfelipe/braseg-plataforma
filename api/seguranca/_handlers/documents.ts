import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, query, readJson } from "../../_lib/http.js";
import { assertClientAccess, str } from "../../_lib/seguranca.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant.js";
import { assembleModel, addYears, formatDate } from "./lib/model.js";
import { renderDocument } from "./lib/document.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

async function storeFile(companyId: string, clientId: string, documentId: string, name: string, buffer: Buffer, contentType: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const { url } = await put("seguranca/" + companyId + "/" + clientId + "/documents/" + documentId + "/" + name, buffer, {
      access: "public",
      contentType,
    });
    return url;
  }
  // Fallback sem token: data URL (padrão do checklist de frota). Upgrade via BLOB_READ_WRITE_TOKEN.
  const prefix = contentType === "application/pdf"
    ? "data:application/pdf;base64,"
    : "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,";
  return prefix + buffer.toString("base64");
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const companyId = url.get("companyId");
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);
    const clientId = url.get("clientId");
    if (!clientId) return json(res, { error: "clientId obrigatório" }, 400);
    await assertClientAccess(clientId, companyId);

    if (req.method === "GET") {
      const rows = await db().query(
        "SELECT id, doc_type, version, status, valid_from, valid_until, catalog_layout_version, generated_at, (docx_blob_url IS NOT NULL) AS has_docx, (pdf_blob_url IS NOT NULL) AS has_pdf FROM seg_documents WHERE client_id = $1 ORDER BY generated_at DESC",
        [clientId]
      );
      return json(res, { documents: rows.rows });
    }

    if (req.method === "POST") {
      const body = await readJson<Record<string, unknown>>(req);
      const docType = str(body.doc_type, "Tipo de documento obrigatório");
      if (docType !== "pgr" && docType !== "pgrtr") return json(res, { error: "Tipo de documento inválido (pgr | pgrtr)" }, 400);
      const version = str(body.version, "Versão obrigatória");
      const validFrom = str(body.valid_from, "Data de vigência obrigatória");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) return json(res, { error: "Data de vigência inválida (AAAA-MM-DD)" }, 400);
      const target = str(body.status_target, "Status obrigatório");
      if (target !== "rascunho" && target !== "final") return json(res, { error: "Status inválido" }, 400);
      const signature = typeof body.signature_data_url === "string" && body.signature_data_url.startsWith("data:image/")
        ? body.signature_data_url
        : null;
      if (target === "final" && !signature) {
        return json(res, { error: "Assinatura manuscrita é obrigatória para a versão final" }, 400);
      }
      const consultant = str(body.consultant_name, "Nome do consultor obrigatório");

      // Pré-requisitos (spec §7.4)
      const [gesCount, risksCount, planCount] = await Promise.all([
        db().query("SELECT count(*)::int AS n FROM seg_ges WHERE client_id = $1", [clientId]),
        db().query("SELECT count(*)::int AS n FROM seg_inventory_risks WHERE client_id = $1", [clientId]),
        db().query("SELECT count(*)::int AS n FROM seg_action_plan WHERE client_id = $1", [clientId]),
      ]);
      if (gesCount.rows[0].n === 0) return json(res, { error: "Gere ao menos 1 GES antes de gerar o documento" }, 400);
      if (risksCount.rows[0].n === 0) return json(res, { error: "A matriz de risco está vazia — adicione ao menos 1 risco" }, 400);
      if (planCount.rows[0].n === 0) return json(res, { error: "Salve ao menos 1 item no plano de ação" }, 400);

      const created = await db().query(
        "INSERT INTO seg_documents (client_id, doc_type, version, status, valid_from, generated_by) VALUES ($1, $2, $3, 'gerando', $4, $5) RETURNING *",
        [clientId, docType, version, validFrom, userId]
      );
      const documentId = created.rows[0].id;

      try {
        const model = await assembleModel({
          clientId,
          docType: docType as "pgr" | "pgrtr",
          validFrom,
          consultantName: consultant,
          revisionNote: typeof body.revision_note === "string" && body.revision_note.trim() !== "" ? body.revision_note.trim() : "Emissão inicial",
        });
        const { pdf, docx } = await renderDocument(model, signature);

        const [pdfUrl, docxUrl] = await Promise.all([
          storeFile(companyId, clientId, documentId, model.tipo + "-v" + version + ".pdf", pdf, "application/pdf"),
          storeFile(companyId, clientId, documentId, model.tipo + "-v" + version + ".docx", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ]);

        await db().query(
          "UPDATE seg_documents SET status = $2, valid_until = $3, catalog_layout_version = $4, signature_data_url = $5, pdf_blob_url = $6, docx_blob_url = $7 WHERE id = $1",
          [documentId, target, model.valid_until, model.catalog_version, signature, pdfUrl, docxUrl]
        );
        await db().query(
          "INSERT INTO seg_document_revisions (document_id, version, note, changed_by) VALUES ($1, $2, $3, $4)",
          [documentId, version, model.revision_note, userId]
        );

        const finalRow = await db().query("SELECT * FROM seg_documents WHERE id = $1", [documentId]);
        return json(res, { document: finalRow.rows[0], valid_until: model.valid_until }, 201);
      } catch (e) {
        await db().query("DELETE FROM seg_documents WHERE id = $1", [documentId]);
        throw e;
      }
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
