import type { IncomingMessage, ServerResponse } from "http";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(res: ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function query(req: IncomingMessage): URLSearchParams {
  return new URL(req.url || "/", "http://localhost").searchParams;
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 25 * 1024 * 1024) {
        reject(new HttpError(413, "Corpo muito grande"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw) throw new HttpError(400, "Corpo JSON obrigatório");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "Corpo JSON inválido");
  }
}

export function handleError(res: ServerResponse, e: unknown): void {
  if (e instanceof HttpError) {
    json(res, { error: e.message }, e.status);
    return;
  }
  console.error("[api]", e);
  json(res, { error: "Erro interno do servidor" }, 500);
}

export function required(value: unknown, message: string): asserts value {
  if (value === undefined || value === null || value === "") throw new HttpError(400, message);
}

/**
 * Extrai companyId do body JSON (POST/PATCH/PUT) ou da query string (GET/DELETE).
 * O frontend envia companyId no body para mutações e na query para leituras;
 * esta função unifica os dois padrões.
 */
export async function resolveCompanyId(
  req: IncomingMessage,
  body?: Record<string, unknown>,
): Promise<string> {
  // Prioriza body (mutações), depois query string (leituras)
  if (body && typeof body.companyId === "string" && body.companyId) return body.companyId;
  const fromQuery = query(req).get("companyId");
  if (fromQuery) return fromQuery;
  throw new HttpError(400, "companyId obrigatório");
}
