import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import FinancialOverview from "@/components/financial/FinancialOverview";
import TransactionsList from "@/components/financial/TransactionsList";
import CategoriesManager from "@/components/financial/CategoriesManager";
import FinancialReports from "@/components/financial/FinancialReports";
import FinancialFilters, { FinancialFiltersState } from "@/components/financial/FinancialFilters";
import FinancialIngestionStats, { IngestionOrigin } from "@/components/financial/FinancialIngestionStats";

export default function Financeiro() {
  const { selectedCompany, userModules } = useCompany();
  const [categories, setCategories] = useState<{ id: string; name: string; type: string }[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [whatsappCount, setWhatsappCount] = useState<number>(0);
  const [triageCount, setTriageCount] = useState<number>(0);
  const [origin, setOrigin] = useState<IngestionOrigin>("all");

  // Default the date filter to the current month so KPIs match the Dashboard
  // "período atual" totals exactly. Users can widen the range at any time.
  // A base padrão é "payment" (caixa realizado por data de pagamento); a opção
  // "Vencimento" continua disponível para visão por competência.
  const [filters, setFilters] = useState<FinancialFiltersState>(() => {
    const n = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const start = new Date(n.getFullYear(), n.getMonth(), 1);
    const end = new Date(n.getFullYear(), n.getMonth() + 1, 0);
    return {
      dateFrom: fmt(start),
      dateTo: fmt(end),
      city: "all",
      categoryId: "all",
      dateBase: "payment",
    };
  });


  useEffect(() => {
    if (!selectedCompany) return;
    const fetchMeta = async () => {
      const [catRes, cityRes, waTotalRes, waTriageRes] = await Promise.all([
        supabase.from("financial_categories").select("id, name, type").eq("company_id", selectedCompany.id),
        supabase.from("financial_transactions").select("city").eq("company_id", selectedCompany.id),
        supabase
          .from("financial_transactions")
          .select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompany.id)
          .ilike("notes", "%Mensagem do contato:%"),
        supabase
          .from("financial_transactions")
          .select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompany.id)
          .ilike("notes", "%Mensagem do contato:%")
          .or("category_id.is.null,city.is.null"),
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (cityRes.data) {
        const cities = [...new Set(cityRes.data.map((r: any) => r.city).filter(Boolean))] as string[];
        setAvailableCities(cities);
      }
      setWhatsappCount(waTotalRes.count ?? 0);
      setTriageCount(waTriageRes.count ?? 0);
    };
    fetchMeta();
  }, [selectedCompany?.id]);

  if (!selectedCompany) return null;

  const hasFullAccess = userModules.includes("financial");
  const hasPagarOnly = !hasFullAccess && userModules.includes("financial_pagar");
  const hasReceberOnly = !hasFullAccess && !hasPagarOnly && userModules.includes("financial_receber");

  if (hasPagarOnly) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Contas a Pagar</h1>
        <FinancialFilters
          companyId={selectedCompany.id}
          filters={filters}
          onChange={setFilters}
          categories={categories.filter((c) => c.type === "despesa")}
          availableCities={availableCities}
        />
        <TransactionsList companyId={selectedCompany.id} type="despesa" filters={filters} />
      </div>
    );
  }

  if (hasReceberOnly) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Contas a Receber</h1>
        <FinancialFilters
          companyId={selectedCompany.id}
          filters={filters}
          onChange={setFilters}
          categories={categories.filter((c) => c.type === "receita")}
          availableCities={availableCities}
        />
        <TransactionsList companyId={selectedCompany.id} type="receita" filters={filters} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-border bg-muted/30"
            title="Total de transações importadas via WhatsApp para esta empresa"
          >
            📲 WhatsApp: <strong>{whatsappCount}</strong>
            {triageCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning-foreground border border-warning/30">
                {triageCount} p/ triar
              </span>
            )}
          </span>
          <a
            href="/financeiro/classificar"
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-border hover:bg-accent/10 transition-colors"
          >
            🗂️ Triagem de classificação
          </a>
          <a
            href="/financeiro/triagem"
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-border hover:bg-accent/10 transition-colors"
          >
            📥 Triagem em lote
          </a>
          <a
            href="/financeiro/importar-comprovantes"
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-border hover:bg-accent/10 transition-colors"
            title="Admin: importar PDFs/ZIP de comprovantes"
          >
            📦 Importar comprovantes
          </a>
        </div>
      </div>

      <FinancialFilters
        companyId={selectedCompany.id}
        filters={filters}
        onChange={setFilters}
        categories={categories}
        availableCities={availableCities}
      />

      <FinancialIngestionStats companyId={selectedCompany.id} value={origin} onChange={setOrigin} />

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="pagar">Contas a Pagar</TabsTrigger>
            <TabsTrigger value="receber">Contas a Receber</TabsTrigger>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <FinancialOverview companyId={selectedCompany.id} filters={filters} />
        </TabsContent>

        <TabsContent value="pagar">
          <TransactionsList companyId={selectedCompany.id} type="despesa" filters={filters} origin={origin} />
        </TabsContent>

        <TabsContent value="receber">
          <TransactionsList companyId={selectedCompany.id} type="receita" filters={filters} origin={origin} />
        </TabsContent>

        <TabsContent value="categorias">
          <CategoriesManager companyId={selectedCompany.id} />
        </TabsContent>

        <TabsContent value="relatorios">
          <FinancialReports companyId={selectedCompany.id} filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
