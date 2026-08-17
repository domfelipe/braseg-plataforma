import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, FileWarning, Receipt, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Props { companyId: string }

interface AlertCounts {
  unpaidExpenses: number;
  taxesPending: number;
  unprocessedDocs: number;
  duplicates: number;
}

const zero: AlertCounts = { unpaidExpenses: 0, taxesPending: 0, unprocessedDocs: 0, duplicates: 0 };

export default function FinancialOpsAlerts({ companyId }: Props) {
  const [c, setC] = useState<AlertCounts>(zero);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Find "Impostos e Guias" category id (if any) for this company
        const { data: catRow } = await supabase
          .from("financial_categories")
          .select("id")
          .eq("company_id", companyId)
          .ilike("name", "Impostos%")
          .maybeSingle();

        const [unpaid, taxes, unproc, dup] = await Promise.all([
          supabase.from("financial_transactions").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).eq("type", "despesa").in("status", ["pendente", "vencido"]),
          catRow?.id
            ? supabase.from("financial_transactions").select("id", { count: "exact", head: true })
                .eq("company_id", companyId).eq("category_id", catRow.id).in("status", ["pendente", "vencido"])
            : Promise.resolve({ count: 0 } as any),
          supabase.from("financial_source_documents").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).in("processing_status", ["pending", "processing", "failed"]),
          supabase.from("financial_source_documents").select("id", { count: "exact", head: true })
            .eq("company_id", companyId).eq("processing_status", "duplicate_confirmed"),
        ]);
        if (cancelled) return;
        setC({
          unpaidExpenses: unpaid.count ?? 0,
          taxesPending: taxes.count ?? 0,
          unprocessedDocs: unproc.count ?? 0,
          duplicates: dup.count ?? 0,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [companyId]);

  const items = [
    { label: "Despesas em aberto", value: c.unpaidExpenses, Icon: AlertTriangle, tone: "text-warning", onClick: () => navigate("/financeiro") },
    { label: "Impostos pendentes", value: c.taxesPending, Icon: FileWarning, tone: "text-destructive", onClick: () => navigate("/financeiro") },
    { label: "Comprovantes p/ processar", value: c.unprocessedDocs, Icon: Receipt, tone: "text-accent", onClick: () => navigate("/financeiro/triagem") },
    { label: "Duplicidades detectadas", value: c.duplicates, Icon: Copy, tone: "text-muted-foreground", onClick: () => navigate("/financeiro/classificar") },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(({ label, value, Icon, tone, onClick }) => (
        <Card key={label} className="cursor-pointer hover:border-accent/60 transition-colors" onClick={onClick}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className={`h-4 w-4 ${tone}`} />
          </CardHeader>
          <CardContent>
            <p className="text-lg sm:text-xl font-bold tabular-nums">{loading ? "…" : value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
