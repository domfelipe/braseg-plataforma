import pg from "pg";
import { readFileSync } from "node:fs";
const lines = readFileSync(".env.vercel", "utf8").split("\n");
const get = (k) => {
  const l = lines.find((x) => x.startsWith(k + "="));
  return l ? l.slice(k.length + 1).trim().replace(/^"|"$/g, "") : "";
};
const client = new pg.Client({ connectionString: get("DATABASE_URL_UNPOOLED"), ssl: { rejectUnauthorized: false } });
await client.connect();
const res = await client.query(
  "SELECT id, status, length(signature_data_url) AS sig_len, left(signature_data_url, 30) AS sig_head, (SELECT count(*) FROM fleet_checklist_answers a WHERE a.checklist_id = c.id) AS answers FROM fleet_checklists c ORDER BY created_at DESC LIMIT 3"
);
console.log(JSON.stringify(res.rows, null, 1));
await client.end();
