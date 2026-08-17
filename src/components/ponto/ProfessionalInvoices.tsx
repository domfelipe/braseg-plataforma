import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { InvoiceViewModal } from "./InvoiceViewModal";
import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"clock_invoices">;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  emitida: { label: "Emitida", variant: "default" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

export function ProfessionalInvoices() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["prof-invoices", selectedCompany?.id, user?.id],
    queryFn: async () => {
      if (!selectedCompany?.id || !user?.id) return [];
      const { data } = await supabase
        .from("clock_invoices")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedCompany?.id && !!user?.id,
  });

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Minhas Notas Fiscais
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !invoices?.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma nota fiscal encontrada.</p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const cfg = statusConfig[inv.status] || statusConfig.rascunho;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="text-sm">
                        {format(new Date(inv.period_from + "T12:00:00"), "dd/MM/yy", { locale: ptBR })} –{" "}
                        {format(new Date(inv.period_to + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right font-mono">{Number(inv.total_hours).toFixed(1)}h</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(inv.total_amount))}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(inv.net_amount))}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewInvoice(inv)}
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <InvoiceViewModal
          invoice={viewInvoice}
          open={!!viewInvoice}
          onOpenChange={(open) => !open && setViewInvoice(null)}
        />
      </CardContent>
    </Card>
  );
}
