/**
 * Leitura paginada determinística dos módulos financeiros.
 *
 * PostgREST aplica um cap de linhas por resposta (padrão 1000). Usar `.limit(20000)`
 * NÃO contorna esse cap: a resposta continua truncada silenciosamente e os totais
 * ficam parciais. Toda leitura de conjunto completo deve passar por `fetchAllPaged`.
 *
 * Este helper é puro em relação a regras de negócio: não filtra status, não decide
 * base de data e não soma nada. Ele apenas garante que o conjunto de entrada esteja
 * completo. Erros são propagados — nunca convertidos em lista vazia.
 */

export const FINANCIAL_PAGE_SIZE = 1000;

/** Colunas comuns usadas por Visão Geral, Relatórios e listas. */
export const FINANCIAL_TX_COLUMNS =
  "id,description,amount,type,status,due_date,payment_date,created_at,category_id,city,source_payment_id";

type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

/**
 * Executa a query em páginas de `pageSize` até esgotar as linhas.
 *
 * @param build fábrica que devolve uma NOVA query a cada página (não reutilizar
 *              builders, pois eles são consumidos ao serem awaited).
 */
export async function fetchAllPaged<T>(
  build: () => PagedQuery<T>,
  pageSize: number = FINANCIAL_PAGE_SIZE,
  maxPages: number = 200
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<unknown>();

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const { data, error } = await build().range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];

    for (const row of batch) {
      const id = (row as { id?: unknown })?.id;
      if (id !== undefined) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      rows.push(row);
    }

    if (batch.length < pageSize) return rows;
  }

  // Guarda contra loop infinito: nunca devolve silenciosamente um conjunto parcial.
  throw new Error(
    `Leitura financeira excedeu ${maxPages} páginas de ${pageSize} linhas; conjunto possivelmente incompleto.`
  );
}
