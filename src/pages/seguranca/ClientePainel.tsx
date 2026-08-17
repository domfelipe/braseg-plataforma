import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { api } from "@/integrations/api/client";
import { useCompany } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCnpj } from "@/lib/seguranca/matrix";
import type { SegClient, SegCounts } from "@/lib/seguranca/types";
import Documentos from "./Documentos";
import Ges from "./Ges";
import Levantamento from "./Levantamento";
import Matriz from "./Matriz";
import PlanoAcao from "./PlanoAcao";

const steps = [
  { key: "roles", label: "Levantamento", done: (c: SegCounts) => c.roles > 0 },
  { key: "ges", label: "GES", done: (c: SegCounts) => c.ges > 0 },
  { key: "risks", label: "Matriz de risco", done: (c: SegCounts) => c.risks > 0 },
  { key: "plan", label: "Plano de ação", done: (c: SegCounts) => c.plan > 0 },
  { key: "documents", label: "Documento", done: (c: SegCounts) => c.documents > 0 },
];

function ComingSoon({ title }: { title: string }) {
  return (
    <Card className="rounded-[10px] p-10 text-center">
      <h3 className="font-display text-sm font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
        Esta etapa chega na próxima fase do build. O motor da matriz de risco 5×5 e os catálogos oficiais já estão prontos.
      </p>
    </Card>
  );
}

export default function ClientePainel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  const detail = useQuery({
    queryKey: ["seg-client", companyId, id],
    queryFn: () => api.get<{ client: SegClient; counts: SegCounts }>("/seguranca/clients/" + id, { companyId }),
    enabled: Boolean(companyId && id),
  });

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 rounded-[10px]" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="rounded-[10px] p-8 text-center">
          <p className="text-sm font-semibold">Empresa não encontrada.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/seguranca")}>
            <ArrowLeft className="h-4 w-4" /> Voltar para Segurança do Trabalho
          </Button>
        </Card>
      </div>
    );
  }

  const { client, counts } = detail.data;

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate("/seguranca")}>
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{client.razao_social}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCnpj(client.cnpj)}
            {client.grau_risco !== null && <Badge variant="secondary" className="ml-2 text-xs">Grau de risco {client.grau_risco}</Badge>}
          </p>
        </div>
      </div>

      <ol className="mt-6 flex flex-wrap items-center gap-2">
        {steps.map((s, i) => {
          const done = s.done(counts);
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span className={"flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs " + (done ? "border-success/40 bg-success/10 text-success" : "border-border bg-background text-muted-foreground")}>
                {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="h-px w-3 bg-border" />}
            </li>
          );
        })}
      </ol>

      <Tabs defaultValue="visao" className="mt-6">
        <TabsList>
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="levantamento">Levantamento</TabsTrigger>
          <TabsTrigger value="ges">GES</TabsTrigger>
          <TabsTrigger value="matriz">Matriz</TabsTrigger>
          <TabsTrigger value="plano">Plano de ação</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Setores", n: counts.sectors },
              { label: "Cargos", n: counts.roles },
              { label: "Funcionários ativos", n: counts.employees },
              { label: "GES", n: counts.ges },
              { label: "Riscos na matriz", n: counts.risks },
              { label: "Documentos gerados", n: counts.documents },
            ].map((k) => (
              <Card key={k.label} className="rounded-[10px] p-4">
                <p className="font-display text-2xl font-bold tabular-nums">{k.n}</p>
                <p className="mt-1 text-xs text-muted-foreground">{k.label}</p>
              </Card>
            ))}
          </div>
          {client.atividade_principal && (
            <Card className="mt-4 rounded-[10px] p-5">
              <h3 className="font-display text-sm font-bold">Atividade principal</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{client.atividade_principal}</p>
            </Card>
          )}
          {client.responsavel && (
            <Card className="mt-3 rounded-[10px] p-5">
              <h3 className="font-display text-sm font-bold">Responsável</h3>
              <p className="mt-1 text-sm text-muted-foreground">{client.responsavel}</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="levantamento" className="mt-4">
          <Levantamento clientId={id ?? ""} companyId={companyId ?? ""} />
        </TabsContent>

        <TabsContent value="ges" className="mt-4"><Ges clientId={id ?? ""} companyId={companyId ?? ""} /></TabsContent>
        <TabsContent value="matriz" className="mt-4"><Matriz clientId={id ?? ""} companyId={companyId ?? ""} /></TabsContent>
        <TabsContent value="plano" className="mt-4"><PlanoAcao clientId={id ?? ""} companyId={companyId ?? ""} /></TabsContent>
        <TabsContent value="documentos" className="mt-4"><Documentos clientId={id ?? ""} companyId={companyId ?? ""} /></TabsContent>
      </Tabs>
    </div>
  );
}
