import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorName: string;
  companyId: string;
  /** Called after the professional is saved with the sanitized phone (digits only). */
  onSaved: (phoneDigits: string) => void;
}

const sanitizePhone = (v: string) => v.replace(/\D/g, "");

const generatePassword = () =>
  Math.random().toString(36).slice(-10) + "Aa1!";

export default function ProfessionalContactDialog({ open, onOpenChange, doctorName, companyId, onSaved }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(doctorName || "");
      setEmail("");
      setPhone("");
    }
  }, [open, doctorName]);

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = sanitizePhone(phone);

    if (!cleanName) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast({ title: "E-mail inválido", variant: "destructive" });
      return;
    }
    if (cleanPhone.length < 10) {
      toast({ title: "Telefone inválido", description: "Informe DDD + número.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create_user",
          email: cleanEmail,
          password: generatePassword(),
          full_name: cleanName,
          phone: cleanPhone,
          role: "profissional",
          company_ids: [companyId],
          modules: [],
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: data?.reused ? "✅ Profissional vinculado!" : "✅ Profissional cadastrado!",
        description: data?.reused
          ? `${cleanName} já possuía cadastro — telefone e empresa atualizados.`
          : cleanName,
      });
      onSaved(cleanPhone);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao cadastrar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-accent" />
            Cadastrar profissional
          </DialogTitle>
          <DialogDescription>
            Não encontramos contato cadastrado para <strong>{doctorName}</strong>. Preencha os dados para enviar o
            comprovante via WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome completo *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr(a). Nome Sobrenome" />
          </div>
          <div>
            <Label>E-mail *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="profissional@email.com"
            />
          </div>
          <div>
            <Label>Telefone (WhatsApp) *</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(14) 99999-9999"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Inclua o DDD. Para celular use 9 dígitos após o DDD.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar e abrir WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
