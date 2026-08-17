// Cliente HTTP da API do portal (Vercel Functions + Neon)
// O token do Clerk é injetado pelo hook useAuth (setTokenProvider).

let tokenProvider: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface RequestOptions {
  query?: Record<string, string | number | null | undefined>;
  body?: unknown;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const qs = opts.query
    ? "?" +
      new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : "";

  const token = tokenProvider ? await tokenProvider() : null;

  const res = await fetch("/api" + path + qs, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let msg = "Erro de conexão com o servidor";
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") msg = data.error;
    } catch {
      // corpo não-JSON
    }
    throw new ApiError(res.status, msg);
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  del: <T>(path: string, query?: RequestOptions["query"]) => request<T>("DELETE", path, { query }),
};
