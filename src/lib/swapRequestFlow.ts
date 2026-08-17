import { supabase } from "@/integrations/supabase/client";

export async function requestShiftSwap(params: {
  assignmentId: string;
  type: "troca" | "passagem";
  toUserId: string;
  counterpartyAssignmentId?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await supabase.rpc("request_shift_swap", {
    p_assignment_id: params.assignmentId,
    p_type: params.type,
    p_to_user_id: params.toUserId,
    p_counterparty_assignment_id: params.counterpartyAssignmentId ?? null,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function respondShiftSwap(params: {
  requestId: string;
  accept: boolean;
  notes?: string | null;
}) {
  const { error } = await supabase.rpc("respond_shift_swap_request", {
    p_request_id: params.requestId,
    p_accept: params.accept,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
}

export async function reviewShiftSwap(params: {
  requestId: string;
  approve: boolean;
  notes?: string | null;
}) {
  const { error } = await supabase.rpc("review_shift_swap_request", {
    p_request_id: params.requestId,
    p_approve: params.approve,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
}

export type SwapStatus =
  | "aguardando_medico"
  | "aguardando_admin"
  | "recusada_medico"
  | "recusada_admin"
  | "concluida"
  | "cancelada"
  | "legado_pendente"
  | "legado_aprovada"
  | "legado_rejeitada";

export function statusLabel(status: string): string {
  switch (status) {
    case "aguardando_medico":
      return "Aguardando médico";
    case "aguardando_admin":
      return "Aguardando admin";
    case "recusada_medico":
      return "Recusada pelo médico";
    case "recusada_admin":
      return "Recusada pelo admin";
    case "concluida":
      return "Concluída";
    case "cancelada":
      return "Cancelada";
    case "legado_pendente":
      return "Legado: pendente";
    case "legado_aprovada":
      return "Legado: aprovada";
    case "legado_rejeitada":
      return "Legado: rejeitada";
    // legado direto
    case "pendente":
      return "Pendente";
    case "aprovada":
      return "Aprovada";
    case "rejeitada":
      return "Rejeitada";
    default:
      return status;
  }
}

export function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "concluida":
    case "legado_aprovada":
      return "default";
    case "recusada_medico":
    case "recusada_admin":
    case "legado_rejeitada":
    case "cancelada":
      return "destructive";
    case "aguardando_medico":
    case "aguardando_admin":
      return "secondary";
    default:
      return "outline";
  }
}

export const ACTIVE_STATUSES: SwapStatus[] = [
  "aguardando_medico",
  "aguardando_admin",
];

export const HISTORY_STATUSES: SwapStatus[] = [
  "concluida",
  "recusada_medico",
  "recusada_admin",
  "cancelada",
  "legado_pendente",
  "legado_aprovada",
  "legado_rejeitada",
];
