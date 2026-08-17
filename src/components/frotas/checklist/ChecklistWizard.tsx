import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Car, CheckCircle2, ClipboardList, Camera, PenLine, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  ChecklistItem,
  ChecklistTemplate,
  DEFAULT_TEMPLATE_ITEMS,
  DEFAULT_TEMPLATE_NAME,
  computeChecklistStatus,
  itemAnswerIsValid,
} from "@/lib/checklist";
import { ChecklistItemRow } from "./ChecklistItemRow";
import { PhotoCapture } from "./PhotoCapture";
import { SignatureCanvas } from "./SignatureCanvas";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

const STEPS = [
  { label: "Veículo", icon: Car },
  { label: "Itens", icon: ClipboardList },
  { label: "Fotos", icon: Camera },
  { label: "Assinatura", icon: PenLine },
  { label: "Revisão", icon: CheckCircle2 },
];

interface VehicleOption {
  id: string;
  plate: string;
  brand: string;
  model: string;
  status: string;
}

type Answer = { ok: boolean; observation: string };

export function ChecklistWizard() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [odometer, setOdometer] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [signature, setSignature] = useState("");
  const [notes, setNotes] = useState("");

  const companyId = selectedCompany?.id;

  // Carrega veículos ativos e garante um template ativo (cria o padrão se não houver)
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [vehiclesData, templatesData] = await Promise.all([
        api.get<VehicleOption[]>("/fleet/vehicles", { companyId }),
        api.get<(ChecklistTemplate & { items: ChecklistItem[] })[]>("/fleet/templates", { companyId }),
      ]);
      if (cancelled) return;

      const active = templatesData.filter((x) => x.active);
      let tpl: ChecklistTemplate | null = active[0] || null;
      if (!tpl) {
        tpl = await api.post<ChecklistTemplate>("/fleet/templates", {
          companyId,
          name: DEFAULT_TEMPLATE_NAME,
          category: "pre_uso",
          active: true,
          items: DEFAULT_TEMPLATE_ITEMS.map((d, i) => ({ description: d, required: true, sort_order: i + 1 })),
        });
      }

      const itm: ChecklistItem[] = (active[0] || (tpl ? (await api.get<(ChecklistTemplate & { items: ChecklistItem[] })[]>("/fleet/templates", { companyId })).find((x) => x.id === tpl!.id) : null))?.items || [];

      if (cancelled) return;
      setVehicles(vehiclesData.filter((v) => v.status === "ativo"));
      setTemplate(tpl);
      setItems(itm);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [companyId]);

  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(vehicleId) && driverName.trim().length >= 2 && (odometer === "" || Number(odometer) >= 0);
    if (step === 1) return items.length > 0 && items.every((it) => {
      const a = answers[it.id];
      return a && (it.required ? itemAnswerIsValid(a.ok, a.observation) : true);
    });
    if (step === 2) return true; // fotos opcionais
    if (step === 3) return signature.length > 0;
    return true;
  }, [step, vehicleId, driverName, odometer, items, answers, signature]);

  const failCount = useMemo(() => items.filter((it) => answers[it.id]?.ok === false).length, [items, answers]);

  const goNext = () => {
    setAttempted(true);
    if (!stepValid) {
      toast({ title: "Complete a etapa", description: "Preencha os campos obrigatórios para avançar.", variant: "destructive" });
      return;
    }
    setAttempted(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setAttempted(false);
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (!companyId || !template || !user) return;
    setSaving(true);

    const photosBase64: string[] = [];
    for (const photo of photos) {
      photosBase64.push(await fileToDataUrl(photo));
    }

    let checklist: { id: string; status: string };
    try {
      checklist = await api.post("/fleet/checklists", {
        companyId,
        vehicle_id: vehicleId,
        template_id: template.id,
        driver_name: driverName.trim(),
        odometer: odometer === "" ? null : Number(odometer),
        status: computeChecklistStatus(items.map((it) => ({ ok: answers[it.id]?.ok ?? true }))),
        notes: notes.trim() || null,
        signature_data_url: signature,
        answers: items.map((it) => ({
          item_id: it.id,
          ok: answers[it.id]?.ok ?? true,
          observation: answers[it.id]?.ok === false ? answers[it.id].observation.trim() : null,
        })),
        photos: photosBase64,
      });
    } catch (err) {
      toast({ title: "Erro ao salvar inspeção", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
      setSaving(false);
      return;
    }

    setSaving(false);
    toast({
      title: "Inspeção registrada!",
      description: checklist.status === "conforme" ? "Veículo conforme. Fotos e assinatura gravadas." : "Não conformidades registradas. Fotos e assinatura gravadas.",
    });
    navigate("/frotas/inspecoes/" + checklist.id, { replace: true });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-[10px] bg-muted" />
        ))}
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <Card className="rounded-[10px]">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <p className="text-sm font-medium">Nenhum veículo ativo para inspecionar.</p>
          <p className="text-xs text-muted-foreground">Cadastre um veículo na aba Veículos antes de iniciar a inspeção.</p>
          <Button variant="outline" onClick={() => navigate("/frotas")}>Ir para Frotas</Button>
        </CardContent>
      </Card>
    );
  }

  const vehicleLabel = (v: VehicleOption) => v.plate + " · " + v.brand + " " + v.model;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Progresso */}
      <ol className="flex items-center gap-1 sm:gap-2" aria-label="Progresso da inspeção">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.label} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors",
                  done && "border-success bg-success text-success-foreground",
                  current && "border-primary bg-primary text-primary-foreground",
                  !done && !current && "border-border text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className={cn("hidden text-[11px] font-medium sm:block", current ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <Card className="rounded-[10px]">
          <CardContent className="space-y-5 pt-6">
            <div>
              <h2 className="font-display text-lg font-bold">Veículo e condutor</h2>
              <p className="text-sm text-muted-foreground">Identifique o veículo e quem está realizando a inspeção.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle" className="text-xs font-medium">Veículo *</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger id="vehicle" className={cn("h-11 w-full", attempted && !vehicleId && "border-destructive")}>
                  <SelectValue placeholder="Selecione o veículo" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver" className="text-xs font-medium">Condutor *</Label>
              <Input id="driver" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Nome do condutor" className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="odo" className="text-xs font-medium">Quilometragem atual</Label>
              <Input id="odo" type="number" min={0} value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="Ex.: 45210" className="h-11 tabular-nums" />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold">{template?.name || "Itens da inspeção"}</h2>
            <p className="text-sm text-muted-foreground">Responda todos os itens; "Não" exige descrever o problema.</p>
          </div>
          {items.map((it, i) => (
            <ChecklistItemRow
              key={it.id}
              index={i}
              description={it.description}
              required={it.required}
              ok={answers[it.id]?.ok ?? null}
              observation={answers[it.id]?.observation || ""}
              onOkChange={(ok) => setAnswers((p) => ({ ...p, [it.id]: { ok, observation: p[it.id]?.observation || "" } }))}
              onObservationChange={(v) => setAnswers((p) => ({ ...p, [it.id]: { ok: p[it.id]?.ok ?? false, observation: v } }))}
              observationError={attempted && answers[it.id]?.ok === false && !itemAnswerIsValid(false, answers[it.id]?.observation || "")}
            />
          ))}
        </div>
      )}

      {step === 2 && (
        <Card className="rounded-[10px]">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-display text-lg font-bold">Evidências fotográficas</h2>
              <p className="text-sm text-muted-foreground">Opcional — registre o estado do veículo.</p>
            </div>
            <PhotoCapture photos={photos} onChange={setPhotos} />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="rounded-[10px]">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-display text-lg font-bold">Assinatura do condutor</h2>
              <p className="text-sm text-muted-foreground">A assinatura é obrigatória para concluir.</p>
            </div>
            <SignatureCanvas onChange={setSignature} />
            {attempted && !signature && <p className="text-xs font-medium text-destructive">Assine para continuar.</p>}
            <div className="space-y-2 pt-2">
              <Label htmlFor="notes" className="text-xs font-medium">Observações gerais (opcional)</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anotações adicionais da inspeção" />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card className="rounded-[10px]">
          <CardContent className="space-y-5 pt-6">
            <div>
              <h2 className="font-display text-lg font-bold">Revisão</h2>
              <p className="text-sm text-muted-foreground">Confira os dados antes de concluir.</p>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted-foreground">Veículo</dt>
                <dd className="font-medium">{vehicleLabel(vehicles.find((v) => v.id === vehicleId)!)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted-foreground">Condutor</dt>
                <dd className="font-medium">{driverName}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted-foreground">Quilometragem</dt>
                <dd className="font-medium tabular-nums">{odometer === "" ? "—" : Number(odometer).toLocaleString("pt-BR")}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted-foreground">Itens</dt>
                <dd className="font-medium tabular-nums">{items.length - failCount}/{items.length} conformes</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted-foreground">Fotos</dt>
                <dd className="font-medium tabular-nums">{photos.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Resultado</dt>
                <dd className={cn("font-display font-bold", failCount > 0 ? "text-destructive" : "text-success")}>
                  {failCount > 0 ? "NÃO CONFORME" : "CONFORME"}
                </dd>
              </div>
            </dl>
            {signature && <img src={signature} alt="Assinatura do condutor" className="h-16 rounded border border-border bg-white object-contain px-2" />}
          </CardContent>
        </Card>
      )}

      {/* Navegação */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={goBack} disabled={step === 0 || saving}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="solid" onClick={goNext}>
            Avançar <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="accent" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Concluir inspeção
          </Button>
        )}
      </div>
    </div>
  );
}