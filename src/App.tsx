import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { useCompany } from "@/hooks/useCompany";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-loaded pages for code splitting
const Login = lazy(() => import("./pages/Login"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Pagamentos = lazy(() => import("./pages/Pagamentos"));
const Ponto = lazy(() => import("./pages/Ponto"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Documentos = lazy(() => import("./pages/Documentos"));
const Frotas = lazy(() => import("./pages/Frotas"));
const Eventos = lazy(() => import("./pages/Eventos"));
const Escalas = lazy(() => import("./pages/Escalas"));
const BatchRegister = lazy(() => import("./pages/BatchRegister"));
const PontoUBS = lazy(() => import("./pages/PontoUBS"));
const LoginProfissional = lazy(() => import("./pages/LoginProfissional"));
const PontoProfissional = lazy(() => import("./pages/PontoProfissional"));
const Compartilhar = lazy(() => import("./pages/Compartilhar"));
const Integracao = lazy(() => import("./pages/Integracao"));
const TriagemComprovantes = lazy(() => import("./pages/TriagemComprovantes"));
const TriagemClassificacao = lazy(() => import("./pages/TriagemClassificacao"));
const EnviarNotaFiscal = lazy(() => import("./pages/EnviarNotaFiscal"));
const ImportarComprovantes = lazy(() => import("./pages/ImportarComprovantes"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-64 w-full max-w-2xl rounded-xl" />
    </div>
  );
}

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

function SmartRedirect() {
  const { userModules } = useCompany();
  for (const mod of userModules) {
    const path = moduleRoutePaths[mod];
    if (path) return <Navigate to={path} replace />;
  }
  return <Navigate to="/perfil" replace />;
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
                <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                <Route path="/dashboard" element={<ProtectedApp><Dashboard /></ProtectedApp>} />
                <Route path="/financeiro" element={<ProtectedApp><Financeiro /></ProtectedApp>} />
                <Route path="/financeiro/triagem" element={<ProtectedApp><TriagemComprovantes /></ProtectedApp>} />
                <Route path="/financeiro/classificar" element={<ProtectedApp><TriagemClassificacao /></ProtectedApp>} />
                <Route path="/financeiro/importar-comprovantes" element={<ProtectedApp><ImportarComprovantes /></ProtectedApp>} />
                <Route path="/pagamentos" element={<ProtectedApp><Pagamentos /></ProtectedApp>} />
                <Route path="/ponto" element={<ProtectedApp><Ponto /></ProtectedApp>} />
                <Route path="/documentos" element={<ProtectedApp><Documentos /></ProtectedApp>} />
                <Route path="/perfil" element={<ProtectedApp><Perfil /></ProtectedApp>} />
                <Route path="/configuracoes" element={<ProtectedApp><Configuracoes /></ProtectedApp>} />
                <Route path="/frotas" element={<ProtectedApp><Frotas /></ProtectedApp>} />
                <Route path="/eventos" element={<ProtectedApp><Eventos /></ProtectedApp>} />
                <Route path="/escalas" element={<ProtectedApp><Escalas /></ProtectedApp>} />
                <Route path="/batch-register" element={<ProtectedApp><BatchRegister /></ProtectedApp>} />
                <Route path="/ponto-ubs" element={<PontoUBS />} />
                <Route path="/login-profissional" element={<LoginProfissional />} />
                <Route path="/enviar-nf/:companyId" element={<EnviarNotaFiscal />} />
                <Route path="/ponto-profissional" element={<ProtectedApp><PontoProfissional /></ProtectedApp>} />
                <Route path="/compartilhar" element={<ProtectedApp><Compartilhar /></ProtectedApp>} />
                <Route path="/integracao" element={<ProtectedApp><Integracao /></ProtectedApp>} />
                <Route path="/integracoes" element={<Navigate to="/integracao" replace />} />
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
