import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, MessageSquare, Truck, ShieldCheck } from "lucide-react";

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  route?: string;
  externalUrl?: string;
  external?: boolean;
  comingSoon?: boolean;
  order: number;
}

export const DHCHAT_DEFAULT_URL = "https://dhchat.domhubs.com.br";

export const MODULES: ModuleDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Visão geral da operação",
    icon: LayoutDashboard,
    route: "/dashboard",
    order: 1,
  },
  {
    key: "dhchat",
    label: "DHChat",
    description: "Atendimento e conversas da Braseg",
    icon: MessageSquare,
    externalUrl: import.meta.env.VITE_DHCHAT_URL || DHCHAT_DEFAULT_URL,
    external: true,
    order: 2,
  },
  {
    key: "fleet",
    label: "Frotas",
    description: "Veículos, manutenções e inspeções",
    icon: Truck,
    route: "/frotas",
    order: 3,
  },
  {
    key: "seguranca",
    label: "Segurança do Trabalho",
    description: "PGR/PGRTR e riscos ocupacionais em campo",
    icon: ShieldCheck,
    route: "/seguranca",
    order: 4,
  },
];

/** Módulo dono da rota atual (a rota mais específica vence). */
export function moduleForRoute(pathname: string): ModuleDef | undefined {
  const withRoute = MODULES.filter((m) => m.route);
  return [...withRoute]
    .sort((a, b) => (b.route?.length ?? 0) - (a.route?.length ?? 0))
    .find((m) => pathname.startsWith(m.route as string));
}

/** Primeira rota interna acessível dado o conjunto de módulos do usuário. */
export function firstAccessibleRoute(userModules: string[]): string {
  const sorted = [...MODULES].sort((a, b) => a.order - b.order);
  for (const m of sorted) {
    if (m.route && !m.external && userModules.includes(m.key)) return m.route;
  }
  return "/perfil";
}
