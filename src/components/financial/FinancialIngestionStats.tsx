import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Upload, FileCheck2, AlertTriangle } from "lucide-react";

interface Props {
  companyId: string;
  /** Origem selecionada no filtro de ingestão ("all" quando sem filtro). */
  value?: IngestionOrigin;
  onChange?: (v: IngestionOrigin) => void;
}

export type IngestionOrigin = "all" | "whatsapp" | "manual" | "sistema";

interface Counts {
  whatsapp: number;
  manual: number;
  sistema: number;
  pendingReview: number;
}

const zero: Counts = { whatsapp: 0, manual: 0, sistema: 0, pendingReview: 0 };

/**
 * Indicador de ingestão do módulo financeiro: mostra quantos lançamentos vieram
 * do WhatsApp, de importação manual auditada e do próprio sistema, além dos
 * documentos de origem que ainda precisam de revisão.
 * Somente leitura — não altera nenhum lançamento.
 */
export default function FinancialIngestionStats({ companyId, value = "all", onChange }: Props) {
  const [c, setC] = useState<Counts>(zero);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const head = { count: "exact" as const, head: true };
        const [wa, manual, total, review] = await Promise.all([
          supabase.from("financial_transactions").select("id", head)
            .eq("company_id", companyId).not("file_hash", "is", null)
            .ilike("notes", "%Mensagem do contato:%"),
          supabase.from("financial_transactions").select("id", head)
            .eq("company_id", companyId).ilike("notes", "%Importacao manual auditada%"),
          supabase.from("financial_transactions").select("id", head)
            .eq("company_id", companyId),
          supabase.from("financial_source_documents").select("id", head)
            .eq("company_id", companyId)
            .in("processing_status", ["needs_review", "failed", "duplicate_candidate"]),
        ]);
        if (cancelled) return;
        const whatsapp = wa.count ?? 0;
        const manualCount = manual.count ?? 0;
        setC({
          whatsapp,
          manual: manualCount,
          sistema: Math.max((total.count ?? 0) - whatsapp - manualCount, 0),
          pendingReview: review.count ?? 0,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const items: { key: IngestionOrigin; label: string; value: number; Icon: typeof Upload }[] = [
    { key: "whatsapp", label: "Via WhatsApp", value: c.whatsapp, Icon: MessageSquare },
    { key: "manual", label: "Importação manual", value: c.manual, Icon: Upload },
    { key: "sistema", label: "Lançados no sistema", value: c.sistema, Icon: FileCheck2 },
  ];

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Origem dos lançamentos (ingestão)</CardTitle>
        {c.pendingReview > 0 && (
          <Badge variant="outline" className="gap-1 text-xs">
            <AlertTriangle className="h-3 w-3 text-warning" />
            {c.pendingReview} documento(s) p/ revisar
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {items.map(({ key, label, value: v, Icon }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange?.(active ? "all" : key)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                active ? "border-accent bg-accent/10" : "border-border hover:bg-accent/5"
              }`}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}: <strong className="tabular-nums">{loading ? "…" : v}</strong>
            </button>
          );
        })}
        {value !== "all" && (
          <button
            type="button"
            onClick={() => onChange?.("all")}
            className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/5"
          >
            Limpar filtro de origem
          </button>
        )}
      </CardContent>
    </Card>
  );
}
