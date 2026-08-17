import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { FileText, Calculator } from "lucide-react";

interface InvoiceGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  userId: string;
  professionalName: string;
  totalMinutes: number;
  periodFrom: string;
  periodTo: string;
  onSaved?: () => void;
}

export function InvoiceGeneratorModal({
  open,
  onOpenChange,
  companyId,
  userId,
  professionalName,
  totalMinutes,
  periodFrom,
  periodTo,
  onSaved,
}: InvoiceGeneratorModalProps) {
  const { user } = useAuth();
  const totalHours = Math.round((totalMinutes / 60) * 1000) / 1000;

  const [form, setForm] = useState({
    professional_cpf_cnpj: "",
    professional_role: "",
    service_description: "Prestação de serviços médicos em Unidade Básica de Saúde",
    municipal_code: "",
    hourly_rate: 0,
    iss_rate: 5,
    inss_rate: 11,
    irrf_rate: 0,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, hourly_rate: 0 }));
    }
  }, [open]);

  const totalAmount = totalHours * form.hourly_rate;
  const issAmount = totalAmount * (form.iss_rate / 100);
  const inssAmount = totalAmount * (form.inss_rate / 100);
  const irrfAmount = totalAmount * (form.irrf_rate / 100);
  const netAmount = totalAmount - issAmount - inssAmount - irrfAmount;

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleSave = async (status: "rascunho" | "emitida") => {
    if (form.hourly_rate <= 0) {
      toast.error("Informe o valor/hora.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("clock_invoices").insert({
      company_id: companyId,
      user_id: userId,
      professional_name: professionalName,
      professional_cpf_cnpj: form.professional_cpf_cnpj || null,
      professional_role: form.professional_role || null,
      service_description: form.service_description || null,
      period_from: periodFrom,
      period_to: periodTo,
      total_hours: totalHours,
      hourly_rate: form.hourly_rate,
      total_amount: totalAmount,
      iss_rate: form.iss_rate,
      iss_amount: issAmount,
      inss_rate: form.inss_rate,
      inss_amount: inssAmount,
      irrf_rate: form.irrf_rate,
      irrf_amount: irrfAmount,
      net_amount: netAmount,
      municipal_code: form.municipal_code || null,
      notes: form.notes || null,
      status,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success(status === "rascunho" ? "Rascunho salvo!" : "NF gerada com sucesso!");
      onOpenChange(false);
      onSaved?.();
    }
  };

  const update = (field: string, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Gerar Nota Fiscal
          </DialogTitle>
          <DialogDescription>
            Preencha os dados para gerar a NF a partir do relatório de ponto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Dados do Profissional */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Dados do Profissional</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input value={professionalName} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CPF/CNPJ</Label>
                <Input
                  placeholder="000.000.000-00"
                  value={form.professional_cpf_cnpj}
                  onChange={(e) => update("professional_cpf_cnpj", e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Cargo / Função (CBO)</Label>
                <Input
                  placeholder="Ex: Médico Clínico Geral"
                  value={form.professional_role}
                  onChange={(e) => update("professional_role", e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Período e Serviço */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Serviço Prestado</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Período De</Label>
                <Input value={periodFrom} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Período Até</Label>
                <Input value={periodTo} disabled />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Descrição do Serviço</Label>
                <Textarea
                  value={form.service_description}
                  onChange={(e) => update("service_description", e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Código do Serviço Municipal</Label>
                <Input
                  placeholder="Ex: 05.01"
                  value={form.municipal_code}
                  onChange={(e) => update("municipal_code", e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Valores */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calculator className="h-4 w-4" /> Valores
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Total de Horas</Label>
                <Input value={`${totalHours}h`} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor/Hora (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.hourly_rate || ""}
                  onChange={(e) => update("hourly_rate", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor Total</Label>
                <Input value={fmt(totalAmount)} disabled className="font-semibold" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Impostos */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Impostos</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">ISS (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.iss_rate}
                  onChange={(e) => update("iss_rate", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ISS Valor</Label>
                <Input value={fmt(issAmount)} disabled />
              </div>
              <div />
              <div className="space-y-1">
                <Label className="text-xs">INSS (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.inss_rate}
                  onChange={(e) => update("inss_rate", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">INSS Valor</Label>
                <Input value={fmt(inssAmount)} disabled />
              </div>
              <div />
              <div className="space-y-1">
                <Label className="text-xs">IRRF (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.irrf_rate}
                  onChange={(e) => update("irrf_rate", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">IRRF Valor</Label>
                <Input value={fmt(irrfAmount)} disabled />
              </div>
            </div>
          </div>

          <Separator />

          {/* Valor líquido */}
          <div className="flex items-center justify-between rounded-md bg-muted p-3">
            <span className="text-sm font-semibold">Valor Líquido</span>
            <span className="text-lg font-bold text-primary">{fmt(netAmount)}</span>
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={2}
              placeholder="Observações adicionais..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => handleSave("rascunho")} disabled={saving}>
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSave("emitida")} disabled={saving}>
              Gerar NF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
