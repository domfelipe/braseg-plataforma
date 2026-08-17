import type { LucideIcon } from "lucide-react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ModuleDef } from "@/lib/moduleRegistry";
import { useNavigate } from "react-router-dom";

interface ModuleCardProps {
  module: ModuleDef;
  kpi?: { label: string; value: string };
}

export function ModuleCard({ module, kpi }: ModuleCardProps) {
  const navigate = useNavigate();
  const Icon: LucideIcon = module.icon;

  const inner = (
    <Card className="group relative h-full overflow-hidden rounded-[10px] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(23_35_63/0.10)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/[0.06] blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-sm">
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <div className="flex items-center gap-2">
          {module.external && (
            <Badge className="h-5 border-0 bg-muted px-2 text-[10px] font-medium text-muted-foreground">
              externo
            </Badge>
          )}
          {module.comingSoon && (
            <Badge className="h-5 border-0 bg-primary/15 px-2 text-[10px] font-semibold text-primary">
              Em breve
            </Badge>
          )}
        </div>
      </div>

      <h3 className="font-display mt-5 text-lg font-bold tracking-tight">{module.label}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{module.description}</p>

      <div className="mt-6 flex items-center justify-between">
        {kpi ? (
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tabular-nums">{kpi.value}</span>
            <span className="text-xs text-muted-foreground">{kpi.label}</span>
          </div>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-1.5 text-sm font-medium text-accent transition-transform duration-200 group-hover:translate-x-0.5">
          {module.comingSoon ? "Saiba mais" : module.external ? "Abrir" : "Acessar"}
          {module.external ? (
            <ExternalLink className="h-3.5 w-3.5" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
        </span>
      </div>
    </Card>
  );

  if (module.external && module.externalUrl) {
    return (
      <a href={module.externalUrl} target="_blank" rel="noopener noreferrer" className="block h-full">
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(module.route || "/")}
      className="block h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-[10px]"
    >
      {inner}
    </button>
  );
}
