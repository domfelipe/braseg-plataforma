# Correção de divergências de valores: Financeiro, Extrato, DRE e Pagamentos (somente leitura/cálculo)

Nenhuma alteração de dados, migration, trigger, Edge Function, RLS ou schema. O ciclo altera apenas leitura, cálculo e exibição no frontend, mais testes.

## Evidências confirmadas no código (lidas antes deste plano)

- `FinancialReports.tsx:141` — DRE filtra `t.status !== "cancelada"`; o banco usa `cancelado`. Hoje nenhum cancelado é excluído do DRE.
- `FinancialReports.tsx:178` — fluxo de caixa soma `t.status === "paga"`; o banco usa `pago`. Hoje o realizado do caixa é sempre 0.
- `FinancialReports.tsx:469-470` — filtro de status do Extrato oferece `paga` e `cancelada`, valores inexistentes; selecioná-los devolve lista vazia.
- `FinancialReports.tsx:140,184,205` — DRE, caixa e Extrato usam `due_date` fixo, ignorando `filters.dateBase` (que já existe e é respeitado em `FinancialOverview.tsx` e `TransactionsList.tsx`).
- `PaymentsReports.tsx:65-66` — filtra `professional_payments` por `created_at`, não por `payment_date`.
- `Pagamentos.tsx:346` e `TransactionsList.tsx:196` — `parseFloat(texto.replace(",", "."))`, que quebra `1.234,56` (vira 1.234) e aceita 0/negativo.

## A) Patch mínimo de leitura/cálculo

Arquivos: `src/components/financial/FinancialReports.tsx`.

- Corrigir os status para os canônicos do banco (`pago`, `pendente`, `cancelado`).
- Centralizar os literais em constantes locais (`STATUS_PAGO`, `STATUS_PENDENTE`, `STATUS_CANCELADO`) para não reintroduzir divergência de grafia.
- Antes: DRE inclui cancelados; caixa realizado = 0; filtro de status do Extrato inútil.
- Depois: DRE exclui cancelados; caixa realizado reflete os pagos; filtro do Extrato com `pago/pendente/cancelado` + "todos".

Ingestão (`receive-receipt`, `import-chatwoot-receipts`, triggers) permanece intocada.

## B) Base de data canônica e explícita

Arquivos: `src/components/financial/FinancialReports.tsx` (e, se necessário para o rótulo, `src/components/financial/FinancialFilters.tsx` — apenas texto).

- Reutilizar a mesma função de data de referência já usada no arquivo (linhas 103-108) para DRE, fluxo de caixa e Extrato, em vez de `due_date` fixo.
- Exibir no cabeçalho de cada bloco qual base está em uso: "Base: vencimento / pagamento / lançamento".
- Regra de fallback explícita: em base `payment`, linhas sem `payment_date` ficam fora do período (não caem em `due_date` silenciosamente) e são contadas num rodapé "N lançamentos sem data de pagamento".
- Antes: números do DRE/Extrato não mudavam ao trocar a base, divergindo da Visão Geral. Depois: as três telas concordam.

## C) Relatório médico separado (sem multiplicação 1:N)

Arquivo: `src/components/pagamentos/PaymentsReports.tsx`.

- Trocar o filtro de `created_at` para `payment_date` na seção "Pagos"; três seções explícitas:
  1. **Pagos no período** — `status = pago` por `payment_date` (agosto: 53 registros, R$ 283.672,90).
  2. **Pendentes** — `aguardando_pagamento` (3, R$ 9.350,00), sem data de pagamento, exibidos separadamente e fora do total pago.
  3. **Outros** — `processando_nf` e `duplicado`, listados sem somar no total.
- Espelho financeiro: consultar `financial_transactions` por `source_payment_id` apenas em modo de conferência e agregado (contagem + soma), nunca em join que duplique linhas. Cada `professional_payments` aparece uma única vez.
- Antes: o mês do relatório era o mês de criação e pendentes entravam no total. Depois: mês de pagamento, pendentes isolados, total conciliável com o banco.

## D) Parser único de moeda brasileira

Arquivo novo: `src/lib/money.ts` (`parseBRLAmount`, `formatBRL`).

- Aceita `1.234,56`, `1234,56`, `1234.56`, `R$ 1.234,56`, com espaços e `R$`.
- Rejeita vazio, NaN, zero e negativo, devolvendo `{ ok: false, reason }` para o chamador exibir `toast.error` (sem exceção crua).
- Consumidores: `src/pages/Pagamentos.tsx` (linha 346) e `src/components/financial/TransactionsList.tsx` (linha 196) — apenas a leitura do input; o fluxo de gravação e os campos enviados não mudam.
- Antes: `1.234,56` gravava 1,23. Depois: 1234.56, ou bloqueio com mensagem clara.

## E) Indicador somente leitura de divergências

Arquivo novo: `src/components/financial/ReconciliationPanel.tsx`, exibido como um card dentro da aba **Relatórios** do Financeiro (sem nova rota, sem alteração de `App.tsx`).

Três blocos, todos `SELECT`:
1. **PP vs FT** — pagamentos sem espelho, espelhos sem pagamento e divergência de valor (hoje: 841/841, 1:1 — o painel prova isso continuamente).
2. **Pagos sem `source_payment_id`** na categoria "Pagamentos de Profissionais" (agosto: 26 lançamentos, R$ 63.349,13), com descrição e valor, para triagem humana. Diagnóstico apenas: nenhuma reclassificação automática.
3. **Reconciliação do card** — decomposição de R$ 343.372,03 em médicos pagos + pendentes + não-médicos, para explicar a diferença contra R$ 283.672,90.

Sem botão de escrita nesta fase. Os 23 anexos da Alice (R$ 320.034,97; 18 sem correspondência, R$ 317.346,96) ficam listados como pendência informativa, sem importação.

## F) Testes e build

- `src/test/money.test.ts` — parser: formatos válidos, zero, negativo, lixo, `R$` e separador de milhar.
- `src/test/financial-status.test.ts` — helpers puros extraídos do DRE/caixa/extrato: cancelado excluído, pago somado, base de data respeitada, linha sem `payment_date` fora do período.
- Rodar `bunx vitest run` (suíte atual 63/63 deve continuar verde) e o typecheck do projeto.

## G) Rollback e confirmação

- Commit 1: correções de status/base de data no DRE/caixa/extrato.
- Commit 2: parser de moeda + testes.
- Commit 3: relatório médico por `payment_date`.
- Commit 4: painel de reconciliação.
- Rollback = reverter o commit correspondente pelo histórico do projeto; como nada toca dados, não há backfill a desfazer.
- Qualquer alteração de dados (reclassificar os 26 lançamentos, importar os 23 anexos, criar índice único em `financial_source_documents.source_key`) só depois de aprovação explícita, em ciclo separado.

## Permanece intocado

As 2.889 `financial_transactions`, categorias, `source_payment_id`, status de registros, triggers, Edge Functions, RLS, schemas, anexos, ingestão do WhatsApp/Chatwoot, rotas e autenticação.

## Riscos

- Corrigir `paga` → `pago` fará o caixa realizado sair de 0 e o DRE excluir cancelados: os números **vão mudar** na tela; é a correção pretendida, e o antes/depois será reportado.
- Trocar `created_at` por `payment_date` altera a composição mensal do relatório de pagamentos (pagamentos criados em julho e pagos em agosto migram de mês).
- Se existirem status fora dos canônicos observados, cairão em "outros"; o painel de reconciliação os expõe em vez de escondê-los.
