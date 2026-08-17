// Tipos e regras do checklist de inspeção (Braseg Portal — Fase 2)

export interface ChecklistTemplate {
  id: string;
  company_id: string;
  name: string;
  category: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ChecklistItem {
  id: string;
  template_id: string;
  description: string;
  required: boolean;
  sort_order: number;
}

export interface ChecklistRow {
  id: string;
  company_id: string;
  vehicle_id: string;
  template_id: string;
  driver_name: string | null;
  odometer: number | null;
  status: "conforme" | "nao_conforme";
  notes: string | null;
  signature_data_url: string;
  created_by?: string | null;
  created_at: string;
}

export interface ChecklistAnswerRow {
  id: string;
  checklist_id: string;
  item_id: string;
  ok: boolean;
  observation: string | null;
}

export interface ChecklistPhotoRow {
  id: string;
  checklist_id: string;
  storage_path: string;
}

export const CHECKLIST_CATEGORIES = [
  { value: "pre_uso", label: "Pré-uso" },
  { value: "manutencao", label: "Manutenção" },
  { value: "vistoria", label: "Vistoria" },
] as const;

export const DEFAULT_TEMPLATE_NAME = "Inspeção Diária Pré-Uso";

export const DEFAULT_TEMPLATE_ITEMS = [
  "Pneus em bom estado e calibrados",
  "Freios respondendo normalmente",
  "Faróis, lanternas e setas funcionando",
  "Buzina em funcionamento",
  "Cintos de segurança em bom estado",
  "Extintor de incêndio presente e dentro da validade",
  "Nível de óleo e água do radiador adequados",
  "Limpadores de para-brisa funcionando",
  "Lataria, retrovisores e espelhos sem avarias",
  "Documentos do veículo no interior (CRLV e seguro)",
];

export type ChecklistStatus = "conforme" | "nao_conforme";

/** Status final: qualquer item "não" torna a inspeção não conforme. */
export function computeChecklistStatus(answers: { ok: boolean }[]): ChecklistStatus {
  return answers.every((a) => a.ok) ? "conforme" : "nao_conforme";
}

/** Valida um item respondido: "não" exige observação (MVP: sempre). */
export function itemAnswerIsValid(ok: boolean, observation: string): boolean {
  if (ok) return true;
  return observation.trim().length >= 3;
}

/** Nome de arquivo único para fotos do checklist. */
export function checklistPhotoPath(companyId: string, checklistId: string, index: number): string {
  const stamp = Date.now();
  return companyId + "/" + checklistId + "/" + stamp + "-" + index + ".jpg";
}
