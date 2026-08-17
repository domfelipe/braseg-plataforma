import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, query, readJson } from "../../_lib/http.js";
import { str } from "../../_lib/seguranca.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

const MAX_PHOTOS_PER_GES = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const gesId = new URL(req.url || "/", "http://localhost").pathname.split("/photos")[0].split("/").pop() || "";
    const companyId = url.get("companyId");
    if (!gesId || !companyId) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);
    await assertCompanyAccess(userId, companyId);

    const ges = await db().query("SELECT * FROM seg_ges WHERE id = $1", [gesId]);
    if ((ges.rowCount ?? 0) === 0) return json(res, { error: "GES não encontrado" }, 404);
    const clientId = ges.rows[0].client_id;
    const owner = await db().query("SELECT 1 FROM seg_clients WHERE id = $1 AND company_id = $2 AND status = 'ativo'", [clientId, companyId]);
    if ((owner.rowCount ?? 0) === 0) return json(res, { error: "Sem acesso a este GES" }, 403);

    if (req.method === "GET") {
      const rows = await db().query(
        "SELECT id, blob_url, caption, created_at FROM seg_ges_photos WHERE ges_id = $1 ORDER BY created_at",
        [gesId]
      );
      return json(res, { photos: rows.rows });
    }

    if (req.method === "POST") {
      const body = await readJson<Record<string, unknown>>(req);
      const dataUrl = str(body.data_url, "Foto obrigatória");
      if (!dataUrl.startsWith("data:image/")) return json(res, { error: "Formato de imagem inválido" }, 400);
      const approxBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4);
      if (approxBytes > MAX_PHOTO_BYTES) return json(res, { error: "Foto excede 5MB mesmo após compressão" }, 400);

      const count = await db().query("SELECT count(*)::int AS n FROM seg_ges_photos WHERE ges_id = $1", [gesId]);
      if ((count.rows[0]?.n ?? 0) >= MAX_PHOTOS_PER_GES) {
        return json(res, { error: "Limite de " + MAX_PHOTOS_PER_GES + " fotos por GES atingido" }, 400);
      }

      let blobUrl = dataUrl;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const { put } = await import("@vercel/blob");
        const { url: uploaded } = await put(
          "seguranca/" + companyId + "/" + clientId + "/photos/" + gesId + "/" + crypto.randomUUID() + ".jpg",
          dataUrl,
          { access: "public", contentType: "image/jpeg" }
        );
        blobUrl = uploaded;
      }

      const inserted = await db().query(
        "INSERT INTO seg_ges_photos (ges_id, blob_url, caption) VALUES ($1, $2, $3) RETURNING *",
        [gesId, blobUrl, typeof body.caption === "string" ? body.caption.trim() : ""]
      );
      return json(res, { photo: inserted.rows[0] }, 201);
    }

    if (req.method === "DELETE") {
      const photoId = url.get("photoId");
      if (!photoId) return json(res, { error: "photoId obrigatório" }, 400);
      const photo = await db().query("SELECT * FROM seg_ges_photos WHERE id = $1 AND ges_id = $2", [photoId, gesId]);
      if ((photo.rowCount ?? 0) === 0) return json(res, { error: "Foto não encontrada" }, 404);
      if (photo.rows[0].blob_url.startsWith("https://") && process.env.BLOB_READ_WRITE_TOKEN) {
        const { del } = await import("@vercel/blob");
        await del(photo.rows[0].blob_url).catch(() => undefined);
      }
      await db().query("DELETE FROM seg_ges_photos WHERE id = $1", [photoId]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
