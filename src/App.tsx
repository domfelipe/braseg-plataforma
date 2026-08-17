import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider, useCompany } from "@/hooks/useCompany";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { firstAccessibleRoute } from "@/lib/moduleRegistry";

// Lazy-loaded pages for code splitting
const Login = lazy(() => import("./pages/Login"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Frotas = lazy(() => import("./pages/Frotas"));
const NovaInspecao = lazy(() => import("./pages/NovaInspecao"));
const InspecaoDetalhe = lazy(() => import("./pages/InspecaoDetalhe"));
const Seguranca = lazy(() => import("./pages/Seguranca"));
const EmpresasNova = lazy(() => import("./pages/seguranca/EmpresasNova"));
const ClientePainel = lazy(() => import("./pages/seguranca/ClientePainel"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-64 w-full max-w-2xl rounded-xl" />
    </div>
  );
}

function SmartRedirect() {
  const { userModules, loading } = useCompany();
  if (loading) return <PageLoader />;
  return <Navigate to={firstAccessibleRoute(userModules)} replace />;
}

function ProtectedApp({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <CompanyProvider>
        <AppLayout>{children}</AppLayout>
      </CompanyProvider>
    </ProtectedRoute>
  );
}

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/login/*" element={<Login />} />
                <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                <Route path="/dashboard" element={<ProtectedApp><Dashboard /></ProtectedApp>} />
                <Route path="/frotas" element={<ProtectedApp><Frotas /></ProtectedApp>} />
                <Route path="/frotas/inspecoes/nova" element={<ProtectedApp><NovaInspecao /></ProtectedApp>} />
                <Route path="/frotas/inspecoes/:id" element={<ProtectedApp><InspecaoDetalhe /></ProtectedApp>} />
                <Route path="/seguranca" element={<ProtectedApp><Seguranca /></ProtectedApp>} />
                <Route path="/seguranca/empresas/nova" element={<ProtectedApp><EmpresasNova /></ProtectedApp>} />
                <Route path="/seguranca/empresas/:id" element={<ProtectedApp><ClientePainel /></ProtectedApp>} />
                <Route path="/perfil" element={<ProtectedApp><Perfil /></ProtectedApp>} />
                <Route path="/perfil/*" element={<ProtectedApp><Perfil /></ProtectedApp>} />
                <Route path="/configuracoes" element={<ProtectedApp><Configuracoes /></ProtectedApp>} />
                <Route path="/" element={<ProtectedApp><SmartRedirect /></ProtectedApp>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;