# Provisionamento do tenant Braseg (Fase 4 — Vercel + Neon)

> Infra já criada (2026-08-16):
> - Projeto Vercel: `braseg-portal` (team feliperdomingues-3690s-projects, id `prj_9A44Xux96AwHsiahc7tgwJ4SWsrO`)
> - Neon: resource `neon-gray-pebble` conectado (envs DATABASE_URL* injetadas)
> - Clerk: aplicação "Braseg Portal" (`app_3I1NEnshvhmfnV4IO93o4lnDLNG`) — chaves em `.env.local` e no Vercel

## 1. Schema (migrations)

```bash
# local: puxar envs do Vercel
vercel env pull .env.vercel --project braseg-portal
# aplicar schema no Neon (direct connection)
psql "$DATABASE_URL_UNPOOLED" -f supabase/migrations/*.sql   # ou via drizzle-kit
```

Nota: as migrations usam `auth.users` (Supabase). Na arquitetura Neon, o schema
é aplicado via Drizzle (`drizzle/schema.ts`) — ver doc de arquitetura Neon.

## 2. Tenant Braseg (seed)

- Razão social: BRASEG CONSULTORIA EMPRESARIAL E TREINAMENTO LTDA - ME
- CNPJ: 31.638.469/0001-84

```sql
INSERT INTO companies (name, trade_name, cnpj)
VALUES ('BRASEG CONSULTORIA EMPRESARIAL E TREINAMENTO LTDA - ME', 'Braseg', '31.638.469/0001-84');
-- user_id agora é o Clerk user id (text)
INSERT INTO user_company_access (user_id, company_id, modules)
VALUES ('<clerk-user-id>', '<company-id>', ARRAY['dashboard','dhchat','fleet','seguranca']);
```

## 3. Smoke E2E

Login (Clerk) → dashboard (4 KPIs) → Frotas (6 abas) → nova inspeção (5 etapas)
→ detalhe → DHChat em nova aba → Segurança placeholder.
