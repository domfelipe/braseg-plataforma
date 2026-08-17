import { createClerkClient } from "@clerk/backend";
import type { IncomingMessage } from "http";
import { HttpError } from "./http";

let clerk: ReturnType<typeof createClerkClient> | null = null;

function getClerk() {
  if (!clerk) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new HttpError(500, "CLERK_SECRET_KEY não configurada");
    clerk = createClerkClient({ secretKey });
  }
  return clerk;
}

/** Valida o Bearer token do Clerk e devolve o user id (sub). */
export async function requireUserId(req: IncomingMessage): Promise<string> {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    throw new HttpError(401, "Não autenticado");
  }
  const token = header.slice(7);
  try {
    const sess = await getClerk().sessions.verifySession(token, token);
    if (!sess.userId) throw new Error("token sem userId");
    return sess.userId;
  } catch {
    throw new HttpError(401, "Sessão inválida ou expirada");
  }
}