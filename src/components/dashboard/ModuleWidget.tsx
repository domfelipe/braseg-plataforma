import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Stat {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "destructive" | "warning";
}

interface Props {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  gradient: string;
  stats: Stat[];
  badge?: { label: string; tone?: "default" | "success" | "destructive" | "warning" };
  navigateTo?: string;
  delay?: number;
  children?: ReactNode;
}

const toneClass: Record<string, string> = {
  default: "text-foreground",
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning-foreground",
};

const badgeTone: Record<string, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success border-success/20",
  destructive: "bg-destructive/15 text-destructive border-destructive/20",
  warning: "bg-warning/15 text-warning-foreground border-warning/20",
};

export function ModuleWidget({ title, subtitle, icon: Icon, gradient, stats, badge, navigateTo, delay = 0, children }: Props) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
    >
      <Card
        className={`relative overflow-hidden border-0 shadow-lg h-full transition-all duration-300 ${navigateTo ? "cursor-pointer hover:shadow-xl hover:-translate-y-0.5 group" : ""}`}
        onClick={navigateTo ? () => navigate(navigateTo) : undefined}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-10 w-10 rounded-xl ${gradient} flex items-center justify-center shadow-md shrink-0`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{title}</p>
                {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {badge && (
                <Badge variant="outline" className={`text-[10px] py-0 h-5 ${badgeTone[badge.tone || "default"]}`}>
                  {badge.label}
                </Badge>
              )}
              {navigateTo && <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {stats.map((s, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
                <p className={`text-lg font-bold tabular-nums ${toneClass[s.tone || "default"]}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {children && <div className="mt-3">{children}</div>}
        </CardContent>
      </Card>
    </motion.div>
  );
}
