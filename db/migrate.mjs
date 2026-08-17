// Aplica db/schema.sql no Neon (usa DATABASE_URL_UNPOOLED — direct, sem -pooler)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL_UNPOOLED (vercel env pull) antes de rodar.");
  process.exit(1);
}

const base = dirname(fileURLToPath(import.meta.url));
const files = [join(base, "schema.sql"), join(base, "seguranca", "catalogs.sql")];
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  for (const file of files) {
    const sql = readFileSync(file, "utf8");
    await client.query(sql);
    console.log("✔ aplicado:", file);
  }
} finally {
  await client.end();
}
