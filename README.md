# Braseg Portal

Portal unificado da **Braseg Consultoria e Treinamentos**: DHChat, Frotas e Segurança em um só login.

- **DHChat** — link externo para `https://dhchat.domhubs.com.br` (abre em nova aba; URL configurável via `VITE_DHCHAT_URL`).
- **Frotas** — veículos, manutenções, vencimentos e custos (paridade com o sistema anterior) + checklist de inspeção (Fase 2).
- **Segurança** — placeholder do app de coleta de dados de segurança do trabalho em campo (Fase 3 de produto).

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · shadcn/ui · Supabase (Cloud) · React Router 6 · TanStack Query · framer-motion · recharts · vite-plugin-pwa. Deploy: Vercel.

## Desenvolvimento

```bash
npm install
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:8080
npm run build
npm run lint
npm test
```

## Estrutura de módulos

Os módulos da sidebar são declarados em `src/lib/moduleRegistry.ts` (chave, rótulo, ícone, rota ou `externalUrl`, `comingSoon`). A visibilidade por usuário vem de `user_company_access.modules` (master vê tudo). Não há CNPJs hardcoded.

## Design

Tokens e regras visuais em `DESIGN.md` (OKLCH canônico; HSL aplicado em `src/index.css`). Paleta navy/âmbar, Space Grotesk + Inter.

## Base

Importado de `github.com/domfelipe/grupoforteserv` (histórico reiniciado). Spec técnica e plano: `docs/` do workspace DevSquad DOM.
