import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { X, User, ArrowLeftRight, ArrowRight, MoreVertical, Phone, Clock, CalendarDays, Pencil, Ban } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  assignment: any;
  gradeName?: string;
  gradeTime?: string;
  gradeColor: string;
  isMaster: boolean;
  isOwnShift?: boolean;
  onDelete: () => void;
  onRequestSwap?: (type: "troca" | "passagem") => void;
  onEdit?: () => void;
  onSetInactive?: () => void;
}

export function ShiftCell({ assignment, gradeName, gradeTime, gradeColor, isMaster, isOwnShift, onDelete, onRequestSwap, onEdit, onSetInactive }: Props) {
  const profile = assignment.user_profiles;
  const name = profile?.full_name || "Profissional";
  const phone = profile?.phone;
  const firstName = name.split(" ")[0];
  const lastName = name.split(" ").length > 1 ? name.split(" ").slice(-1)[0] : "";
  const displayName = lastName ? `${firstName} ${lastName.charAt(0)}.` : firstName;

  // Custom time display
  const customTime = assignment.custom_start_time && assignment.custom_end_time
    ? `${assignment.custom_start_time.slice(0, 5)} - ${assignment.custom_end_time.slice(0, 5)}`
    : null;

  const statusConfig: Record<string, { gradient: string; label: string; dot: string }> = {
    confirmado: { gradient: "from-emerald-500/90 to-teal-600/90", label: "Confirmado", dot: "bg-emerald-400" },
    aberto: { gradient: "from-amber-500/90 to-orange-600/90", label: "Aberto", dot: "bg-amber-400" },
    troca_pendente: { gradient: "from-violet-500/90 to-purple-600/90", label: "Troca Pendente", dot: "bg-violet-400" },
    inativo: { gradient: "from-gray-400/90 to-gray-500/90", label: "Inativo", dot: "bg-gray-400" },
  };

  const status = statusConfig[assignment.status] || statusConfig.confirmado;
  const isInactive = assignment.status === "inativo";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`group relative rounded-lg bg-gradient-to-br ${status.gradient} text-white px-2.5 py-2.5 text-xs font-medium shadow-sm hover:shadow-md hover:scale-[1.02] transition-all cursor-default flex-1 flex items-center ${isInactive ? "opacity-60" : ""}`}
        >
          <div className="flex items-center gap-1.5">
            {isInactive ? (
              <Ban className="h-3 w-3 shrink-0 opacity-80" />
            ) : (
              <User className="h-3 w-3 shrink-0 opacity-80" />
            )}
            <span className={`truncate flex-1 ${isInactive ? "line-through" : ""}`}>{displayName}</span>
            {/* Custom time badge */}
            {customTime && !isInactive && (
              <span className="text-[9px] opacity-70 shrink-0">{assignment.custom_start_time?.slice(0, 5)}</span>
            )}
            {/* Status dot */}
            {assignment.status !== "confirmado" && assignment.status !== "inativo" && (
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot} shrink-0 animate-pulse`} />
            )}
          </div>

          {/* Actions overlay */}
          <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {(isMaster || isOwnShift) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded-full bg-background text-foreground flex items-center justify-center shadow-sm hover:bg-muted transition-colors"
                  >
                    <MoreVertical className="h-2.5 w-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {isMaster && onEdit && (
                    <DropdownMenuItem onClick={onEdit} className="gap-2 text-xs">
                      <Pencil className="h-3.5 w-3.5" />
                      Editar Plantão
                    </DropdownMenuItem>
                  )}
                  {onRequestSwap && !isInactive && (
                    <>
                      <DropdownMenuItem onClick={() => onRequestSwap("troca")} className="gap-2 text-xs">
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        Solicitar Troca
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onRequestSwap("passagem")} className="gap-2 text-xs">
                        <ArrowRight className="h-3.5 w-3.5" />
                        Passar Plantão
                      </DropdownMenuItem>
                    </>
                  )}
                  {isMaster && onSetInactive && !isInactive && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onSetInactive} className="gap-2 text-xs text-muted-foreground">
                        <Ban className="h-3.5 w-3.5" />
                        Plantão Inativo
                      </DropdownMenuItem>
                    </>
                  )}
                  {isMaster && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive">
                        <X className="h-3.5 w-3.5" />
                        Remover Plantão
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] p-3 z-[100]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center">
              {isInactive ? <Ban className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>
            <div>
              <p className="font-semibold text-sm">{name}</p>
              {phone && (
                <div className="flex items-center gap-1 text-xs opacity-80">
                  <Phone className="h-2.5 w-2.5" />
                  {phone}
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-white/10 pt-2 space-y-1">
            {gradeName && (
              <div className="flex items-center gap-1.5 text-xs opacity-80">
                <CalendarDays className="h-3 w-3" />
                {gradeName}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs opacity-80">
              <Clock className="h-3 w-3" />
              {customTime || gradeTime || "—"}
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${status.dot}`} />
              {status.label}
            </div>
            {assignment.date && (
              <div className="text-xs opacity-80">
                {format(new Date(assignment.date + "T12:00:00"), "EEEE, dd/MM", { locale: ptBR })}
              </div>
            )}
          </div>
          {assignment.original_user_id && (
            <div className="border-t border-white/10 pt-1">
              <p className="text-[10px] opacity-60 italic">Plantão originalmente de outro profissional</p>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
