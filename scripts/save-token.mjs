import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
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
await page.goto("https://braseg-plataforma.vercel.app/login?__clerk_ticket=" + token, { waitUntil: "networkidle" });
await page.waitForTimeout(8000);
const t = await page.evaluate(() => window.Clerk?.session?.getToken());
writeFileSync("/tmp/prod-token.txt", t || "");
console.log("token:", t ? t.slice(0, 20) + "..." : "NULO");
await browser.close();
