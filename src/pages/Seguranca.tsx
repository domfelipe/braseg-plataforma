import { ShieldCheck, Camera, MapPin, WifiOff, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const futureFeatures = [
  { icon: ShieldCheck, title: "Checklists de normas", description: "Inspeções de campo guiadas pelas NRs (NR-33, NR-35 e outras), com itens obrigatórios e trilha completa." },
  { icon: Camera, title: "Evidências com foto e geolocalização", description: "Registro fotográfico com localização e horário carimbados em cada apontamento." },
  { icon: WifiOff, title: "Funcionamento offline", description: "Coleta contínua em campo mesmo sem sinal; sincronização automática ao reconectar." },
];

export default function Seguranca() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Segurança</h1>
        <p className="mt-1 text-sm text-muted-foreground">Coleta de dados de segurança do trabalho em campo.</p>
      </div>

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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-accent shadow-lg shadow-amber-500/20">
              <ShieldCheck className="h-6 w-6 text-[#17233F]" strokeWidth={1.75} />
            </div>
            <Badge className="h-6 border-0 bg-primary/15 px-2.5 text-xs font-semibold text-primary">Em breve</Badge>
          </div>

          <h2 className="font-display mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
            Coleta de dados de segurança em campo
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            O módulo de segurança transforma as inspeções de campo da Braseg em um fluxo digital
            completo: formulários padronizados, evidências verificáveis e relatórios prontos para
            a gestão de segurança do trabalho.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {futureFeatures.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-[10px] border border-border bg-background/60 p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/[0.07]">
                  <Icon className="h-4.5 w-4.5 h-[18px] w-[18px] text-accent" strokeWidth={1.75} />
                </div>
                <h3 className="font-display mt-3 text-sm font-bold">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-[10px] bg-accent p-6 text-accent-foreground sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-sm font-bold">Quer acompanhar o desenvolvimento?</p>
              <p className="mt-1 text-xs text-accent-foreground/70">Fale com a DOMCO sobre o piloto do app de campo para a Braseg.</p>
            </div>
            <Button variant="accent" className="shrink-0" onClick={() => (window.location.href = "mailto:felipe@domhubs.com.br?subject=Braseg%20Portal%20-%20M%C3%B3dulo%20Seguran%C3%A7a")}>
              Falar com a DOMCO <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
