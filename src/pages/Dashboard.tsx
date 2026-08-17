import { useMemo } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useDashboardModules } from "@/hooks/useDashboardModules";
import { MODULES } from "@/lib/moduleRegistry";
import { ModuleCard } from "@/components/dashboard/ModuleCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Button } from "@/components/ui/button";
import { Car, BellRing, Wrench, ClipboardCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function Dashboard() {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const { fleet, loading } = useDashboardModules(selectedCompany?.id ?? null);

  const firstName = profile?.full_name?.split(" ")[0] || "";
  const fleetModule = useMemo(() => MODULES.find((m) => m.key === "fleet"), []);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Olá{firstName ? ", " + firstName : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedCompany?.trade_name || selectedCompany?.name || "Braseg"} — operação, frota e segurança em um só lugar.
        </p>
      </motion.div>

      {/* Cartões de módulo */}
      <section aria-label="Módulos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.filter((m) => m.key !== "dashboard").map((mod, i) => (
          <motion.div key={mod.key} variants={fadeUp} initial="hidden" animate="visible" custom={i + 1} className="h-full">
            <ModuleCard
              module={mod}
              kpi={mod.key === "fleet" && !loading ? { label: "veículos ativos", value: String(fleet.vehicles) } : undefined}
            />
          </motion.div>
        ))}
      </section>

      {/* KPIs de frota */}
      <motion.section variants={fadeUp} initial="hidden" animate="visible" custom={2} aria-label="Indicadores de frota">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Indicadores de frota</h2>
          <Button variant="ghost" size="sm" className="text-accent" onClick={() => navigate("/frotas")}>
            Ver frota
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Veículos ativos" value={fleet.vehicles} icon={Car} tone="navy" loading={loading} />
          <KpiCard label="Vencimentos em 30d" value={fleet.remindersDue30} icon={BellRing} tone="amber" loading={loading} />
          <KpiCard label="Custo manutenções (mês)" value={fleet.maintenanceMonth} prefix="R$ " icon={Wrench} loading={loading} />
        </div>
      </motion.section>

      {/* Atalho nova inspeção (fluxo completo na Fase 2) */}
      {fleetModule && (
        <motion.section variants={fadeUp} initial="hidden" animate="visible" custom={3}>
          <div className="flex flex-col items-start justify-between gap-4 rounded-[10px] border border-border bg-gradient-to-r from-accent/[0.04] to-transparent p-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                <ClipboardCheck className="h-5 w-5 text-primary" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="font-display text-base font-bold tracking-tight">Inspeção diária de veículos</h3>
                <p className="text-sm text-muted-foreground">Checklist pré-uso com fotos e assinatura — em breve no módulo Frotas.</p>
              </div>
            </div>
            <Button variant="solid" className="shrink-0" onClick={() => navigate("/frotas")}>
              Nova inspeção
            </Button>
          </div>
        </motion.section>
      )}
    </div>
  );
}
