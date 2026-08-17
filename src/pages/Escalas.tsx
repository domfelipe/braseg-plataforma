import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, ArrowLeftRight, DollarSign, Stethoscope, Calendar, TrendingUp, Receipt } from "lucide-react";
import { WeeklyScheduleGrid } from "@/components/escalas/WeeklyScheduleGrid";
import { SwapRequestsList } from "@/components/escalas/SwapRequestsList";
import { ScheduleClosing } from "@/components/escalas/ScheduleClosing";
import { MonthlyScheduleView } from "@/components/escalas/MonthlyScheduleView";
import { PaymentRulesManager } from "@/components/escalas/PaymentRulesManager";
import { ProductivityDashboard } from "@/components/escalas/ProductivityDashboard";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";

export default function Escalas() {
  const { selectedCompany } = useCompany();
  const { isMaster } = useAuth();
  const [activeTab, setActiveTab] = useState("grid");

  if (!selectedCompany) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
          <Stethoscope className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Escalas</h1>
          <p className="text-muted-foreground text-sm">
            Gerencie plantões, trocas e fechamentos financeiros
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/60 backdrop-blur-sm border border-border/50 p-1 flex-wrap h-auto">
          <TabsTrigger value="grid" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
            <CalendarClock className="h-4 w-4" />
            <span className="hidden sm:inline">Escala Semanal</span>
            <span className="sm:hidden">Semanal</span>
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Visão Mensal</span>
            <span className="sm:hidden">Mensal</span>
          </TabsTrigger>
          <TabsTrigger value="swaps" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
            <ArrowLeftRight className="h-4 w-4" />
            Trocas
          </TabsTrigger>
          <TabsTrigger value="closing" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
            <DollarSign className="h-4 w-4" />
            Fechamento
          </TabsTrigger>
          {isMaster && (
            <TabsTrigger value="rules" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <Receipt className="h-4 w-4" />
              Repasse
            </TabsTrigger>
          )}
          <TabsTrigger value="productivity" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Produtividade</span>
            <span className="sm:hidden">Prod.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grid">
          <WeeklyScheduleGrid companyId={selectedCompany.id} />
        </TabsContent>

        <TabsContent value="monthly">
          <MonthlyScheduleView companyId={selectedCompany.id} />
        </TabsContent>

        <TabsContent value="swaps">
          <SwapRequestsList companyId={selectedCompany.id} />
        </TabsContent>

        <TabsContent value="closing">
          <ScheduleClosing companyId={selectedCompany.id} />
        </TabsContent>

        {isMaster && (
          <TabsContent value="rules">
            <PaymentRulesManager companyId={selectedCompany.id} />
          </TabsContent>
        )}

        <TabsContent value="productivity">
          <ProductivityDashboard companyId={selectedCompany.id} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
