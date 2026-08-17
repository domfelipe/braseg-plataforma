import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Car, Wrench, Bell, LayoutDashboard, BarChart3, ClipboardList } from "lucide-react";
import FleetVehicles from "@/components/frotas/FleetVehicles";
import FleetMaintenances from "@/components/frotas/FleetMaintenances";
import FleetReminders from "@/components/frotas/FleetReminders";
import FleetOverview from "@/components/frotas/FleetOverview";
import FleetCostReport from "@/components/frotas/FleetCostReport";
import { InspecoesTab } from "@/components/frotas/checklist/InspecoesTab";

export default function Frotas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Gestão de Frotas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Veículos, manutenções, vencimentos e inspeções diárias.</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="hidden h-4 w-4 sm:block" />Dashboard</TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-1.5"><Car className="hidden h-4 w-4 sm:block" />Veículos</TabsTrigger>
            <TabsTrigger value="maintenances" className="gap-1.5"><Wrench className="hidden h-4 w-4 sm:block" />Manutenções</TabsTrigger>
            <TabsTrigger value="reminders" className="gap-1.5"><Bell className="hidden h-4 w-4 sm:block" />Vencimentos</TabsTrigger>
            <TabsTrigger value="inspections" className="gap-1.5"><ClipboardList className="hidden h-4 w-4 sm:block" />Inspeções</TabsTrigger>
            <TabsTrigger value="costs" className="gap-1.5"><BarChart3 className="hidden h-4 w-4 sm:block" />Custos</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview"><FleetOverview /></TabsContent>
        <TabsContent value="vehicles"><FleetVehicles /></TabsContent>
        <TabsContent value="maintenances"><FleetMaintenances /></TabsContent>
        <TabsContent value="reminders"><FleetReminders /></TabsContent>
        <TabsContent value="inspections"><InspecoesTab /></TabsContent>
        <TabsContent value="costs"><FleetCostReport /></TabsContent>
      </Tabs>
    </div>
  );
}
