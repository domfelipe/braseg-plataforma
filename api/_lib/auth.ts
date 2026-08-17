import { createRemoteJWKSet, jwtVerify } from "jose";
import type { IncomingMessage } from "http";
import { HttpError } from "./http.js";
import { ensureLocalEnv } from "./env.js";

/**
 * Verificação de sessão do Clerk via JWKS (padrão oficial p/ APIs externas).
 * O issuer é derivado da publishable key: pk_<base64(slug.clerk.accounts.dev$)>.
 * O claim azp do token de sessão é a ORIGEM do app — a validação real é a
 * assinatura + issuer (instância Clerk correta).
 */

function clerkIssuer(): string {
  ensureLocalEnv();
  const configured = process.env.CLERK_ISSUER || "";
  if (configured) return configured.replace(/\/$/, "");
  const pk = process.env.VITE_CLERK_PUBLISHABLE_KEY || "";
  if (!pk.startsWith("pk_")) throw new HttpError(500, "CLERK_ISSUER ou VITE_CLERK_PUBLISHABLE_KEY não configurada");
  const decoded = Buffer.from(pk.slice(8), "base64").toString("utf8");
  const host = decoded.replace(/\$/, "");
  return "https://" + host;
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function jwks() {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(clerkIssuer() + "/.well-known/jwks.json"));
  }
  return jwksCache;
}

/** Valida o Bearer token (JWT de sessão do Clerk) e devolve o user id (sub). */
export async function requireUserId(req: IncomingMessage): Promise<string> {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    throw new HttpError(401, "Não autenticado");
  }
  const token = header.slice(7);
  try {
    const { payload } = await jwtVerify(token, jwks(), { issuer: clerkIssuer() });
    if (!payload.sub) throw new Error("token sem sub");
    return payload.sub;
  } catch (e) {
    console.error("[auth] falha:", e);
    throw new HttpError(401, "Sessão inválida ou expirada");
  }
}