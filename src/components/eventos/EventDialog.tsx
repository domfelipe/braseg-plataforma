import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface EventFormData {
  title: string;
  description: string;
  location: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  color: string;
}

export const EVENT_COLORS: Record<string, string> = {
  "1": "bg-blue-100 text-blue-800 border-blue-200",
  "2": "bg-green-100 text-green-800 border-green-200",
  "3": "bg-purple-100 text-purple-800 border-purple-200",
  "4": "bg-red-100 text-red-800 border-red-200",
  "5": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "6": "bg-orange-100 text-orange-800 border-orange-200",
  default: "bg-primary/10 text-primary border-primary/20",
};

export function getEventColorClass(color: string | null) {
  return EVENT_COLORS[color || ""] || EVENT_COLORS.default;
}

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: EventFormData;
  setForm: (form: EventFormData) => void;
  isEditing: boolean;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

export function EventDialog({
  open, onOpenChange, form, setForm,
  isEditing, onSave, onDelete, isSaving, isDeleting,
}: EventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Evento" : "Novo Evento"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Altere os dados do evento. A alteração será sincronizada com o Google Calendar."
              : "Preencha os dados do evento. Ele será sincronizado automaticamente com o Google Calendar."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nome do evento" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>Local</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Endereço ou local" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.all_day} onCheckedChange={(v) => setForm({ ...form, all_day: v })} />
            <Label>Dia inteiro</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início *</Label>
              <Input
                type={form.all_day ? "date" : "datetime-local"}
                value={form.start_at}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Fim *</Label>
              <Input
                type={form.all_day ? "date" : "datetime-local"}
                value={form.end_at}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-1">
              {Object.keys(EVENT_COLORS).filter(k => k !== "default").map((c) => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 ${EVENT_COLORS[c].split(" ")[0]} ${form.color === c ? "ring-2 ring-primary ring-offset-2" : "border-transparent"}`}
                  onClick={() => setForm({ ...form, color: form.color === c ? "" : c })}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between gap-2">
          {isEditing && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="mr-auto gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={onSave}
              disabled={!form.title || !form.start_at || !form.end_at || isSaving}
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
