import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    try {
      // Fluid compute (Vercel + Neon): reaproveita o pool entre requests
      attachDatabasePool(pool);
    } catch {
      // Fluid compute não habilitado no projeto — comportamento padrão do pg
    }
  }
  return pool;
}
