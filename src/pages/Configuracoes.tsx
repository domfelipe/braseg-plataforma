import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Moon, Sun, ExternalLink } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { MODULES } from "@/lib/moduleRegistry";

export default function Configuracoes() {
  const { theme, toggleTheme } = useTheme();
  const dhchat = MODULES.find((m) => m.key === "dhchat");
  const dhchatUrl = dhchat?.externalUrl || "https://dhchat.domhubs.com.br";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">Preferências do portal.</p>
      </div>

      <Card className="rounded-[10px]">
        <CardHeader>
          <CardTitle className="font-display text-base font-bold">Aparência</CardTitle>
          <CardDescription>Escolha entre tema claro e escuro.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/[0.07]">
                {theme === "light" ? <Sun className="h-5 w-5 text-accent" /> : <Moon className="h-5 w-5 text-accent" />}
              </div>
              <div>
                <p className="text-sm font-medium">Tema {theme === "light" ? "claro" : "escuro"}</p>
                <p className="text-xs text-muted-foreground">Alternar agora para o outro tema.</p>
              </div>
            </div>
            <Button variant="outline" onClick={toggleTheme}>
              {theme === "light" ? "Usar tema escuro" : "Usar tema claro"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[10px]">
        <CardHeader>
          <CardTitle className="font-display text-base font-bold">DHChat</CardTitle>
          <CardDescription>O chat da Braseg abre em uma nova aba a partir da sidebar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <p className="break-all text-sm text-muted-foreground">{dhchatUrl}</p>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <a href={dhchatUrl} target="_blank" rel="noopener noreferrer">
                Abrir <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
