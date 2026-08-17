import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, MapPin, Tag, CalendarClock } from "lucide-react";
import { getCompanyLocations } from "@/lib/companyLocations";

export type FinancialDateBase = "due" | "payment" | "created";

export interface FinancialFiltersState {
  dateFrom: string;
  dateTo: string;
  city: string;
  categoryId: string;
  /** Which date field the range filter refers to: due_date (vencimento), payment_date (pagamento) ou created_at (importação). Default: "payment". */
  dateBase?: FinancialDateBase;
}

interface Props {
  companyId: string;
  filters: FinancialFiltersState;
  onChange: (filters: FinancialFiltersState) => void;
  categories: { id: string; name: string; type: string }[];
  availableCities: string[];
}

export default function FinancialFilters({ companyId, filters, onChange, categories, availableCities }: Props) {
  const predefinedLocations = useMemo(() => getCompanyLocations(companyId), [companyId]);

  const allCities = useMemo(() => {
    const s = new Set<string>(predefinedLocations);
    availableCities.forEach((c) => s.add(c));
    return Array.from(s).sort();
  }, [predefinedLocations, availableCities]);

  const update = (partial: Partial<FinancialFiltersState>) => {
    onChange({ ...filters, ...partial });
  };

  const dateBase: FinancialDateBase = filters.dateBase ?? "payment";

  return (
    <div className="flex flex-wrap gap-3 items-end print:hidden">
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1"><CalendarClock className="h-3 w-3" />Data base</Label>
        <Select value={dateBase} onValueChange={(v) => update({ dateBase: v as FinancialDateBase })}>
          <SelectTrigger className="w-[170px] h-9" title="Escolha se os filtros de período consideram vencimento, pagamento ou data de importação (created_at)">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="due">Vencimento</SelectItem>
            <SelectItem value="payment">Pagamento</SelectItem>
            <SelectItem value="created">Importação</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3 w-3" />De</Label>
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => update({ dateFrom: e.target.value })}
          className="w-[150px] h-9"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3 w-3" />Até</Label>
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => update({ dateTo: e.target.value })}
          className="w-[150px] h-9"
        />
      </div>
      {allCities.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" />Local</Label>
          <Select value={filters.city} onValueChange={(v) => update({ city: v })}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os locais</SelectItem>
              {allCities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {categories.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><Tag className="h-3 w-3" />Categoria</Label>
          <Select value={filters.categoryId} onValueChange={(v) => update({ categoryId: v })}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

/**
 * Returns the reference date (YYYY-MM-DD) for a transaction under the given
 * date base. In "payment" mode, transactions without payment_date return null,
 * meaning they should be excluded from date-range filters.
 */
export function getRefDate(
  tx: { due_date: string; payment_date?: string | null; created_at?: string | null },
  dateBase?: FinancialDateBase
): string | null {
  const base = dateBase ?? "payment";
  if (base === "payment") return tx.payment_date || null;
  if (base === "created") return tx.created_at ? tx.created_at.slice(0, 10) : null;
  return tx.due_date;
}
