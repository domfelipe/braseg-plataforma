import { ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { firstAccessibleRoute, moduleForRoute } from "@/lib/moduleRegistry";

export function AppLayout({ children }: { children: ReactNode }) {
  const { userModules, loading: companyLoading } = useCompany();
  const { isMaster } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (companyLoading) return; // aguarda /api/me antes de decidir
    if (isMaster) return; // masters têm acesso total

    const currentPath = location.pathname;
    const module = moduleForRoute(currentPath);

    // Rotas fora do registry (perfil, configuracoes, 404) não têm guard de módulo
    if (!module) return;

    if (!userModules.includes(module.key)) {
      navigate(firstAccessibleRoute(userModules), { replace: true });
    }
  }, [location.pathname, userModules, isMaster, companyLoading, navigate]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="relative flex-1 overflow-auto bg-background p-4 sm:p-6 lg:p-8">
            <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-primary/[0.04] blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-accent/[0.04] blur-3xl" />
            <div className="relative z-10">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}