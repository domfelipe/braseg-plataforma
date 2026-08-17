import { ReactNode, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";

const FLEET_CNPJS = ["30.636.545/0001-50", "41.603.450/0001-56", "47.769.234/0001-61", "11.434.059/0001-04", "00.000.000/0001-00"];

const routeModuleMap: Record<string, { module: string; altModules?: string[]; cnpjCheck?: (cnpj: string, isSuperAdmin: boolean) => boolean }> = {
  "/dashboard": { module: "dashboard" },
  "/financeiro": { module: "financial", altModules: ["financial_pagar", "financial_receber"] },
  "/pagamentos": { module: "payments", cnpjCheck: (cnpj) => cnpj === "30.636.545/0001-50" },
  "/eventos": { module: "events", cnpjCheck: (cnpj) => cnpj === "57.016.034/0001-91" },
  "/documentos": { module: "documents", cnpjCheck: (cnpj) => FLEET_CNPJS.includes(cnpj) },
  "/frotas": { module: "fleet", cnpjCheck: (cnpj) => FLEET_CNPJS.includes(cnpj) },
  "/ponto": { module: "timesheet", cnpjCheck: (cnpj) => cnpj === "30.636.545/0001-50" },
  "/escalas": { module: "schedules", cnpjCheck: (cnpj) => cnpj === "30.636.545/0001-50" },
};

// Map module keys to their route paths
const moduleRoutePaths: Record<string, string> = {
  dashboard: "/dashboard",
  financial: "/financeiro",
  financial_pagar: "/financeiro",
  financial_receber: "/financeiro",
  payments: "/pagamentos",
  documents: "/documentos",
  events: "/eventos",
  timesheet: "/ponto",
  fleet: "/frotas",
  schedules: "/escalas",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const { selectedCompany, userModules } = useCompany();
  const { roles, isMaster } = useAuth();
  const isSuperAdmin = roles.includes("super-admin");
  const location = useLocation();
  const navigate = useNavigate();
  const prevCompanyId = useRef(selectedCompany?.id);

  // Find the first accessible route for this user
  const getFirstAccessibleRoute = () => {
    for (const mod of userModules) {
      const path = moduleRoutePaths[mod];
      if (path) return path;
    }
    return "/perfil"; // fallback if no modules
  };

  useEffect(() => {
    if (!selectedCompany?.cnpj) return;
    if (isMaster) return; // masters have full access

    const currentPath = location.pathname;
    const routeInfo = routeModuleMap[currentPath];

    // Skip guard for non-module routes (perfil, configuracoes)
    if (!routeInfo) return;

    const hasModuleAccess = userModules.includes(routeInfo.module) || (routeInfo.altModules && routeInfo.altModules.some(m => userModules.includes(m)));
    const cnpjAllowed = routeInfo.cnpjCheck ? routeInfo.cnpjCheck(selectedCompany.cnpj, isSuperAdmin) : true;

    if (!hasModuleAccess || !cnpjAllowed) {
      navigate(getFirstAccessibleRoute(), { replace: true });
    }
  }, [selectedCompany?.id, selectedCompany?.cnpj, isSuperAdmin, isMaster, location.pathname, navigate, userModules]);

  // Also handle company change redirect
  useEffect(() => {
    if (!selectedCompany?.cnpj) return;
    if (prevCompanyId.current === selectedCompany.id) return;
    prevCompanyId.current = selectedCompany.id;

    if (isMaster) return;

    const currentPath = location.pathname;
    const routeInfo = routeModuleMap[currentPath];
    if (!routeInfo) return;

    const hasModuleAccess = userModules.includes(routeInfo.module) || (routeInfo.altModules && routeInfo.altModules.some(m => userModules.includes(m)));
    const cnpjAllowed = routeInfo.cnpjCheck ? routeInfo.cnpjCheck(selectedCompany.cnpj, isSuperAdmin) : true;

    if (!hasModuleAccess || !cnpjAllowed) {
      navigate(getFirstAccessibleRoute(), { replace: true });
    }
  }, [selectedCompany?.id]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-background relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.03] rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-accent/[0.03] rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}