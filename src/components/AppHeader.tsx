import { LogOut, Moon, Settings, Sun, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { moduleForRoute } from "@/lib/moduleRegistry";
import { useLocation } from "react-router-dom";

export function AppHeader() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const activeModule = moduleForRoute(location.pathname);
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-3 backdrop-blur sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <SidebarTrigger />
        <div className="flex min-w-0 flex-col">
          <h2 className="font-display text-sm font-bold leading-tight tracking-tight truncate sm:text-base">
            {activeModule?.label || "Braseg Portal"}
          </h2>
          <span className="hidden truncate text-xs text-muted-foreground sm:block">
            {activeModule?.description || "Operação, frota e segurança"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
          className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-foreground"
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4 transition-transform duration-300 hover:rotate-12" />
          ) : (
            <Sun className="h-4 w-4 transition-transform duration-300 hover:rotate-45" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex h-9 items-center gap-2.5 rounded-xl px-2">
              <Avatar className="h-7 w-7 border border-border">
                <AvatarFallback className="bg-accent text-[10px] font-bold text-accent-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{profile?.full_name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
      </div>
    </header>
  );
}
