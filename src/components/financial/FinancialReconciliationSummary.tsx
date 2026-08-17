import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Info, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  summarizeProfessionalCategory,
  isProfessionalPaymentsCategory,
  PROFESSIONAL_CATEGORY_NAME,
  DRE_LABEL_MIRRORED,
  DRE_LABEL_UNLINKED,
  type ReconciliationRow,
} from "@/lib/professionalReconciliation";
import { dateBaseLabel, type FinancialDateBaseValue } from "@/lib/financialStatus";

interface Props {
  /** Linhas já escopadas pela empresa e pelos filtros da tela. */
  rows: ReconciliationRow[];
  /** Mapa category_id -> nome. */
  categoryNames: Record<string, string>;
  base?: FinancialDateBaseValue;
  from?: string | null;
  to?: string | null;
  periodLabel?: string;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Painel somente leitura. Não escreve, não reclassifica e não altera nenhum
 * campo — apenas separa a apresentação da categoria de profissionais.
 */
export default function FinancialReconciliationSummary({
  rows,
  categoryNames,
  base,
  from,
  to,
  periodLabel,
}: Props) {
  const categoryRows = rows.filter((r) =>
    isProfessionalPaymentsCategory(r.category_id ? categoryNames[r.category_id] : null)
  );

  const summary = summarizeProfessionalCategory(categoryRows, { base, from, to });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            Conciliação — {PROFESSIONAL_CATEGORY_NAME}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {periodLabel ? `${periodLabel} · ` : ""}base: {dateBaseLabel(base)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Somente leitura. O total da categoria na DRE não é igual ao total do módulo de
          profissionais: a categoria também recebe pagamentos operacionais a pessoas, ainda sem
          vínculo com <code>source_payment_id</code>.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parcela</TableHead>
              <TableHead className="text-right">Lançamentos</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{DRE_LABEL_MIRRORED}</TableCell>
              <TableCell className="text-right">{summary.mirrored.count}</TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(summary.mirrored.amount)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{DRE_LABEL_UNLINKED}</TableCell>
              <TableCell className="text-right">{summary.unlinked.count}</TableCell>
              <TableCell className="text-right font-medium text-amber-600">
                {formatCurrency(summary.unlinked.amount)}
              </TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell>Total da categoria</TableCell>
              <TableCell className="text-right">{summary.total.count}</TableCell>
              <TableCell className="text-right">{formatCurrency(summary.total.amount)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {summary.conservationDiff === 0 ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Conservação da soma: diferença {formatCurrency(0)}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Divergência de conservação:{" "}
              {formatCurrency(summary.conservationDiff)}
            </span>
          )}
          {summary.excludedCanceled > 0 && (
            <span>{summary.excludedCanceled} cancelado(s) fora dos totais</span>
          )}
          {summary.excludedNoRefDate > 0 && (
            <span>{summary.excludedNoRefDate} sem data na base ativa (fora do período)</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
