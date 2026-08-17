import { json } from "../_lib/http.js";
import type { IncomingMessage, ServerResponse } from "http";
import catalogsHandler from "./_handlers/catalogs.js";
import clientActionPlanHandler from "./_handlers/client-action-plan.js";
import clientEmployeesHandler from "./_handlers/client-employees.js";
import clientGesHandler from "./_handlers/client-ges.js";
import clientIndexHandler from "./_handlers/client-index.js";
import clientInventoryHandler from "./_handlers/client-inventory.js";
import clientRolesHandler from "./_handlers/client-roles.js";
import clientSectorsHandler from "./_handlers/client-sectors.js";
import clientsHandler from "./_handlers/clients.js";
import documentIdHandler from "./_handlers/document-id.js";
import documentsHandler from "./_handlers/documents.js";
import gesPhotosHandler from "./_handlers/ges-photos.js";
import syncHandler from "./_handlers/sync.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

/**
 * Router único do módulo Segurança do Trabalho (catch-all).
 * Consolida todas as rotas em UMA função serverless — o plano Vercel
 * limita a 12 funções por deploy e o padrão anterior criava 15+.
 */
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const parts = pathname.replace(/^\/api\/seguranca\/?/, "").split("/").filter(Boolean);

  let h: Handler | undefined;
  if (parts[0] === "catalogs") {
    h = catalogsHandler;
  } else if (parts[0] === "sync") {
    h = syncHandler;
  } else if (parts[0] === "clients") {
    if (parts.length === 1) h = clientsHandler;
    else if (parts.length === 2) h = clientIndexHandler;
    else if (parts[2] === "sectors") h = clientSectorsHandler;
    else if (parts[2] === "roles") h = clientRolesHandler;
    else if (parts[2] === "employees") h = clientEmployeesHandler;
    else if (parts[2] === "ges") h = clientGesHandler;
    else if (parts[2] === "inventory") h = clientInventoryHandler;
    else if (parts[2] === "action-plan") h = clientActionPlanHandler;
  } else if (parts[0] === "documents") {
    h = parts.length === 1 ? documentsHandler : documentIdHandler;
  } else if (parts[0] === "ges" && parts.length === 3 && parts[2] === "photos") {
    h = gesPhotosHandler;
  }

  if (!h) return json(res, { error: "Rota não encontrada" }, 404);
  await h(req, res);
}
