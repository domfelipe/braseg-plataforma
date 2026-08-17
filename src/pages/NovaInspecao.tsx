import { ChecklistWizard } from "@/components/frotas/checklist/ChecklistWizard";

export default function NovaInspecao() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Nova inspeção</h1>
        <p className="mt-1 text-sm text-muted-foreground">Checklist pré-uso do veículo com fotos e assinatura.</p>
      </div>
      <ChecklistWizard />
    </div>
  );
}
