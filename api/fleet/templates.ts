import { requireUserId } from "../_lib/auth";
import { db } from "../_lib/db";
import { handleError, json, query, readJson } from "../_lib/http";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../_lib/tenant";

export const config = { runtime: "nodejs" };

interface ItemPayload {
  id?: string;
  description: string;
  required?: boolean;
  sort_order?: number;
}

interface TemplatePayload {
  id?: string;
  name?: string;
  category?: string;
  active?: boolean;
  items?: ItemPayload[];
}

const ITEM_FIELDS = ["id", "template_id", "description", "required", "sort_order"];

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    let companyId = url.get("companyId") || "";

    if (req.method === "GET") {
      const tplRes = await db().query(
        "SELECT * FROM fleet_checklist_templates WHERE company_id = $1 ORDER BY created_at",
        [companyId]
      );
      const itemsRes = await db().query(
        "SELECT i.* FROM fleet_checklist_items i JOIN fleet_checklist_templates t ON t.id = i.template_id WHERE t.company_id = $1 ORDER BY i.sort_order",
        [companyId]
      );
      const byTemplate: Record<string, typeof itemsRes.rows> = {};
      for (const it of itemsRes.rows) {
        (byTemplate[it.template_id] = byTemplate[it.template_id] || []).push(it);
      }
      return json(res, tplRes.rows.map((t) => ({ ...t, items: byTemplate[t.id] || [] })));
    }

    let body = {} as TemplatePayload;
    if (req.method === "POST" || req.method === "PATCH") {
      body = await readJson<TemplatePayload>(req);
      const fromBody = (body as unknown as { companyId?: string }).companyId;
      if (fromBody) companyId = fromBody;
    }
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);

    if (req.method === "POST") {
      if (!body.name || body.name.trim().length < 3) return json(res, { error: "Informe um nome com pelo menos 3 caracteres" }, 400);
      const items = body.items || [];
      if (items.length === 0) return json(res, { error: "Adicione pelo menos um item" }, 400);
      const client = await db().connect();
      try {
        await client.query("BEGIN");
        const tpl = await client.query(
          "INSERT INTO fleet_checklist_templates (company_id, name, category, active) VALUES ($1,$2,$3,$4) RETURNING *",
          [companyId, body.name.trim(), body.category ?? "pre_uso", body.active ?? true]
        );
        for (let i = 0; i < items.length; i++) {
          await client.query(
            "INSERT INTO fleet_checklist_items (template_id, description, required, sort_order) VALUES ($1,$2,$3,$4)",
            [tpl.rows[0].id, items[i].description, items[i].required ?? true, items[i].sort_order ?? i + 1]
          );
        }
        await client.query("COMMIT");
        return json(res, tpl.rows[0], 201);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }

    if (req.method === "PATCH") {
      if (!body.id) return json(res, { error: "id obrigatório" }, 400);
      const client = await db().connect();
      try {
        await client.query("BEGIN");
        const sets: string[] = [];
        const vals: unknown[] = [];
        let i = 1;
        for (const [k, v] of [["name", body.name], ["category", body.category], ["active", body.active]] as [string, unknown][]) {
          if (v !== undefined) {
            sets.push(k + " = $" + i++);
            vals.push(v);
          }
        }
        if (sets.length > 0) {
          sets.push("updated_at = now()");
          vals.push(companyId, body.id);
          await client.query("UPDATE fleet_checklist_templates SET " + sets.join(", ") + " WHERE company_id = $" + i++ + " AND id = $" + i, vals);
        }
        if (body.items) {
          const items = body.items;
          const keepIds = items.filter((it) => it.id).map((it) => it.id);
          if (keepIds.length > 0) {
            await client.query(
              "DELETE FROM fleet_checklist_items WHERE template_id = $1 AND NOT (id = ANY($2::uuid[]))",
              [body.id, keepIds]
            );
          } else {
            await client.query("DELETE FROM fleet_checklist_items WHERE template_id = $1", [body.id]);
          }
          for (let idx = 0; idx < items.length; idx++) {
            const it = items[idx];
            if (it.id) {
              await client.query(
                "UPDATE fleet_checklist_items SET description = $1, required = $2, sort_order = $3 WHERE id = $4 AND template_id = $5",
                [it.description, it.required ?? true, idx + 1, it.id, body.id]
              );
            } else {
              await client.query(
                "INSERT INTO fleet_checklist_items (template_id, description, required, sort_order) VALUES ($1,$2,$3,$4)",
                [body.id, it.description, it.required ?? true, idx + 1]
              );
            }
          }
        }
        await client.query("COMMIT");
        return json(res, { ok: true });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }

    if (req.method === "DELETE") {
      const id = url.get("id");
      if (!id) return json(res, { error: "id obrigatório" }, 400);
      await db().query("DELETE FROM fleet_checklist_templates WHERE company_id = $1 AND id = $2", [companyId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
