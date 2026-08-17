import { Building2, ChevronDown, ExternalLink, LogOut, Settings, User } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { MODULES } from "@/lib/moduleRegistry";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { companies, selectedCompany, setSelectedCompanyId, userModules, isMaster } = useCompany();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const visible = MODULES.filter((m) => isMaster || userModules.includes(m.key));
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border px-3 pb-4 pt-4">
        <div className="flex items-center gap-3 px-1 py-1">
          <div className="h-9 w-9 shrink-0 rounded-xl gradient-accent flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Building2 className="h-5 w-5 text-sidebar-primary-foreground" strokeWidth={1.75} />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-display text-sm font-bold tracking-tight text-sidebar-foreground">BRASEG</span>
              <span className="text-[11px] text-sidebar-foreground/55 leading-tight">Portal Unificado</span>
            </div>
          )}
        </div>

        {!collapsed && companies.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-3 flex w-full items-center justify-between rounded-lg bg-sidebar-accent px-3 py-2 text-xs font-medium text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent/80 focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              <span className="truncate">{selectedCompany?.trade_name || selectedCompany?.name || "Braseg"}</span>
              <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {companies.map((company) => (
                <DropdownMenuItem
                  key={company.id}
                  onClick={() => setSelectedCompanyId(company.id)}
                  className={company.id === selectedCompany?.id ? "bg-accent" : ""}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{company.trade_name || company.name}</span>
                    <span className="text-xs text-muted-foreground">{company.cnpj}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="px-2 text-[11px] uppercase tracking-wider text-sidebar-foreground/40">Módulos</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visible.map((mod) => {
                const Icon = mod.icon;
                if (mod.external && mod.externalUrl) {
                  return (
                    <SidebarMenuItem key={mod.key}>
                      <a
                        href={mod.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        title={collapsed ? mod.label : undefined}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                        {!collapsed && <span className="truncate">{mod.label}</span>}
                        {!collapsed && (
                          <span className="ml-auto flex items-center gap-1.5">
                            <Badge className="bg-sidebar-accent text-[10px] px-1.5 py-0 h-4 font-medium text-sidebar-foreground/60 border-0">externo</Badge>
                            <ExternalLink className="h-3 w-3 opacity-50" />
                          </span>
                        )}
                      </a>
                    </SidebarMenuItem>
                  );
                }
                return (
                  <SidebarMenuItem key={mod.key}>
                    <NavLink
                      to={mod.route || "/"}
                      onClick={() => setOpenMobile(false)}
                      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-primary/15 text-sidebar-primary border-l-[3px] border-l-sidebar-primary pl-[9px] shadow-[inset_0_0_0_1px_hsl(var(--sidebar-primary)/0.25)]"
                      title={collapsed ? mod.label : undefined}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                      {!collapsed && <span className="truncate">{mod.label}</span>}
                      {!collapsed && mod.comingSoon && (
                        <Badge className="ml-auto bg-sidebar-accent text-[10px] px-1.5 py-0 h-4 font-medium text-amber-400/90 border-0">Em breve</Badge>
                      )}
                    </NavLink>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                collapsed && "justify-center px-0"
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-bold text-sidebar-primary">
                {initials}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sidebar-foreground">{profile?.full_name || "Usuário"}</p>
                  <p className="truncate text-[11px] text-sidebar-foreground/50">{isMaster ? "Master · DOMHubs" : "Braseg"}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-52">
            <DropdownMenuItem onClick={() => navigate("/perfil")}>
              <User className="mr-2 h-4 w-4" /> Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
              <Settings className="mr-2 h-4 w-4" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}