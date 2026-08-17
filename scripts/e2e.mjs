import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const BASE = process.env.E2E_BASE || "http://localhost:3001";
const USER_ID = "user_3I1Pa4S2SMVyBDBxFPgu6mgXqU3";
const PLATE = "ABC1D23";

// Gera CNPJ válido (dígitos verificadores) a partir de um seed — p/ criar empresa de teste
function validCnpj(seed) {
  const base = String(seed).padStart(12, "0").slice(-12);
  const calc = (b) => {
    const w = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = [...b].reduce((a, d, i) => a + Number(d) * w[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base);
  const d2 = calc(base + d1);
  return base + d1 + d2;
}

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
  let sigOk = true;
  try {
    await page.waitForSelector("img[alt='Assinatura do condutor']", { timeout: 10000 });
  } catch {
    sigOk = false;
    const dump = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img")).map((i) => ({ alt: i.alt, src: (i.getAttribute("src") || "").slice(0, 40), w: i.clientWidth, h: i.clientHeight }));
      return JSON.stringify(imgs);
    });
    console.log("[debug imgs]", dump);
  }
  ok("assinatura exibida no detalhe", sigOk);
  await page.screenshot({ path: "/tmp/braseg-e2e-4-detalhe.png" });

  // 6) HISTÓRICO
  await page.goto(BASE + "/frotas", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /inspeções/i }).click();
  await page.waitForSelector("text=" + PLATE, { timeout: 15000 });
  ok("histórico lista a inspeção", true);

  // 7) SEGURANÇA DO TRABALHO — fluxo completo até gerar PGR
  await page.goto(BASE + "/seguranca", { waitUntil: "networkidle" });
  await page.waitForSelector("text=Segurança do Trabalho", { timeout: 15000 });
  ok("módulo Segurança do Trabalho abre (sem 'Em breve')", (await page.locator("text=Em breve").count()) === 0);

  // 7.1) Nova empresa cliente (CNPJ válido gerado por execução)
  const CNPJ = validCnpj(Date.now());
  await page.getByRole("link", { name: /nova empresa/i }).first().click();
  await page.waitForSelector('input[id="razao_social"]', { timeout: 10000 });
  await page.fill('input[id="razao_social"]', "E2E TESTE SEGURANCA LTDA");
  await page.fill('input[id="cnpj"]', CNPJ);
  await page.fill('input[id="responsavel"]', "Responsavel E2E");
  await page.fill('textarea[id="atividade_principal"]', "Beneficiamento de pedras ornamentais");
  await page.getByRole("button", { name: /cadastrar empresa/i }).click();
  await page.waitForURL(/seguranca\/empresas\/[0-9a-f-]+/, { timeout: 20000 });
  const clientId = page.url().split("/").pop();
  ok("empresa cliente criada (CNPJ válido)", true, clientId || "");

  // 7.2) Levantamento: setor + cargo + agente + funcionário
  await page.getByRole("tab", { name: /levantamento/i }).click();
  await page.waitForSelector("text=Setores", { timeout: 10000 });
  await page.fill('input[placeholder*="Produção"]', "Producao");
  await page.getByRole("button", { name: /^adicionar$/i }).first().click();
  await page.waitForSelector("text=Producao", { timeout: 10000 });
  ok("setor adicionado no levantamento", true);

  await page.fill('input[id="role-name"]', "Marmorista");
  await page.fill('textarea[id="role-desc"]', "Corte e acabamento de pedras ornamentais");
  await page.getByRole("button", { name: /^adicionar$/i }).nth(1).click();
  await page.waitForSelector("text=Marmorista", { timeout: 10000 });
  ok("cargo adicionado", true);

  await page.getByRole("button", { name: /agentes \(0\)/i }).click();
  await page.waitForSelector("text=Agentes de risco", { timeout: 10000 });
  await page.fill('input[placeholder*="Buscar agente"]', "Ruído");
  await page.locator('label:has-text("Ruído")').first().click();
  await page.getByRole("button", { name: /salvar 1 agente/i }).click();
  await page.waitForSelector("text=1 agente(s) de risco", { timeout: 10000 });
  ok("agente de risco marcado por cargo (Tabela 24)", true);

  await page.fill('input[id="emp-name"]', "Joao E2E");
  await page.getByRole("button", { name: /^adicionar$/i }).nth(2).click();
  await page.waitForSelector("text=Joao E2E", { timeout: 10000 });
  ok("funcionário adicionado", true);

  // 7.3) GES automático
  await page.getByRole("tab", { name: /^ges$/i }).click();
  await page.getByRole("button", { name: /gerar ges automaticamente/i }).click();
  await page.waitForSelector("text=GES 01", { timeout: 15000 });
  ok("GES gerado automaticamente", true);

  // 7.4) Matriz: risco com classificação calculada
  await page.getByRole("tab", { name: /matriz/i }).click();
  await page.getByRole("button", { name: /adicionar risco/i }).click();
  await page.waitForSelector("text=Classificação:", { timeout: 10000 });
  await page.fill('textarea[id="risk-effects"]', "Perda auditiva");
  await page.getByRole("button", { name: /salvar risco/i }).click();
  await page.waitForSelector("text=3 - MODERADO", { timeout: 10000 });
  ok("risco salvo com classificação calculada 5×5", true);

  // 7.5) Plano de ação
  await page.getByRole("tab", { name: /plano de ação/i }).click();
  await page.fill('input[id="plan-desc"]', "Enclausurar as serras de corte");
  await page.fill('input[id="plan-resp"]', "Engenharia");
  await page.getByRole("button", { name: /^adicionar$/i }).last().click();
  await page.waitForSelector("text=Enclausurar as serras de corte", { timeout: 10000 });
  ok("item de plano de ação criado", true);

  // 7.6) Gerar PGR (final, com assinatura)
  await page.getByRole("tab", { name: /documentos/i }).click();
  await page.getByRole("button", { name: /gerar documento/i }).click();
  await page.waitForSelector("text=Gerar documento", { timeout: 10000 });
  await page.fill('input[id="doc-consultant"]', "Consultor E2E");
  const canvas = page.locator('canvas[role="img"]').last();
  const sigBox = await canvas.boundingBox();
  if (sigBox) {
    await page.mouse.move(sigBox.x + 40, sigBox.y + sigBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sigBox.x + 220, sigBox.y + sigBox.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await page.getByRole("button", { name: /gerar pgr\/pgrtr/i }).click();
  await page.waitForSelector('a[download$=".pdf"]', { timeout: 45000 });
  ok("documento PGR gerado (PDF + DOCX)", (await page.locator('a[download$=".pdf"]').count()) > 0);
  await page.screenshot({ path: "/tmp/braseg-e2e-5-seguranca.png" });

  // 7.7) DHChat continua externo
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