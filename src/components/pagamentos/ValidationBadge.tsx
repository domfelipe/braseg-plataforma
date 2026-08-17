import { useState } from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  status: string | null | undefined;
  issues: string[] | null | undefined;
  warnings?: string[] | null;
  validationData?: any;
  compact?: boolean;
}

/**
 * Coleta warnings nesta ordem de prioridade:
 *   1. prop warnings
 *   2. validationData.validation_warnings
 *   3. validationData.validacao.alertas
 * Deduplica por mensagem normalizada (trim + lowercase).
 */
export function collectWarnings(
  warnings?: string[] | null,
  validationData?: any,
): string[] {
  const sources: any[] = [
    warnings,
    validationData?.validation_warnings,
    validationData?.validacao?.alertas,
  ];
  const merged: string[] = [];
  for (const src of sources) {
    if (Array.isArray(src)) {
      for (const item of src) {
        if (typeof item === "string" && item.trim()) merged.push(item.trim());
      }
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const msg of merged) {
    const key = msg.toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(msg);
    }
  }
  return out;
}

export default function ValidationBadge({
  status,
  issues,
  warnings,
  validationData,
  compact = false,
}: Props) {
  if (!status) return null;

  const isValid = status === "valida";
  const issueList = Array.isArray(issues) ? issues.filter((i) => typeof i === "string" && i.trim()) : [];
  const warningList = collectWarnings(warnings, validationData);
  const hasWarnings = isValid && warningList.length > 0;

  // valida sem avisos -> verde fechado
  // valida com avisos -> amarelo, avisos abertos
  // invalida -> vermelho, issues abertos
  const [open, setOpen] = useState(!isValid || hasWarnings);

  const tone = !isValid
    ? {
        compactClass: "bg-destructive/15 text-destructive border-destructive/30",
        boxClass: "bg-destructive/10 border-destructive/30 text-destructive",
        Icon: ShieldAlert,
        compactLabel: `${issueList.length} pendência${issueList.length === 1 ? "" : "s"}`,
        title: `NF inválida — ${issueList.length} pendência${issueList.length === 1 ? "" : "s"} crítica${issueList.length === 1 ? "" : "s"}`,
        list: issueList,
      }
    : hasWarnings
      ? {
          compactClass:
            "bg-warning/20 text-warning-foreground border-warning/40 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/40",
          boxClass:
            "bg-warning/10 border-warning/40 text-warning-foreground dark:bg-amber-500/10 dark:border-amber-500/40 dark:text-amber-400",
          Icon: AlertTriangle,
          compactLabel: `Válida c/ ${warningList.length} aviso${warningList.length === 1 ? "" : "s"}`,
          title: `Válida com ${warningList.length} aviso${warningList.length === 1 ? "" : "s"}`,
          list: warningList,
        }
      : {
          compactClass: "bg-success/15 text-success border-success/30",
          boxClass: "bg-success/10 border-success/30 text-success",
          Icon: ShieldCheck,
          compactLabel: "Validada",
          title: "NF validada pela IA",
          list: [] as string[],
        };

  const { Icon } = tone;

  if (compact) {
    return (
      <Badge
        variant="outline"
        className={`text-[10px] whitespace-nowrap ${tone.compactClass}`}
        title={tone.list.length ? tone.list.join(" • ") : tone.title}
      >
        <Icon className="h-3 w-3 mr-1" />
        {tone.compactLabel}
      </Badge>
    );
  }

  return (
    <div className={`rounded-md border p-2 text-xs space-y-1 ${tone.boxClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <Icon className="h-3.5 w-3.5" />
          {tone.title}
        </div>
        {tone.list.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 px-1 hover:bg-transparent/10"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        )}
      </div>
      {open && tone.list.length > 0 && (
        <ul className="list-disc pl-4 space-y-0.5 text-[11px] leading-snug">
          {tone.list.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
