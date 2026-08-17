import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth as useClerkAuth, useSession } from "@clerk/clerk-react";
import { api } from "@/integrations/api/client";

interface Company {
  id: string;
  name: string;
  trade_name: string | null;
  cnpj: string;
  modules: string[];
}

interface CompanyContextType {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: string) => void;
  userModules: string[];
  isMaster: boolean;
  loading: boolean;
  isAcudir: boolean;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useClerkAuth();
  const { session } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn || !session) {
      setCompanies([]);
      setSelectedCompanyId(null);
      setIsMaster(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async (attempt: number) => {
      setLoading(true);
      try {
        const data = await api.get<{ companies: Company[]; isMaster: boolean }>("/me");
        if (cancelled) return;
        const sorted = [...data.companies].sort((a, b) => {
          const aEscritorio = a.cnpj === "00.000.000/0001-00" ? 1 : 0;
          const bEscritorio = b.cnpj === "00.000.000/0001-00" ? 1 : 0;
          if (aEscritorio !== bEscritorio) return aEscritorio - bEscritorio;
          return (a.name || "").localeCompare(b.name || "");
        });
        setCompanies(sorted);
        setIsMaster(data.isMaster);
        if (sorted.length > 0) {
          setSelectedCompanyId((prev) => (prev && sorted.some((c) => c.id === prev) ? prev : sorted[0].id));
        }
        setLoading(false);
      } catch (err) {
        // A sessão Clerk pode ainda não ter token no primeiro instante pós-login:
        // retenta até 3x antes de desistir.
        if (!cancelled && attempt < 3) {
          timer = setTimeout(() => load(attempt + 1), 700);
          return;
        }
        if (!cancelled) {
          console.error("[useCompany] falha ao carregar /me:", err);
          setCompanies([]);
          setLoading(false);
        }
      }
    };
    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isSignedIn, session?.id]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;
  const userModules = selectedCompany?.modules || [];

  return (
    <CompanyContext.Provider
      value={{ companies, selectedCompany, setSelectedCompanyId, userModules, isMaster, loading, isAcudir: false }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}