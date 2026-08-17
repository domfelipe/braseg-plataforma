import {
  LayoutDashboard,
  DollarSign,
  Stethoscope,
  FileText,
  MessageSquare,
  Calendar,
  CalendarClock,
  Clock,
  Lock,
  Building2,
  ChevronDown,
  Plug,
  Car,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCompanyLogo } from "@/lib/companyLogos";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const WHATSAPP_CNPJS = ["30.636.545/0001-50", "57.016.034/0001-91"]; // Acudir, VGAF (link externo)
const FLEET_CNPJS = ["30.636.545/0001-50", "41.603.450/0001-56", "47.769.234/0001-61", "11.434.059/0001-04", "00.000.000/0001-00"]; // Acudir, Forte, Roversi, SMG, Escritório
const ESCRITORIO_CNPJ = "00.000.000/0001-00";
const CHATWOOT_EXTERNAL_URL = "http://129.146.74.98:3000/";

const allModules = [
  { key: "dashboard", title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, phase: 1 },
  { key: "financial", title: "Financeiro", url: "/financeiro", icon: DollarSign, phase: 1 },
  { key: "payments", title: "Pagamento de Profissionais", url: "/pagamentos", icon: Stethoscope, phase: 1, acudirOnly: true },
  { key: "documents", title: "Documentos", url: "/documentos", icon: FileText, phase: 1 },
  { key: "whatsapp", title: "WhatsApp", url: "/whatsapp", icon: MessageSquare, phase: 1, whatsappOnly: true, externalOnly: true },
  { key: "events", title: "Agenda de Eventos", url: "/eventos", icon: Calendar, phase: 1, vgafOnly: true },
  { key: "timesheet", title: "Relógio de Ponto", url: "/ponto", icon: Clock, phase: 1, acudirOnly: true },
  { key: "fleet", title: "Frotas", url: "/frotas", icon: Car, phase: 1, fleetOnly: true },
  { key: "schedules", title: "Escalas", url: "/escalas", icon: CalendarClock, phase: 1, acudirOnly: true },
  { key: "integracao", title: "Integrações", url: "/integracao", icon: Plug, phase: 1, superAdminOnly: true },
];

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const { companies, selectedCompany, setSelectedCompanyId, userModules, isAcudir } = useCompany();
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes('super-admin');
  const isEscritorio = selectedCompany?.cnpj === ESCRITORIO_CNPJ;
  const selectedLogo = getCompanyLogo(selectedCompany?.cnpj, selectedCompany?.name, selectedCompany?.trade_name);
  const isVgaf = selectedCompany?.cnpj === "57.016.034/0001-91";

  const visibleModules = allModules.filter((m: any) => {
    if (m.acudirOnly && !isAcudir) return false;
    if (m.vgafOnly && selectedCompany?.cnpj !== "57.016.034/0001-91") return false;
    if (m.whatsappOnly && selectedCompany?.cnpj && !WHATSAPP_CNPJS.includes(selectedCompany.cnpj)) return false;
    if (m.fleetOnly && selectedCompany?.cnpj && !FLEET_CNPJS.includes(selectedCompany.cnpj)) return false;
    if (m.superAdminOnly && !isSuperAdmin) return false;
    return true;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border pb-4">
        <div className="flex items-center gap-3 px-2 py-2">
          {selectedLogo ? (
            <img src={selectedLogo} alt="Logo" className="h-9 w-9 rounded-xl object-contain shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-xl gradient-accent flex items-center justify-center shrink-0 shadow-lg shadow-sidebar-primary/30">
              <Building2 className="h-5 w-5 text-white" />
            </div>
          )}
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-primary-foreground tracking-tight">Grupo Forte</span>
              <span className="text-[11px] text-sidebar-foreground/60">Serviços</span>
            </div>
          )}
        </div>

        {!collapsed && companies.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full mt-2 flex items-center justify-between rounded-lg bg-sidebar-accent px-3 py-2.5 text-xs font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent/80 transition-colors">
              <span className="truncate">{selectedCompany?.trade_name || selectedCompany?.name}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 ml-1 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {companies.map((company) => {
                const logo = getCompanyLogo(company.cnpj, company.name, company.trade_name);
                return (
                  <DropdownMenuItem
                    key={company.id}
                    onClick={() => setSelectedCompanyId(company.id)}
                    className={company.id === selectedCompany?.id ? "bg-accent" : ""}
                  >
                    <div className="flex items-center gap-2.5">
                      {logo ? (
                        <img src={logo} alt="" className="h-6 w-6 rounded object-contain shrink-0" />
                      ) : (
                        <Building2 className="h-4 w-4 shrink-0 opacity-60" />
                      )}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{company.trade_name || company.name}</span>
                        <span className="text-xs text-muted-foreground">{company.cnpj}</span>
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 mb-1">Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {visibleModules.map((item: any) => {
                const isFuture = item.phase > 1;
                const hasAccess = item.key === "whatsapp" || userModules.includes(item.key) || item.superAdminOnly || (item.key === "financial" && (userModules.includes("financial_pagar") || userModules.includes("financial_receber")));

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild={!isFuture && hasAccess}
                      tooltip={item.title}
                      className={isFuture || !hasAccess ? "opacity-40 cursor-not-allowed" : ""}
                    >
                      {isFuture || !hasAccess ? (
                        <div className="flex items-center gap-3 w-full py-1">
                          <item.icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate text-[13px]">{item.title}</span>
                              {isFuture && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-sidebar-border text-sidebar-foreground/50 font-normal">
                                  Em breve
                                </Badge>
                              )}
                              {!hasAccess && !isFuture && <Lock className="h-3 w-3 shrink-0 opacity-60" />}
                            </>
                          )}
                        </div>
                      ) : item.key === "whatsapp" ? (
                        <a
                          href={CHATWOOT_EXTERNAL_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 py-1"
                          onClick={() => { if (isMobile) setOpenMobile(false); }}
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && <span className="truncate text-[13px]">{item.title}</span>}
                        </a>
                      ) : (
                        <NavLink
                          to={item.url}
                          className="flex items-center gap-3 py-1"
                          activeClassName="bg-gradient-to-r from-sidebar-primary/25 to-sidebar-primary/10 text-sidebar-primary-foreground font-semibold border-l-2 border-sidebar-primary"
                          onClick={() => { if (isMobile) setOpenMobile(false); }}
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && <span className="truncate text-[13px]">{item.title}</span>}
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && (
          <div className="py-3 px-2">
            <div className="rounded-lg bg-gradient-to-r from-sidebar-primary/10 to-transparent p-3">
              <p className="text-[10px] text-sidebar-foreground/50 text-center">
                © 2026 Grupo Forte Serviços
              </p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}