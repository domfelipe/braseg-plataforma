import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api } from "@/integrations/api/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCnpj, isValidCnpj } from "@/lib/seguranca/matrix";
import type { SegClient } from "@/lib/seguranca/types";

const schema = z.object({
  razao_social: z.string().min(3, "Informe a razão social"),
  cnpj: z
    .string()
    .min(14, "CNPJ incompleto")
    .refine((v) => isValidCnpj(v), "CNPJ inválido"),
  cnae: z.string().optional(),
  grau_risco: z.string().optional(),
  n_funcionarios: z.string().optional(),
  responsavel: z.string().optional(),
  atividade_principal: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2, "UF com 2 letras").optional(),
  cep: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function EmpresasNova() {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { razao_social: "", cnpj: "", cnae: "", grau_risco: "", n_funcionarios: "", responsavel: "", atividade_principal: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: "", cep: "" },
  });

  const create = useMutation({
    mutationFn: (values: FormValues) => {
      const endereco =
        values.logradouro || values.cidade
          ? {
              logradouro: values.logradouro,
              numero: values.numero,
              bairro: values.bairro,
              cidade: values.cidade,
              uf: (values.uf || "").toUpperCase(),
              cep: values.cep,
            }
          : undefined;
      return api.post<{ client: SegClient }>("/seguranca/clients", {
        companyId,
        razao_social: values.razao_social,
        cnpj: values.cnpj,
        cnae: values.cnae || null,
        grau_risco: values.grau_risco ? Number(values.grau_risco) : null,
        n_funcionarios: values.n_funcionarios ? Number(values.n_funcionarios) : null,
        responsavel: values.responsavel || null,
        atividade_principal: values.atividade_principal || null,
        endereco,
      });
    },
    onSuccess: (data) => {
      toast.success("Empresa cadastrada com sucesso");
      navigate("/seguranca/empresas/" + data.client.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cadastrar empresa"),
  });

  const onSubmit = form.handleSubmit((values) => create.mutate(values));

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate("/seguranca")}>
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <h1 className="font-display text-2xl font-bold tracking-tight">Nova empresa cliente</h1>
      <p className="mt-1 text-sm text-muted-foreground">Dados de identificação que entram no PGR/PGRTR.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
        <Card className="rounded-[10px] p-6">
          <h2 className="font-display text-sm font-bold">Identificação</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="razao_social">Razão social *</Label>
              <Input id="razao_social" className="mt-1.5" placeholder="MARMORARIA DINAMI LTDA" {...form.register("razao_social")} />
              {form.formState.errors.razao_social && (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.razao_social.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                className="mt-1.5"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                {...form.register("cnpj", {
                  onChange: (e) => {
                    const formatted = formatCnpj(e.target.value.replace(/\D/g, "").slice(0, 14));
                    form.setValue("cnpj", formatted, { shouldValidate: true });
                  },
                })}
              />
              {form.formState.errors.cnpj && <p className="mt-1 text-xs text-destructive">{form.formState.errors.cnpj.message}</p>}
            </div>
            <div>
              <Label htmlFor="cnae">CNAE</Label>
              <Input id="cnae" className="mt-1.5" placeholder="00.00-0-00" {...form.register("cnae")} />
            </div>
            <div>
              <Label htmlFor="grau_risco">Grau de risco (NR-04)</Label>
              <Select value={form.watch("grau_risco")} onValueChange={(v) => form.setValue("grau_risco", v, { shouldValidate: true })}>
                <SelectTrigger id="grau_risco" className="mt-1.5">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "4"].map((g) => (
                    <SelectItem key={g} value={g}>Grau {g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="n_funcionarios">Nº de funcionários</Label>
              <Input id="n_funcionarios" type="number" min={0} className="mt-1.5" {...form.register("n_funcionarios")} />
            </div>
            <div>
              <Label htmlFor="responsavel">Responsável</Label>
              <Input id="responsavel" className="mt-1.5" placeholder="Nome do responsável" {...form.register("responsavel")} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="atividade_principal">Atividade principal</Label>
              <Textarea id="atividade_principal" className="mt-1.5" rows={2} placeholder="Descrição resumida da atividade econômica" {...form.register("atividade_principal")} />
            </div>
          </div>
        </Card>

        <Card className="rounded-[10px] p-6">
          <h2 className="font-display text-sm font-bold">Endereço (opcional)</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="logradouro">Logradouro</Label>
              <Input id="logradouro" className="mt-1.5" {...form.register("logradouro")} />
            </div>
            <div>
              <Label htmlFor="numero">Número</Label>
              <Input id="numero" className="mt-1.5" {...form.register("numero")} />
            </div>
            <div>
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" className="mt-1.5" {...form.register("bairro")} />
            </div>
            <div>
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" className="mt-1.5" {...form.register("cidade")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="uf">UF</Label>
                <Input id="uf" maxLength={2} className="mt-1.5 uppercase" {...form.register("uf")} />
              </div>
              <div>
                <Label htmlFor="cep">CEP</Label>
                <Input id="cep" className="mt-1.5" {...form.register("cep")} />
              </div>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/seguranca")}>Cancelar</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Salvando..." : "Cadastrar empresa"}
          </Button>
        </div>
      </form>
    </div>
  );
}
