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

const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  await client.query(schema);
  console.log("✔ schema aplicado com sucesso");
} finally {
  await client.end();
}
