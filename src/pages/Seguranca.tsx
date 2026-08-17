import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  FileText,
  ListChecks,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "@/integrations/api/client";
import { useCompany } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCnpj } from "@/lib/seguranca/matrix";
import type { SegClient } from "@/lib/seguranca/types";

const flowSteps = [
  { icon: Building2, step: "1", title: "Empresa cliente", description: "CNPJ, CNAE e grau de risco." },
  { icon: ClipboardList, step: "2", title: "Levantamento em campo", description: "Setores, cargos e agentes de risco." },
  { icon: ShieldAlert, step: "3", title: "GES e Matriz", description: "Classificação automática 5×5." },
  { icon: ListChecks, step: "4", title: "Plano de Ação", description: "Medidas, prazos e responsáveis." },
  { icon: FileText, step: "5", title: "PGR/PGRTR", description: "Documento completo com revisões." },
];

export default function Seguranca() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const clients = useQuery({
    queryKey: ["seg-clients", companyId],
    queryFn: () => api.get<{ clients: SegClient[] }>("/seguranca/clients", { companyId }),
    enabled: Boolean(companyId),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Segurança do Trabalho</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerenciamento de riscos ocupacionais — PGR e PGRTR gerados a partir da coleta em campo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="h-7 gap-1.5 px-3 text-xs font-semibold" aria-live="polite" variant="secondary">
            {online ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5 text-warning" />}
            {online ? "Online" : "Offline"}
          </Badge>
          <Button asChild>
            <Link to="/seguranca/empresas/nova">
              <Plus className="h-4 w-4" /> Nova empresa
            </Link>
          </Button>
        </div>
      </div>

      {clients.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-[10px]" />
          <Skeleton className="h-24 rounded-[10px]" />
        </div>
      ) : clients.isError ? (
        <Card className="rounded-[10px] p-8 text-center">
          <p className="text-sm font-semibold">Não foi possível carregar as empresas.</p>
          <p className="mt-1 text-xs text-muted-foreground">Verifique sua conexão e tente novamente.</p>
        </Card>
      ) : (clients.data?.clients.length ?? 0) === 0 ? (
        <Card className="relative overflow-hidden rounded-[10px] p-8 sm:p-10">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(hsl(222 40% 30% / 0.10) 1px, transparent 1px), linear-gradient(90deg, hsl(222 40% 30% / 0.10) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-accent shadow-lg shadow-blue-900/20">
                <ShieldCheck className="h-6 w-6 text-[#17233F]" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight">Coleta de riscos em campo</h2>
                <p className="text-xs text-muted-foreground">Do levantamento ao documento pronto — com cache offline para áreas sem sinal.</p>
              </div>
            </div>

            <ol className="mt-8 grid gap-3 sm:grid-cols-5">
              {flowSteps.map(({ icon: Icon, step, title, description }) => (
                <li key={step} className="rounded-[10px] border border-border bg-background/60 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/[0.07]">
                      <Icon className="h-4 w-4 text-accent" strokeWidth={1.75} />
                    </div>
                    <span className="font-display text-xs font-bold text-muted-foreground">{step}</span>
                  </div>
                  <h3 className="font-display mt-3 text-sm font-bold">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>

            <div className="mt-8 rounded-[10px] border border-dashed border-border bg-background/60 p-6 text-center">
              <h3 className="font-display text-sm font-bold">Nenhuma empresa cliente cadastrada</h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Cadastre a primeira empresa para iniciar o levantamento de riscos em campo.
              </p>
              <Button asChild className="mt-4">
                <Link to="/seguranca/empresas/nova">
                  <Plus className="h-4 w-4" /> Cadastrar primeira empresa
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {clients.data?.clients.map((c) => (
            <Link key={c.id} to={"/seguranca/empresas/" + c.id} className="group">
              <Card className="h-full rounded-[10px] p-5 transition-colors group-hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-sm font-bold">{c.razao_social}</h3>
                  {c.grau_risco !== null && (
                    <Badge variant="secondary" className="shrink-0 text-xs">GR {c.grau_risco}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatCnpj(c.cnpj)}</p>
                {c.atividade_principal && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{c.atividade_principal}</p>
                )}
                {c.responsavel && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/70">Responsável:</span> {c.responsavel}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
