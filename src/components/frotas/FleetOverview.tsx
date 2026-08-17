import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, Wrench, AlertTriangle, DollarSign } from "lucide-react";
import { format, differenceInDays } from "date-fns";

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FleetOverview() {
  const { selectedCompany } = useCompany();
  const [stats, setStats] = useState({ vehicles: 0, activeVehicles: 0, totalMaintCost: 0, maintenances: 0 });
  const [upcomingReminders, setUpcomingReminders] = useState<any[]>([]);
  const [recentMaintenances, setRecentMaintenances] = useState<any[]>([]);
  const [vehicleMap, setVehicleMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const companyId = selectedCompany?.id;

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      setLoading(true);
      const [{ data: vehicles }, { data: maintenances }, { data: reminders }] = await Promise.all([
        supabase.from("fleet_vehicles").select("*").eq("company_id", companyId),
        supabase.from("fleet_maintenances").select("*").eq("company_id", companyId).order("date", { ascending: false }).limit(5),
        supabase.from("fleet_reminders").select("*").eq("company_id", companyId).in("status", ["pendente", "vencido"]).order("due_date").limit(10),
      ]);

      const vList = (vehicles as any[]) || [];
      const mList = (maintenances as any[]) || [];
      const rList = (reminders as any[]) || [];

      const vMap = Object.fromEntries(vList.map(v => [v.id, v]));
      setVehicleMap(vMap);

      // Get total maintenance cost
      const { data: allMaint } = await supabase.from("fleet_maintenances").select("cost").eq("company_id", companyId);
      const totalCost = ((allMaint as any[]) || []).reduce((s, m) => s + (m.cost || 0), 0);

      setStats({
        vehicles: vList.length,
        activeVehicles: vList.filter(v => v.status === "ativo").length,
        totalMaintCost: totalCost,
        maintenances: ((allMaint as any[]) || []).length,
      });

      // Mark overdue
      const now = new Date();
      setUpcomingReminders(rList.map(r => ({
        ...r,
        status: r.status === "pendente" && new Date(r.due_date) < now ? "vencido" : r.status,
      })));
      setRecentMaintenances(mList);
      setLoading(false);
    };
    fetch();
  }, [companyId]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Car className="h-5 w-5 text-primary" /></div>
              <div><p className="text-2xl font-bold">{stats.activeVehicles}</p><p className="text-xs text-muted-foreground">Veículos ativos</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Car className="h-5 w-5 text-primary" /></div>
              <div><p className="text-2xl font-bold">{stats.vehicles}</p><p className="text-xs text-muted-foreground">Total de veículos</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Wrench className="h-5 w-5 text-primary" /></div>
              <div><p className="text-2xl font-bold">{stats.maintenances}</p><p className="text-xs text-muted-foreground">Manutenções realizadas</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-primary" /></div>
              <div><p className="text-2xl font-bold text-lg">{formatCurrency(stats.totalMaintCost)}</p><p className="text-xs text-muted-foreground">Total em manutenções</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos vencimentos */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Próximos Vencimentos</CardTitle></CardHeader>
          <CardContent>
            {upcomingReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum vencimento pendente</p>
            ) : (
              <div className="space-y-3">
                {upcomingReminders.map(r => {
                  const v = vehicleMap[r.vehicle_id];
                  const days = differenceInDays(new Date(r.due_date), new Date());
                  return (
                    <div key={r.id} className={`flex items-center justify-between p-3 rounded-lg border ${r.status === "vencido" ? "border-destructive/30 bg-destructive/5" : days <= 7 ? "border-yellow-500/30 bg-yellow-500/5" : ""}`}>
                      <div>
                        <p className="text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground">{v?.plate} - {v?.brand} {v?.model}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={r.status === "vencido" ? "destructive" : "secondary"} className="text-xs">
                          {r.status === "vencido" ? "Vencido" : days === 0 ? "Hoje" : `${days}d`}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(r.due_date + "T12:00:00"), "dd/MM/yyyy")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimas manutenções */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Últimas Manutenções</CardTitle></CardHeader>
          <CardContent>
            {recentMaintenances.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma manutenção registrada</p>
            ) : (
              <div className="space-y-3">
                {recentMaintenances.map(m => {
                  const v = vehicleMap[m.vehicle_id];
                  return (
                    <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{m.description}</p>
                        <p className="text-xs text-muted-foreground">{v?.plate} · {format(new Date(m.date + "T12:00:00"), "dd/MM/yyyy")}</p>
                      </div>
                      <span className="text-sm font-medium">{formatCurrency(m.cost || 0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
