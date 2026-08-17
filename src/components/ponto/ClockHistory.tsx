import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, Camera } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ClockHistory() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [selfieDialog, setSelfieDialog] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["clock-entries-today", selectedCompany?.id, user?.id],
    queryFn: async () => {
      if (!selectedCompany?.id || !user?.id) return [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("clock_entries")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .eq("user_id", user.id)
        .gte("timestamp", today.toISOString())
        .order("timestamp", { ascending: true });

      return data || [];
    },
    enabled: !!selectedCompany?.id && !!user?.id,
  });

  const handleViewSelfie = async (path: string) => {
    const { data } = await supabase.storage
      .from("clock-selfies")
      .createSignedUrl(path, 300);
    if (data?.signedUrl) {
      setSelfieUrl(data.signedUrl);
      setSelfieDialog(path);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Registros de Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !entries?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum registro hoje.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Distância</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono">
                      {format(new Date(entry.timestamp), "HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.type === "entrada" ? "default" : "secondary"}>
                        {entry.type === "entrada" ? "Entrada" : "Saída"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {entry.valid ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-3.5 w-3.5" /> Válido
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> Inválido
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.distance_meters != null ? `${entry.distance_meters}m` : "—"}
                    </TableCell>
                    <TableCell>
                      {(entry as any).selfie_url && (
                        <button
                          onClick={() => handleViewSelfie((entry as any).selfie_url)}
                          className="p-1 rounded-md hover:bg-muted transition-colors"
                          title="Ver selfie"
                        >
                          <Camera className="h-4 w-4 text-primary" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selfieDialog} onOpenChange={() => { setSelfieDialog(null); setSelfieUrl(null); }}>
        <DialogContent className="max-w-xs p-2">
          {selfieUrl && (
            <img
              src={selfieUrl}
              alt="Selfie do ponto"
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
