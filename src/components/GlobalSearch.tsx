import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  DollarSign,
  FileText,
  Users,
  Clock,
  Settings,
  User,
  Plus,
  CreditCard,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGES = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Financeiro", icon: DollarSign, path: "/financeiro" },
  { label: "Pagamentos", icon: CreditCard, path: "/pagamentos" },
  { label: "Documentos", icon: FileText, path: "/documentos" },
  { label: "Ponto", icon: Clock, path: "/ponto" },
  { label: "Configurações", icon: Settings, path: "/configuracoes" },
  { label: "Perfil", icon: User, path: "/perfil" },
];

const ACTIONS = [
  { label: "Novo Funcionário", icon: Plus, path: "/documentos" },
  { label: "Nova Transação", icon: Plus, path: "/financeiro" },
];

export function GlobalSearch({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2 || !selectedCompany?.id) {
      setEmployees([]);
      setTransactions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const [empRes, txRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, cpf, position, company_id")
          .eq("company_id", selectedCompany.id)
          .or(`full_name.ilike.%${query}%,cpf.ilike.%${query}%`)
          .limit(5),
        supabase
          .from("financial_transactions")
          .select("id, description, amount, type, company_id")
          .eq("company_id", selectedCompany.id)
          .ilike("description", `%${query}%`)
          .limit(5),
      ]);
      setEmployees(empRes.data || []);
      setTransactions(txRes.data || []);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedCompany?.id]);

  const select = useCallback(
    (path: string) => {
      onOpenChange(false);
      setQuery("");
      navigate(path);
    },
    [navigate, onOpenChange]
  );

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar páginas, funcionários, transações..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Páginas">
          {PAGES.map((p) => (
            <CommandItem key={p.path} onSelect={() => select(p.path)}>
              <p.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ações Rápidas">
          {ACTIONS.map((a) => (
            <CommandItem key={a.label} onSelect={() => select(a.path)}>
              <a.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {a.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {employees.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Funcionários">
              {employees.map((e) => (
                <CommandItem key={e.id} onSelect={() => select("/documentos")}>
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{e.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {e.position} {e.cpf ? `· ${e.cpf}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {transactions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Transações">
              {transactions.map((t) => (
                <CommandItem key={t.id} onSelect={() => select("/financeiro")}>
                  <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{t.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.type === "receita" ? "Receita" : "Despesa"} · {formatCurrency(t.amount)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
