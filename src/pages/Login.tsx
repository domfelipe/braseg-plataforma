import { SignIn } from "@clerk/clerk-react";
import { Truck, MessageSquare, ShieldCheck } from "lucide-react";
import brasegLogo from "/logos/braseg-branco.png";

export default function Login() {
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
        <div className="pointer-events-none absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-10 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <img src={brasegLogo} alt="Braseg" className="h-14 w-auto object-contain" />
          <p className="mt-2 text-xs text-white/50">Portal Unificado</p>
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
                  <Icon className="h-4 w-4 text-blue-300" strokeWidth={1.75} />
                </div>
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/30">© {new Date().getFullYear()} Braseg · powered by DOMHubs</p>
      </div>

      {/* Formulário Clerk */}
      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-accent">
              <ShieldCheck className="h-5 w-5 text-[#17233F]" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-display text-base font-bold tracking-tight">BRASEG</p>
              <p className="text-xs text-muted-foreground">Portal Unificado</p>
            </div>
          </div>
          <SignIn routing="path" path="/login" />
        </div>
      </div>
    </div>
  );
}