import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const envFile = readFileSync(".env.vercel", "utf8");
const secret = ((envFile.match(/^CLERK_SECRET_KEY=(.+)$/m) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
  body: JSON.stringify({ user_id: "user_3I1Pa4S2SMVyBDBxFPgu6mgXqU3", expires_in_seconds: 120 }),
});
const { token } = await res.json();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ locale: "pt-BR" });
await page.goto("http://localhost:3001/login?__clerk_ticket=" + token, { waitUntil: "networkidle" });
await page.waitForTimeout(9000);
const out = await page.evaluate(async () => {
  const t = await window.Clerk.session.getToken();
  const me = await fetch("/api/me", { headers: { Authorization: "Bearer " + t } }).then((r) => r.json());
  const cid = me.companies?.[0]?.id;
  const r = await fetch("/api/fleet/checklists/a3d0dc28-736c-41d6-8d9b-e13947aba1f4?companyId=" + cid, { headers: { Authorization: "Bearer " + t } });
  return { cid, status: r.status, body: (await r.text()).slice(0, 250) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
