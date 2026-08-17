import type { IncomingMessage, ServerResponse } from "http";
import { json } from "./_lib/http.js";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  json(res, {
    vercel: !!process.env.VERCEL,
    hasClerkIssuer: !!process.env.CLERK_ISSUER,
    hasPk: !!process.env.VITE_CLERK_PUBLISHABLE_KEY,
    hasSecret: !!process.env.CLERK_SECRET_KEY,
    hasDb: !!process.env.DATABASE_URL,
  });
}
