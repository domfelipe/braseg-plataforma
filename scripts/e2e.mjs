import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3001";
const USER_ID = "user_3I1Pa4S2SMVyBDBxFPgu6mgXqU3";
const PLATE = "ABC1D23";

// CLERK_SECRET_KEY vem de .env.vercel (vercel env pull) ou do ambiente
const envFile = readFileSync(".env.vercel", "utf8");
const secret = ((envFile.match(/^CLERK_SECRET_KEY=(.+)$/m) || [])[1] || process.env.CLERK_SECRET_KEY || "").trim().replace(/^["']|["']$/g, "");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? "✔" : "✘") + " " + name + (extra ? " — " + extra : ""));
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));

try {
  // 0) SIGN-IN TICKET (dev instance exige código por e-mail; ticket bypassa p/ teste)
  const ticketRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, expires_in_seconds: 120 }),
  });
  const ticketData = await ticketRes.json();
  ok("sign-in ticket criado", !!ticketData.token);

  // 1) LOGIN — form renderiza
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  ok("login renderiza (form Clerk)", await page.isVisible('input[name="identifier"]'));

  // 2) AUTENTICAÇÃO via ticket
  await page.goto(BASE + "/login?__clerk_ticket=" + ticketData.token, { waitUntil: "networkidle" });
  await page.waitForURL(/dashboard|perfil/, { timeout: 30000 });
  ok("autenticado (ticket Clerk)", true, page.url());
  await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  await page.screenshot({ path: "/tmp/braseg-e2e-1-dashboard.png" });

  // 3) DASHBOARD
  await page.waitForSelector("text=Olá", { timeout: 15000 });
  ok("dashboard saudação", true);
  ok("module cards", (await page.locator("text=DHChat").count()) > 0 && (await page.locator("text=Frotas").count()) > 0 && (await page.locator("text=Segurança").count()) > 0);
  await page.waitForSelector(".tabular-nums", { timeout: 25000 });
  const kpiCount = await page.locator(".tabular-nums").count();
  ok("KPIs renderizados", kpiCount >= 4, kpiCount + " números");

  // 4) CRIAR VEÍCULO
  await page.goto(BASE + "/frotas", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /veículos/i }).click();
  await page.getByRole("button", { name: /novo veículo/i }).click();
  await page.waitForSelector('input[placeholder="ABC-1D23"]', { timeout: 10000 });
  ok("dialog novo veículo aberto", true);
  await page.fill('input[placeholder="ABC-1D23"]', PLATE);
  await page.fill('input[placeholder="Toyota"]', "Volkswagen");
  await page.fill('input[placeholder="Corolla"]', "Saveiro");
  await page.getByRole("button", { name: /salvar/i }).click();
  await page.waitForSelector("text=" + PLATE, { timeout: 15000 });
  ok("veículo criado (card com placa)", true, PLATE);
  await page.screenshot({ path: "/tmp/braseg-e2e-2-veiculo.png" });

  // 5) INSPEÇÃO — wizard 5 etapas
  await page.getByRole("tab", { name: /inspeções/i }).click();
  await page.getByRole("button", { name: /nova inspeção/i }).first().click();
  await page.waitForURL(/inspecoes\/nova/, { timeout: 15000 });

  await page.getByRole("combobox").click();
  await page.locator('[role="option"]').filter({ hasText: PLATE }).first().click();
  await page.fill("#driver", "João Testador");
  await page.fill("#odo", "45210");
  await page.getByRole("button", { name: /avançar/i }).click();

  await page.waitForSelector("button:has-text('Sim')", { timeout: 10000 });
  const simButtons = page.locator("button:has-text('Sim')");
  const nSim = await simButtons.count();
  ok("itens do checklist renderizados", nSim === 10, nSim + " itens");
  for (let i = 0; i < nSim; i++) await simButtons.nth(i).click();
  await page.getByRole("button", { name: /avançar/i }).click();

  await page.getByRole("button", { name: /avançar/i }).click();

  await page.waitForSelector("canvas", { timeout: 10000 });
  const box = await page.locator("canvas").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 80, cy + 10);
  await page.mouse.down();
  await page.mouse.move(cx - 20, cy - 30, { steps: 8 });
  await page.mouse.move(cx + 30, cy + 20, { steps: 8 });
  await page.mouse.move(cx + 90, cy - 10, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: /avançar/i }).click();

  await page.waitForSelector("text=Revisão", { timeout: 10000 });
  ok("revisão mostra CONFORME", (await page.locator("text=CONFORME").count()) > 0);
  await page.screenshot({ path: "/tmp/braseg-e2e-3-revisao.png" });
  await page.getByRole("button", { name: /concluir inspeção/i }).click();
  await page.waitForURL(/inspecoes\/[0-9a-f-]+/, { timeout: 30000 });
  ok("inspeção salva → detalhe", true, page.url());
  await page.waitForSelector("text=Conforme", { timeout: 15000 });
  ok("detalhe mostra status Conforme", true);
  await page.waitForSelector("img[alt='Assinatura do condutor']", { timeout: 10000 });
  ok("assinatura exibida no detalhe", true);
  await page.screenshot({ path: "/tmp/braseg-e2e-4-detalhe.png" });

  // 6) HISTÓRICO
  await page.goto(BASE + "/frotas", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /inspeções/i }).click();
  await page.waitForSelector("text=" + PLATE, { timeout: 15000 });
  ok("histórico lista a inspeção", true);

  // 7) SEGURANÇA + DHChat
  await page.goto(BASE + "/seguranca", { waitUntil: "networkidle" });
  ok("segurança placeholder", (await page.locator("text=Em breve").count()) > 0 && (await page.locator("text=Coleta de dados de segurança em campo").count()) > 0);
  await page.waitForSelector('a[href*="dhchat.domhubs.com.br"]', { timeout: 10000 });
  const dh = page.locator('a[href*="dhchat.domhubs.com.br"]');
  ok("DHChat link externo na sidebar", (await dh.count()) > 0, (await dh.first().getAttribute("href")) || "");
} catch (e) {
  console.log("[FALHA]", e.message);
  await page.screenshot({ path: "/tmp/braseg-e2e-error.png" }).catch(() => {});
  results.push({ name: "exceção", pass: false, extra: e.message });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log("\nRESULTADO: " + (results.length - failed.length) + "/" + results.length + " checks passaram");
process.exit(failed.length > 0 ? 1 : 0);