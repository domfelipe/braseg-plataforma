import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface Company {
  id: string;
  name: string;
  trade_name: string | null;
  cnpj: string;
  main_activity: string | null;
  address_city: string | null;
  address_state: string | null;
  email: string | null;
  phone: string | null;
}

interface CompanyAccess {
  company_id: string;
  modules: string[];
}

interface CompanyContextType {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: string) => void;
  userModules: string[];
  loading: boolean;
  isAcudir: boolean;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isMaster } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyAccess, setCompanyAccess] = useState<CompanyAccess[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setCompanyAccess([]);
      setSelectedCompanyId(null);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      // Fetch companies (RLS handles filtering)
      const { data: companiesData } = await supabase
        .from("companies")
        .select("id, name, trade_name, cnpj, main_activity, address_city, address_state, email, phone")
        .order("name");

      if (companiesData) {
        // Sort: push Escritório (placeholder CNPJ) to the end
        const sorted = [...companiesData].sort((a, b) => {
          const aIsEscritorio = a.cnpj === "00.000.000/0001-00" ? 1 : 0;
          const bIsEscritorio = b.cnpj === "00.000.000/0001-00" ? 1 : 0;
          if (aIsEscritorio !== bIsEscritorio) return aIsEscritorio - bIsEscritorio;
          return (a.name || "").localeCompare(b.name || "");
        });
        setCompanies(sorted as Company[]);
        if (!selectedCompanyId && sorted.length > 0) {
          setSelectedCompanyId(sorted[0].id);
        }
      }

      // Fetch user company access for modules
      if (!isMaster) {
        const { data: accessData } = await supabase
          .from("user_company_access")
          .select("company_id, modules")
          .eq("user_id", user.id);

        if (accessData) {
          setCompanyAccess(accessData as CompanyAccess[]);
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [user, isMaster]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  const userModules = isMaster
    ? ["dashboard", "financial", "payments", "documents", "whatsapp", "events", "timesheet", "fleet", "schedules"]
    : companyAccess.find((a) => a.company_id === selectedCompanyId)?.modules || [];

  const isAcudir = selectedCompany?.cnpj === "30.636.545/0001-50";

  return (
    <CompanyContext.Provider
      value={{ companies, selectedCompany, setSelectedCompanyId, userModules, loading, isAcudir }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error("useCompany must be used within CompanyProvider");
  return context;
}
