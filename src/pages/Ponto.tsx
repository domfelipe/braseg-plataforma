import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { ClockButton } from "@/components/ponto/ClockButton";
import { ClockHistory } from "@/components/ponto/ClockHistory";
import { LocationsManager } from "@/components/ponto/LocationsManager";
import { ClockReport } from "@/components/ponto/ClockReport";
import { InvoicesList } from "@/components/ponto/InvoicesList";

export default function Ponto() {
  const { isMaster } = useAuth();
  const { isAcudir } = useCompany();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relógio de Ponto</h1>
        <p className="text-muted-foreground">Registro de ponto com validação por geolocalização</p>
      </div>

      <Tabs defaultValue="ponto">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="ponto">Bater Ponto</TabsTrigger>
            {isMaster && <TabsTrigger value="locais">Locais</TabsTrigger>}
            
            {isMaster && <TabsTrigger value="relatorio">Relatório</TabsTrigger>}
            {isMaster && isAcudir && <TabsTrigger value="notas">Notas Fiscais</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="ponto" className="space-y-4">
          <div className="max-w-md mx-auto">
            <ClockButton />
          </div>
          <ClockHistory />
        </TabsContent>

        {isMaster && (
          <TabsContent value="locais">
            <LocationsManager />
          </TabsContent>
        )}

        {isMaster && (
          <TabsContent value="relatorio">
            <ClockReport />
          </TabsContent>
        )}

        {isMaster && isAcudir && (
          <TabsContent value="notas">
            <InvoicesList />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
