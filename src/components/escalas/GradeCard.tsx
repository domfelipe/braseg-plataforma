import { Badge } from "@/components/ui/badge";
import { Clock, Stethoscope, Layers } from "lucide-react";

interface Props {
  grade: {
    name: string;
    start_time: string;
    end_time: string;
    specialty: string | null;
    shift_type: string | null;
    color: string;
  };
}

export function GradeCard({ grade }: Props) {
  const startFormatted = grade.start_time?.slice(0, 5) || "07:00";
  const endFormatted = grade.end_time?.slice(0, 5) || "19:00";

  return (
    <div
      className="rounded-xl p-3 space-y-2 transition-all hover:shadow-sm"
      style={{
        background: `linear-gradient(135deg, ${grade.color}12, ${grade.color}06)`,
        borderLeft: `3px solid ${grade.color}`,
      }}
    >
      <div className="font-semibold text-sm text-foreground leading-tight tracking-tight">
        {grade.name}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3 shrink-0" />
        <span className="font-mono">{startFormatted}</span>
        <span className="opacity-50">→</span>
        <span className="font-mono">{endFormatted}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {grade.specialty && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 h-[18px] font-normal gap-1"
          >
            <Stethoscope className="h-2.5 w-2.5" />
            {grade.specialty}
          </Badge>
        )}
        {grade.shift_type && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-[18px] font-normal border-border/50 gap-1"
          >
            <Layers className="h-2.5 w-2.5" />
            {grade.shift_type}
          </Badge>
        )}
      </div>
    </div>
  );
}
