import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, X, Camera, PenLine, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatLocalDateTime } from "@/lib/utils";
import { ChecklistAnswerRow, ChecklistPhotoRow, ChecklistRow } from "@/lib/checklist";
import { cn } from "@/lib/utils";

interface DetailRow extends ChecklistRow {
  vehicle: { plate: string; brand: string; model: string } | null;
  template: { name: string } | null;
}

interface AnswerWithItem extends ChecklistAnswerRow {
  item: { description: string; required: boolean } | null;
}

export function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<DetailRow | null>(null);
  const [answers, setAnswers] = useState<AnswerWithItem[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      const [cRes, aRes, pRes] = await Promise.all([
        supabase.from("fleet_checklists").select("*, vehicle:fleet_vehicles(plate, brand, model), template:fleet_checklist_templates(name)").eq("id", id).single(),
        supabase.from("fleet_checklist_answers").select("*, item:fleet_checklist_items(description, required)").eq("checklist_id", id).order("created_at"),
        supabase.from("fleet_checklist_photos").select("*").eq("checklist_id", id).order("created_at"),
      ]);
      if (cancelled) return;
      setRow((cRes.data || null) as DetailRow | null);
      setAnswers((aRes.data || []) as AnswerWithItem[]);

      const photos = (pRes.data || []) as ChecklistPhotoRow[];
      const urls: string[] = [];
      for (const p of photos) {
        const { data } = await supabase.storage.from("fleet-checklists").createSignedUrl(p.storage_path, 3600);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      if (cancelled) return;
      setPhotoUrls(urls);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-[10px] bg-muted" />)}</div>;
  }

  if (!row) {
    return (
      <Card className="rounded-[10px]">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm font-medium">Inspeção não encontrada.</p>
          <Button variant="outline" onClick={() => navigate("/frotas")}><ArrowLeft className="h-4 w-4" /> Voltar para Frotas</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/frotas")} className="-ml-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Frotas
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{row.vehicle?.plate || "Inspeção"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {row.vehicle?.brand} {row.vehicle?.model} · {row.template?.name} · {formatLocalDateTime(row.created_at)}
          </p>
        </div>
        <Badge className={cn("h-6 shrink-0 border-0 px-2.5 text-xs font-semibold", row.status === "conforme" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
          {row.status === "conforme" ? "Conforme" : "Não conforme"}
        </Badge>
      </div>

      <Card className="rounded-[10px]">
        <CardContent className="space-y-3 pt-6">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Condutor</span>
            <span className="font-medium">{row.driver_name || "—"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Quilometragem</span>
            <span className="font-medium tabular-nums">{row.odometer != null ? row.odometer.toLocaleString("pt-BR") : "—"}</span>
          </div>
          {row.notes && (
            <div className="rounded-[10px] bg-muted/50 p-3 text-sm">{row.notes}</div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[10px]">
        <CardContent className="space-y-3 pt-6">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Itens</h2>
          {answers.length === 0 && <p className="text-sm text-muted-foreground">Sem respostas registradas.</p>}
          {answers.map((a, i) => (
            <div key={a.id} className="flex items-start gap-3 rounded-[10px] border border-border p-3">
              <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", a.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                {a.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i + 1}. {a.item?.description || "Item"}</p>
                {!a.ok && a.observation && <p className="mt-1 text-xs text-destructive">{a.observation}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {photoUrls.length > 0 && (
        <Card className="rounded-[10px]">
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-display flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <Camera className="h-4 w-4" /> Fotos ({photoUrls.length})
            </h2>
            <div className="flex flex-wrap gap-3">
              {photoUrls.map((u, i) => (
                <img key={i} src={u} alt={"Foto " + (i + 1) + " da inspeção"} className="h-28 w-28 rounded-[10px] border border-border object-cover" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-[10px]">
        <CardContent className="space-y-3 pt-6">
          <h2 className="font-display flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <PenLine className="h-4 w-4" /> Assinatura
          </h2>
          <img src={row.signature_data_url} alt="Assinatura do condutor" className="h-20 rounded border border-border bg-white object-contain px-3" />
        </CardContent>
      </Card>
    </div>
  );
}
