import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, FileText, Clock, Receipt } from "lucide-react";
import { format, startOfMonth, endOfMonth, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { InvoiceGeneratorModal } from "./InvoiceGeneratorModal";

export function ClockReport() {
  const { selectedCompany, isAcudir } = useCompany();
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [invoiceModal, setInvoiceModal] = useState<{
    open: boolean;
    userId: string;
    name: string;
    totalMinutes: number;
  }>({ open: false, userId: "", name: "", totalMinutes: 0 });

  const { data: profiles } = useQuery({
    queryKey: ["user-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_profiles").select("id, full_name");
      return data || [];
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["clock-report", selectedCompany?.id, dateFrom, dateTo, filterStatus],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      let query = supabase
        .from("clock_entries")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .gte("timestamp", `${dateFrom}T00:00:00`)
        .lte("timestamp", `${dateTo}T23:59:59`)
        .order("timestamp", { ascending: false });

      if (filterStatus === "valid") query = query.eq("valid", true);
      if (filterStatus === "invalid") query = query.eq("valid", false);

      const { data } = await query;
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const getProfileName = (userId: string) =>
    profiles?.find((p) => p.id === userId)?.full_name || userId.slice(0, 8);

  // Calculate hours worked per professional from valid entries
  const hoursSummary = (() => {
    if (!entries?.length) return [];
    const byUser: Record<string, typeof entries> = {};
    for (const e of entries.filter((e) => e.valid)) {
      if (!byUser[e.user_id]) byUser[e.user_id] = [];
      byUser[e.user_id].push(e);
    }

    return Object.entries(byUser).map(([userId, userEntries]) => {
      const sorted = [...userEntries].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      let totalMinutes = 0;
      let i = 0;
      while (i < sorted.length - 1) {
        if (sorted[i].type === "entrada" && sorted[i + 1].type === "saida") {
          totalMinutes += differenceInMinutes(
            new Date(sorted[i + 1].timestamp),
            new Date(sorted[i].timestamp)
          );
          i += 2;
        } else {
          i++;
        }
      }
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const decimal = (totalMinutes / 60).toFixed(3).replace(".", ",");
      return { userId, name: getProfileName(userId), totalMinutes, formatted: `${hours}h ${mins}min (${decimal})` };
    }).sort((a, b) => b.totalMinutes - a.totalMinutes);
  })();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Relatório de Ponto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="valid">Válidos</SelectItem>
                  <SelectItem value="invalid">Inválidos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !entries?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
          ) : (
            <>
              {hoursSummary.length > 0 && (
                <Card className="bg-muted/50">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Resumo de Horas Trabalhadas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Profissional</TableHead>
                          <TableHead className="text-right">Horas Trabalhadas</TableHead>
                          {isAcudir && <TableHead className="text-right">Ações</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hoursSummary.map((s) => (
                          <TableRow key={s.userId}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="text-right font-mono">{s.formatted}</TableCell>
                            {isAcudir && (
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setInvoiceModal({
                                      open: true,
                                      userId: s.userId,
                                      name: s.name,
                                      totalMinutes: s.totalMinutes,
                                    })
                                  }
                                >
                                  <Receipt className="h-3.5 w-3.5 mr-1" />
                                  Gerar NF
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Distância</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(entry.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>{getProfileName(entry.user_id)}</TableCell>
                        <TableCell>
                          <Badge variant={entry.type === "entrada" ? "default" : "secondary"}>
                            {entry.type === "entrada" ? "Entrada" : "Saída"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {entry.valid ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                              <CheckCircle className="h-3.5 w-3.5" /> Válido
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-destructive text-sm">
                              <XCircle className="h-3.5 w-3.5" /> Inválido
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {entry.distance_meters != null ? `${entry.distance_meters}m` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedCompany && (
        <InvoiceGeneratorModal
          open={invoiceModal.open}
          onOpenChange={(open) => setInvoiceModal((m) => ({ ...m, open }))}
          companyId={selectedCompany.id}
          userId={invoiceModal.userId}
          professionalName={invoiceModal.name}
          totalMinutes={invoiceModal.totalMinutes}
          periodFrom={dateFrom}
          periodTo={dateTo}
        />
      )}
    </>
  );
}
