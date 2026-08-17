export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Corpo JSON inválido");
  }
}

export function handleError(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error("[api]", e);
  return json({ error: "Erro interno do servidor" }, 500);
}

export function required(value: unknown, message: string): asserts value {
  if (value === undefined || value === null || value === "") throw new HttpError(400, message);
}
