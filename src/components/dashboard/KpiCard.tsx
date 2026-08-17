import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useSpring } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number;
  prefix?: string;
  icon: LucideIcon;
  tone?: "default" | "brand" | "navy";
  loading?: boolean;
}

export function KpiCard({ label, value, prefix = "", icon: Icon, tone = "default", loading }: KpiCardProps) {
  const spring = useSpring(0, { stiffness: 90, damping: 20 });
  const [display, setDisplay] = useState("0");
  const prevValue = useRef(0);

  useMotionValueEvent(spring, "change", (v) => {
    setDisplay(Math.round(v).toLocaleString("pt-BR"));
  });

  useEffect(() => {
    prevValue.current = value;
    spring.set(value);
  }, [value, spring]);

  return (
    <Card className="relative overflow-hidden rounded-[10px] p-5">
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl",
          tone === "brand" && "bg-primary/15",
          tone === "navy" && "bg-accent/15",
          tone === "default" && "bg-muted"
        )}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-20 animate-pulse rounded-md bg-muted" />
          ) : (
            <p className="font-display mt-2 text-3xl font-bold tracking-tight tabular-nums">
              {prefix}
              {display}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/[0.07]">
          <Icon className="h-5 w-5 text-accent" strokeWidth={1.75} />
        </div>
      </div>
    </Card>
  );
}