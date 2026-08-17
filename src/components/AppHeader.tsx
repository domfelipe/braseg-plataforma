import { LogOut, User, Settings, Search, Sun, Moon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useTheme } from "@/hooks/useTheme";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useState } from "react";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function AppHeader() {
  const { profile, signOut } = useAuth();
  const { selectedCompany } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const firstName = profile?.full_name?.split(" ")[0] || "";
  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <header className="h-14 sm:h-16 bg-gradient-to-r from-card via-card to-muted/30 border-b flex items-center justify-between px-3 sm:px-6 shrink-0 shadow-sm">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <SidebarTrigger />
        <div className="flex flex-col min-w-0">
          <h2 className="text-sm sm:text-base font-semibold leading-tight truncate">
            <span className="hidden sm:inline">{getGreeting()}, </span>{firstName}<span className="hidden sm:inline">! 👋</span>
          </h2>
          {selectedCompany && (
            <span className="text-xs text-muted-foreground truncate hidden sm:block">
              {selectedCompany.trade_name || selectedCompany.name}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        {/* Search */}
        <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors">
          <Search className="h-4 w-4" />
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all duration-300"
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4 transition-transform duration-300 rotate-0 hover:rotate-12" />
          ) : (
            <Sun className="h-4 w-4 transition-transform duration-300 rotate-0 hover:rotate-45" />
          )}
        </Button>

        {/* Notifications */}
        <NotificationDropdown />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2.5 h-9 px-2 rounded-xl">
              <div className="p-[2px] rounded-full bg-gradient-to-br from-primary to-accent">
                <Avatar className="h-7 w-7 border-2 border-card">
                  <AvatarFallback className="text-[10px] font-bold gradient-primary text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-sm font-medium hidden sm:inline">{profile?.full_name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/perfil")}>
              <User className="mr-2 h-4 w-4" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </header>
  );
}