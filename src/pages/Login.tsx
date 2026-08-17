import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import forteLogo from "@/assets/forte-login-logo.png";

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
      redirectTo: `${window.location.origin}/redefinir-senha`,
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-accent to-primary" />
      <div className="absolute top-1/4 -left-20 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-float" />
      <div className="absolute bottom-1/4 -right-20 h-96 w-96 rounded-full bg-white/5 blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-white/5 blur-3xl" />
      <div className="absolute top-10 right-1/4 h-32 w-32 rounded-full bg-white/10 blur-2xl animate-float" style={{ animationDelay: '4s' }} />

      <Card className="w-full max-w-md glass border-0 shadow-2xl relative z-10 animate-fade-in-up">
        <CardHeader className="text-center space-y-4 pb-2 pt-8">
          <img src={forteLogo} alt="Forte Serviços" className="mx-auto h-16 object-contain" />
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Plataforma de Gestão Integrada" : "Recuperação de senha"}
          </p>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          {mode === "login" ? (
            <form onSubmit={handleSubmit} className="space-y-5">
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
                  className="h-11 bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary"
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
                    className="h-11 bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setMode("recovery")}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 gradient-accent hover:opacity-90 text-white font-semibold shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Entrar
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRecovery} className="space-y-5">
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
                  className="h-11 bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 gradient-accent hover:opacity-90 text-white font-semibold shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Enviar link de recuperação
              </Button>

              <button
                type="button"
                onClick={() => setMode("login")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
              >
                <ArrowLeft className="h-3 w-3" />
                Voltar ao login
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
