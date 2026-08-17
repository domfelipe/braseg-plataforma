import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Car, Wrench, Bell, LayoutDashboard, BarChart3 } from "lucide-react";
import FleetVehicles from "@/components/frotas/FleetVehicles";
import FleetMaintenances from "@/components/frotas/FleetMaintenances";
import FleetReminders from "@/components/frotas/FleetReminders";
import FleetOverview from "@/components/frotas/FleetOverview";
import FleetCostReport from "@/components/frotas/FleetCostReport";

export default function Frotas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Frotas</h1>
        <p className="text-muted-foreground">Gerencie veículos, manutenções e vencimentos.</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="h-4 w-4 hidden sm:block" />Dashboard</TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-1.5"><Car className="h-4 w-4 hidden sm:block" />Veículos</TabsTrigger>
            <TabsTrigger value="maintenances" className="gap-1.5"><Wrench className="h-4 w-4 hidden sm:block" />Manutenções</TabsTrigger>
            <TabsTrigger value="reminders" className="gap-1.5"><Bell className="h-4 w-4 hidden sm:block" />Vencimentos</TabsTrigger>
            <TabsTrigger value="costs" className="gap-1.5"><BarChart3 className="h-4 w-4 hidden sm:block" />Custos</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview"><FleetOverview /></TabsContent>
        <TabsContent value="vehicles"><FleetVehicles /></TabsContent>
        <TabsContent value="maintenances"><FleetMaintenances /></TabsContent>
        <TabsContent value="reminders"><FleetReminders /></TabsContent>
        <TabsContent value="costs"><FleetCostReport /></TabsContent>
      </Tabs>
    </div>
  );
}
