import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ClockButton } from "@/components/ponto/ClockButton";
import { ClockHistory } from "@/components/ponto/ClockHistory";
import { ProfessionalClockReport } from "@/components/ponto/ProfessionalClockReport";
import { ProfessionalInvoices } from "@/components/ponto/ProfessionalInvoices";
import { ProfessionalSchedule } from "@/components/ponto/ProfessionalSchedule";
import { ProfessionalSwapRequests } from "@/components/escalas/ProfessionalSwapRequests";
import { LogOut, Stethoscope } from "lucide-react";

export default function PontoProfissional() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-accent" />
            <span className="font-semibold text-sm">Relógio de Ponto</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {profile?.full_name}
            </span>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Tabs defaultValue="ponto">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="w-max sm:w-auto">
              <TabsTrigger value="ponto">Bater Ponto</TabsTrigger>
              <TabsTrigger value="escala">Minha Escala</TabsTrigger>
              <TabsTrigger value="trocas">Trocas</TabsTrigger>
              <TabsTrigger value="relatorio">Relatório</TabsTrigger>
              <TabsTrigger value="notas">Notas Fiscais</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ponto" className="space-y-4">
            <div className="max-w-md mx-auto">
              <ClockButton />
            </div>
            <ClockHistory />
          </TabsContent>

          <TabsContent value="escala">
            <ProfessionalSchedule />
          </TabsContent>

          <TabsContent value="trocas">
            <ProfessionalSwapRequests />
          </TabsContent>

          <TabsContent value="relatorio">
            <ProfessionalClockReport />
          </TabsContent>

          <TabsContent value="notas">
            <ProfessionalInvoices />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
