import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QrCode, Plus, Trash2, Download, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";

interface QrToken {
  id: string;
  user_id: string;
  user_name: string;
  token: string;
  active: boolean;
  created_at: string;
}

export function QrTokensManager() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [viewToken, setViewToken] = useState<QrToken | null>(null);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["qr-tokens", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await supabase
        .from("clock_qr_tokens")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .order("user_name");
      if (error) throw error;
      return data as QrToken[];
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["company-users-qr", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await supabase
        .from("user_company_access")
        .select("user_id, user_profiles!user_company_access_user_id_profiles_fkey(id, full_name)")
        .eq("company_id", selectedCompany.id);
      return (data || [])
        .map((d: any) => ({
          id: d.user_id,
          name: d.user_profiles?.full_name || "Sem nome",
        }))
        .filter(
          (u: any) => !tokens.some((t) => t.user_id === u.id)
        );
    },
    enabled: !!selectedCompany?.id,
  });

  const generateToken = async () => {
    if (!selectedUserId || !selectedCompany?.id) return;

    const selectedUser = users.find((u: any) => u.id === selectedUserId);
    if (!selectedUser) return;

    const { error } = await supabase.from("clock_qr_tokens").insert({
      user_id: selectedUserId,
      company_id: selectedCompany.id,
      user_name: selectedUser.name,
      created_by: user?.id,
    });

    if (error) {
      toast({
        title: "Erro ao gerar QR",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "QR Code gerado com sucesso" });
    setSelectedUserId("");
    queryClient.invalidateQueries({ queryKey: ["qr-tokens"] });
    queryClient.invalidateQueries({ queryKey: ["company-users-qr"] });
  };

  const deleteToken = async (id: string) => {
    const { error } = await supabase
      .from("clock_qr_tokens")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "QR Code removido" });
    queryClient.invalidateQueries({ queryKey: ["qr-tokens"] });
    queryClient.invalidateQueries({ queryKey: ["company-users-qr"] });
  };

  const toggleActive = async (token: QrToken) => {
    await supabase
      .from("clock_qr_tokens")
      .update({ active: !token.active })
      .eq("id", token.id);

    queryClient.invalidateQueries({ queryKey: ["qr-tokens"] });
  };

  const downloadQr = (token: QrToken) => {
    const svg = document.getElementById(`qr-${token.id}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 400, 400);
      ctx.drawImage(img, 0, 0, 400, 400);

      // Add name
      ctx.fillStyle = "black";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(token.user_name, 200, 385);

      const link = document.createElement("a");
      link.download = `qr-${token.user_name.replace(/\s/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Codes para Ponto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Generate new */}
          <div className="flex gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione um profissional..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={generateToken} disabled={!selectedUserId}>
              <Plus className="h-4 w-4 mr-1" />
              Gerar
            </Button>
          </div>

          {/* List */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum QR Code gerado ainda
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <QrCode className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{token.user_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Criado em{" "}
                        {new Date(token.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={token.active ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() => toggleActive(token)}
                    >
                      {token.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setViewToken(token)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteToken(token.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR View Dialog */}
      <Dialog open={!!viewToken} onOpenChange={() => setViewToken(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">
              {viewToken?.user_name}
            </DialogTitle>
          </DialogHeader>
          {viewToken && (
            <div className="flex flex-col items-center gap-4">
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG
                  id={`qr-${viewToken.id}`}
                  value={viewToken.token}
                  size={256}
                  level="H"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Escaneie este código na página de Ponto UBS
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => downloadQr(viewToken)}
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar QR Code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
