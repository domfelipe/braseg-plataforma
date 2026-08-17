import { Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChecklistItemRowProps {
  index: number;
  description: string;
  required: boolean;
  ok: boolean | null;
  observation: string;
  onOkChange: (ok: boolean) => void;
  onObservationChange: (value: string) => void;
  observationError?: boolean;
}

export function ChecklistItemRow({
  index,
  description,
  required,
  ok,
  observation,
  onOkChange,
  onObservationChange,
  observationError,
}: ChecklistItemRowProps) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="font-display mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/[0.07] text-xs font-bold text-accent tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            {description}
            {required && <span className="ml-1 text-xs text-primary">*</span>}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onOkChange(true)}
              aria-pressed={ok === true}
              className={cn(
                "flex h-11 min-w-[72px] flex-1 items-center justify-center gap-1.5 rounded-[8px] border text-sm font-semibold transition-all sm:flex-none sm:px-5",
                ok === true
                  ? "border-success bg-success text-success-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:border-success hover:text-success"
              )}
            >
              <Check className="h-4 w-4" /> Sim
            </button>
            <button
              type="button"
              onClick={() => onOkChange(false)}
              aria-pressed={ok === false}
              className={cn(
                "flex h-11 min-w-[72px] flex-1 items-center justify-center gap-1.5 rounded-[8px] border text-sm font-semibold transition-all sm:flex-none sm:px-5",
                ok === false
                  ? "border-destructive bg-destructive text-destructive-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
              )}
            >
              <X className="h-4 w-4" /> Não
            </button>
          </div>
          {ok === false && (
            <div className="mt-3">
              <Textarea
                value={observation}
                onChange={(e) => onObservationChange(e.target.value)}
                placeholder={"Descreva o problema observado (obrigatório)"}
                rows={2}
                className={cn("text-sm", observationError && "border-destructive ring-2 ring-destructive/20")}
              />
              {observationError && (
                <p className="mt-1 text-xs font-medium text-destructive">Descreva a não conformidade para continuar.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
