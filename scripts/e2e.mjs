import { chromium } from "playwright-core";

const BASE = "http://localhost:3001";
const EMAIL = "felipe+braseg@domhubs.com.br";
const PASSWORD = "Braseg2026!Inicio";
const PLATE = "ABC1D23";

const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? "✔" : "✘") + " " + name + (extra ? " — " + extra : ""));
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

try {
  // 1) LOGIN
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  ok("login renderiza", await page.isVisible('input[name="identifier"]'));
  await page.fill('input[name="identifier"]', EMAIL);
  await page.getByRole("button", { name: /continue|continuar/i }).click();
  await page.waitForSelector('input[name="password"]', { timeout: 20000 });
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /continue|continuar/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  ok("login Clerk → dashboard", page.url().includes("/dashboard"), page.url());
  await page.screenshot({ path: "/tmp/braseg-e2e-1-dashboard.png" });

  // 2) DASHBOARD
  await page.waitForSelector("text=Olá", { timeout: 15000 });
  ok("dashboard saudação", true);
  ok("module cards", (await page.locator("text=DHChat").count()) > 0 && (await page.locator("text=Frotas").count()) > 0 && (await page.locator("text=Segurança").count()) > 0);
  const kpiCount = await page.locator(".tabular-nums").count();
  ok("KPIs renderizados", kpiCount >= 4, kpiCount + " números");

  // 3) CRIAR VEÍCULO
  await page.goto(BASE + "/frotas", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /veículos/i }).click();
  await page.getByRole("button", { name: /novo veículo/i }).click();
  await page.waitForSelector('input[placeholder*="placa" i], #plate', { timeout: 10000 });
  // formulário: procurar inputs por label próximo — usar ids comuns
  const inputs = page.locator("dialog input, [role=dialog] input");
  const nInputs = await inputs.count();
  ok("dialog novo veículo aberto", nInputs >= 3, nInputs + " inputs");
  // preencher por ordem: placa, marca, modelo (form padrão)
  const all = await inputs.all();
  await all[0].fill(PLATE);
  await all[1].fill("Volkswagen");
  await all[2].fill("Saveiro");
  await page.getByRole("button", { name: /salvar/i }).click();
  await page.waitForSelector("text=" + PLATE, { timeout: 15000 });
  ok("veículo criado (card com placa)", true, PLATE);
  await page.screenshot({ path: "/tmp/braseg-e2e-2-veiculo.png" });

  // 4) INSPEÇÃO — wizard 5 etapas
  await page.getByRole("tab", { name: /inspeções/i }).click();
  await page.getByRole("button", { name: /nova inspeção/i }).click();
  await page.waitForURL(/inspecoes\/nova/, { timeout: 15000 });

  // etapa 0: veículo + condutor + km
  await page.getByRole("combobox").click();
  await page.locator('[role="option"]').filter({ hasText: PLATE }).first().click();
  await page.fill("#driver", "João Testador");
  await page.fill("#odo", "45210");
  await page.getByRole("button", { name: /avançar/i }).click();

  // etapa 1: itens — todos Sim
  await page.waitForSelector("button:has-text('Sim')", { timeout: 10000 });
  const simButtons = page.locator("button:has-text('Sim')");
  const nSim = await simButtons.count();
  ok("itens do checklist renderizados", nSim === 10, nSim + " itens");
  for (let i = 0; i < nSim; i++) {
    await simButtons.nth(i).click();
  }
  await page.getByRole("button", { name: /avançar/i }).click();

  // etapa 2: fotos (opcional) → avançar
  await page.getByRole("button", { name: /avançar/i }).click();

  // etapa 3: assinatura no canvas
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

  // etapa 4: revisão → concluir
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

  // 5) histórico + selo
  await page.goto(BASE + "/frotas", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /inspeções/i }).click();
  await page.waitForSelector("text=" + PLATE, { timeout: 15000 });
  ok("histórico lista a inspeção", true);

  // 6) SEGURANÇA
  await page.goto(BASE + "/seguranca", { waitUntil: "networkidle" });
  ok("segurança placeholder", (await page.locator("text=Em breve").count()) > 0 && (await page.locator("text=Coleta de dados de segurança em campo").count()) > 0);

  // 7) DHChat link externo
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
