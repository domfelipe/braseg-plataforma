import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, X, Camera, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/integrations/api/client";
import { useCompany } from "@/hooks/useCompany";
import { formatLocalDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface DetailRow {
  id: string;
  vehicle_id: string;
  template_id: string;
  driver_name: string | null;
  odometer: number | null;
  status: "conforme" | "nao_conforme";
  notes: string | null;
  signature_data_url: string;
  created_at: string;
  plate: string;
  brand: string;
  model: string;
  template_name: string;
}

interface AnswerRow {
  id: string;
  item_id: string;
  ok: boolean;
  observation: string | null;
  description: string;
  required: boolean;
}

interface PhotoRow {
  id: string;
  data_url: string;
}

export function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [row, setRow] = useState<DetailRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id || !selectedCompany?.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = (attempt: number) => {
      api
        .get<{ checklist: DetailRow; answers: AnswerRow[]; photos: PhotoRow[] }>("/fleet/checklists/" + id, {
          companyId: selectedCompany.id,
        })
        .then((data) => {
          if (cancelled) return;
          setRow(data.checklist);
          setAnswers(data.answers);
          setPhotos(data.photos);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          if (attempt < 3) {
            timer = setTimeout(() => load(attempt + 1), 700);
            return;
          }
          setNotFound(true);
          setLoading(false);
        });
    };
    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, selectedCompany?.id]);

  if (loading) {
    return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-[10px] bg-muted" />)}</div>;
  }

  if (notFound || !row) {
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
          <h1 className="font-display text-2xl font-bold tracking-tight">{row.plate}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {row.brand} {row.model} · {row.template_name} · {formatLocalDateTime(row.created_at)}
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
                <p className="text-sm font-medium">{i + 1}. {a.description}</p>
                {!a.ok && a.observation && <p className="mt-1 text-xs text-destructive">{a.observation}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {photos.length > 0 && (
        <Card className="rounded-[10px]">
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-display flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <Camera className="h-4 w-4" /> Fotos ({photos.length})
            </h2>
            <div className="flex flex-wrap gap-3">
              {photos.map((p) => (
                <img key={p.id} src={p.data_url} alt="Foto da inspeção" className="h-28 w-28 rounded-[10px] border border-border object-cover" />
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