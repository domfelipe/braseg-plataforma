import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, ArrowLeft, ShieldCheck, Truck, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "recovery">("login");
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({
        title: "Erro ao entrar",
        description: "E-mail ou senha incorretos.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    navigate("/dashboard");
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/redefinir-senha",
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível enviar o e-mail de recuperação.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "E-mail enviado",
      description: "Verifique sua caixa de entrada para redefinir sua senha.",
    });
    setMode("login");
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Painel navy */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#17233F] p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "linear-gradient(hsl(222 40% 30% / 0.35) 1px, transparent 1px), linear-gradient(90deg, hsl(222 40% 30% / 0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="pointer-events-none absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-10 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-accent shadow-lg shadow-amber-500/20">
            <ShieldCheck className="h-6 w-6 text-[#17233F]" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-display text-lg font-bold tracking-tight">BRASEG</p>
            <p className="text-xs text-white/50">Portal Unificado</p>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight">
            Operação, frota e segurança em um só lugar.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Um único login para o dia a dia da Braseg: atendimento no DHChat, gestão
            completa de veículos com inspeções e a evolução da coleta de dados de
            segurança em campo.
          </p>
          <div className="mt-8 space-y-3">
            {[
              { icon: MessageSquare, label: "DHChat — atendimento e conversas" },
              { icon: Truck, label: "Frotas — veículos, manutenções e inspeções" },
              { icon: ShieldCheck, label: "Segurança — coleta de dados em campo" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-white/70">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
                </div>
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/30">© {new Date().getFullYear()} Braseg · powered by DOMCO</p>
      </div>

      {/* Formulário */}
      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm animate-fade-in-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-accent">
              <ShieldCheck className="h-5 w-5 text-[#17233F]" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-display text-base font-bold tracking-tight">BRASEG</p>
              <p className="text-xs text-muted-foreground">Portal Unificado</p>
            </div>
          </div>

          {mode === "recovery" ? (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar para o login
            </button>
          ) : null}

          <h2 className="font-display text-2xl font-bold tracking-tight">
            {mode === "login" ? "Bem-vindo de volta" : "Recuperar senha"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Acesse o portal da Braseg com suas credenciais."
              : "Enviaremos um link para redefinir sua senha."}
          </p>

          {mode === "login" ? (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setMode("recovery")}
                    className="text-xs font-medium text-accent hover:text-accent/80 hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </div>

              <Button type="submit" variant="accent" className="h-11 w-full font-semibold" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Entrar
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRecovery} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="recovery-email" className="text-xs font-medium">E-mail</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11"
                />
              </div>

              <Button type="submit" variant="accent" className="h-11 w-full font-semibold" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Enviar link de recuperação
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}