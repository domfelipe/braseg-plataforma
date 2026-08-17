import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, Loader2, Upload } from "lucide-react";
import { getCompanyLocations } from "@/lib/companyLocations";

type CompanyInfo = { id: string; name: string; trade_name?: string | null; logo_url?: string | null };

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/public-submit-invoice`;

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => [a && `(${a})`, b, c].filter(Boolean).join(" ").trim());
  return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
}

export default function EnviarNotaFiscal() {
  const { companyId } = useParams<{ companyId: string }>();
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const r = await fetch(`${FN_URL}?company_id=${companyId}`, {
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        });
        const j = await r.json();
        if (!r.ok || !j.ok) {
          setCompanyError(j?.message || "Empresa não encontrada");
        } else {
          setCompany(j.company);
        }
      } catch {
        setCompanyError("Não foi possível carregar os dados da empresa.");
      } finally {
        setLoadingCompany(false);
      }
    })();
  }, [companyId]);

  const locations = companyId ? getCompanyLocations(companyId) : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (!companyId || !file) {
      setResult({ ok: false, message: "Selecione o arquivo da nota fiscal." });
      return;
    }
    if (!name.trim() || name.trim().length < 3) {
      setResult({ ok: false, message: "Informe seu nome completo." });
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setResult({ ok: false, message: "Informe um telefone válido com DDD." });
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("company_id", companyId);
      form.append("file", file);
      form.append("nome_profissional", name.trim());
      form.append("telefone", phone.trim());
      if (cnpj.trim()) form.append("cnpj", cnpj.trim());
      if (city) form.append("city", city);
      if (notes.trim()) form.append("observacao", notes.trim());

      const r = await fetch(FN_URL, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body: form,
      });
      const j = await r.json();
      if (r.ok && j.success) {
        setResult({ ok: true, message: j.message || "Nota recebida com sucesso!" });
        // reset
        setName(""); setCnpj(""); setPhone(""); setCity(""); setNotes(""); setFile(null);
        const input = document.getElementById("nf-file") as HTMLInputElement | null;
        if (input) input.value = "";
      } else {
        setResult({ ok: false, message: j?.message || "Não foi possível enviar a nota." });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Erro ao enviar." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (companyError || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Link inválido</CardTitle>
            <CardDescription>{companyError || "Empresa não encontrada."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col items-center text-center mb-8">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-16 mb-4" />
          ) : null}
          <h1 className="text-2xl font-bold">Envio de Nota Fiscal</h1>
          <p className="text-muted-foreground mt-1">{company.trade_name || company.name}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Envie sua nota fiscal</CardTitle>
            <CardDescription>
              Preencha os dados abaixo e anexe a nota. Verificaremos automaticamente se a nota já foi enviada
              antes (mesmo CNPJ + mesmo número) para evitar duplicidades.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <Alert variant={result.ok ? "default" : "destructive"} className="mb-4">
                {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertTitle>{result.ok ? "Recebido!" : "Atenção"}</AlertTitle>
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome completo *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cnpj">CNPJ do prestador</Label>
                  <Input
                    id="cnpj"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Telefone (WhatsApp) *</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(14) 99999-9999"
                    required
                    inputMode="tel"
                  />
                </div>
              </div>

              {locations.length > 0 && (
                <div>
                  <Label>Localidade</Label>
                  <Select value={city} onValueChange={setCity}>
                    <SelectTrigger><SelectValue placeholder="Selecione a localidade" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="nf-file">Arquivo da nota fiscal (PDF, PNG, JPG, WEBP) *</Label>
                <Input
                  id="nf-file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
                {file && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {file.name} — {(file.size / 1024).toFixed(0)} KB
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="notes">Observação (opcional)</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {submitting ? "Enviando..." : "Enviar nota"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
