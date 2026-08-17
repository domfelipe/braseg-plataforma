import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getCompanyLocations } from "@/lib/companyLocations";
import { AlertTriangle, ExternalLink, Save, Filter } from "lucide-react";

type Row = {
  id: string;
  company_id: string;
  type: string;
  description: string | null;
  amount: number | null;
  city: string | null;
  category_id: string | null;
  notes: string | null;
  attachment_url: string | null;
  due_date: string | null;
  payment_date: string | null;
};

type Category = { id: string; name: string; type: string };
type Company = { id: string; name: string };

const NEW_CAT = "__new__";

export default function TriagemClassificacao() {
  const { selectedCompany } = useCompany();
  const { isMaster } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categoriesByCompany, setCategoriesByCompany] = useState<
    Record<string, Category[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "no_city" | "no_category">("all");
  const [companyFilter, setCompanyFilter] = useState<string>(
    selectedCompany?.id || "all"
  );
  const [drafts, setDrafts] = useState<
    Record<
      string,
      { city?: string | null; category_id?: string | null; newCatName?: string }
    >
  >({});

  const canAccess = isMaster;

  const loadData = async () => {
    setLoading(true);
    const [{ data: rowsData }, { data: catData }, { data: coData }] =
      await Promise.all([
        supabase
          .from("financial_transactions")
          .select(
            "id, company_id, type, description, amount, city, category_id, notes, attachment_url, due_date, payment_date"
          )
          .or("city.is.null,category_id.is.null")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("financial_categories").select("id, name, type, company_id"),
        supabase.from("companies").select("id, name").order("name"),
      ]);

    if (rowsData) {
      const needing = (rowsData as any[]).filter(
        (r) => !r.city || !r.category_id
      ) as Row[];
      setRows(needing);
    }
    if (catData) {
      const map: Record<string, Category[]> = {};
      (catData as any[]).forEach((c) => {
        if (!map[c.company_id]) map[c.company_id] = [];
        map[c.company_id].push({ id: c.id, name: c.name, type: c.type });
      });
      Object.values(map).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)));
      setCategoriesByCompany(map);
    }
    if (coData) setCompanies(coData as Company[]);
    setLoading(false);
  };

  useEffect(() => {
    if (canAccess) loadData();
  }, [canAccess]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (companyFilter !== "all" && r.company_id !== companyFilter) return false;
      if (filter === "no_city" && r.city) return false;
      if (filter === "no_category" && r.category_id) return false;
      return true;
    });
  }, [rows, companyFilter, filter]);

  const companyName = (id: string) =>
    companies.find((c) => c.id === id)?.name || "Empresa";

  const handleSave = async (row: Row) => {
    const draft = drafts[row.id] || {};
    const updates: Record<string, unknown> = {};

    if (draft.city !== undefined && draft.city !== row.city) {
      updates.city = draft.city || null;
    }

    let finalCategoryId = draft.category_id;
    if (draft.category_id === NEW_CAT) {
      const name = (draft.newCatName || "").trim();
      if (!name) {
        toast({ title: "Informe o nome da nova categoria", variant: "destructive" });
        return;
      }
      const { data: catId, error: catErr } = await supabase.rpc(
        "upsert_financial_category",
        {
          _company_id: row.company_id,
          _name: name,
          _type: row.type || "despesa",
        }
      );
      if (catErr || typeof catId !== "string") {
        toast({ title: "Falha ao criar categoria", description: catErr?.message, variant: "destructive" });
        return;
      }
      finalCategoryId = catId;
    }
    if (finalCategoryId !== undefined && finalCategoryId !== row.category_id) {
      updates.category_id = finalCategoryId;
    }

    if (Object.keys(updates).length === 0) {
      toast({ title: "Nenhuma alteração para salvar" });
      return;
    }

    setSaving((s) => ({ ...s, [row.id]: true }));
    const { error } = await supabase
      .from("financial_transactions")
      .update(updates)
      .eq("id", row.id);
    setSaving((s) => ({ ...s, [row.id]: false }));

    if (error) {
      toast({ title: "Falha ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Classificação salva" });

    // Remove from list if now fully classified
    setRows((prev) => {
      const updated = prev.map((r) =>
        r.id === row.id ? { ...r, ...updates } : r
      );
      return updated.filter((r) => !r.city || !r.category_id);
    });
    setDrafts((prev) => {
      const c = { ...prev };
      delete c[row.id];
      return c;
    });
  };

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Acesso restrito
            </CardTitle>
          </CardHeader>
          <CardContent>
            Esta área é exclusiva para administradores (master/super-admin).
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Triagem de classificação</h1>
          <p className="text-sm text-muted-foreground">
            Lançamentos vindos do WhatsApp que ficaram sem local ou sem categoria.
            Nada aqui altera valores ou datas.
          </p>
        </div>
        <a
          href="/financeiro"
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          ← Voltar ao Financeiro
        </a>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filtro
            </label>
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="w-[210px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sem local OU sem categoria</SelectItem>
                <SelectItem value="no_city">Somente sem local</SelectItem>
                <SelectItem value="no_category">Somente sem categoria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs">Empresa</label>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-[240px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {loading ? "Carregando..." : `${visible.length} lançamento(s)`}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {!loading && visible.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Nada pendente com o filtro atual. 🎉
            </CardContent>
          </Card>
        )}

        {visible.map((row) => {
          const cats = (categoriesByCompany[row.company_id] || []).filter(
            (c) => !row.type || c.type === row.type
          );
          const locations = getCompanyLocations(row.company_id);
          const draft = drafts[row.id] || {};
          const cityValue = draft.city !== undefined ? draft.city : row.city;
          const catValue =
            draft.category_id !== undefined ? draft.category_id : row.category_id;
          const setDraft = (patch: Partial<typeof draft>) =>
            setDrafts((prev) => ({ ...prev, [row.id]: { ...prev[row.id], ...patch } }));

          return (
            <Card key={row.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {companyName(row.company_id)} · {row.type}
                    </div>
                    <CardTitle className="text-base mt-1">
                      {row.description || "(sem descrição)"}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-1">
                      R$ {Number(row.amount || 0).toFixed(2)} ·{" "}
                      {row.payment_date || row.due_date || "sem data"}
                    </div>
                  </div>
                  {row.attachment_url && (
                    <a
                      href={row.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      Ver comprovante <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {row.notes && (
                  <div className="mt-2 text-xs whitespace-pre-wrap bg-muted/40 rounded p-2 max-h-24 overflow-auto">
                    {row.notes}
                  </div>
                )}
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs">
                    Local {row.city ? "" : <span className="text-destructive">*</span>}
                  </label>
                  <Select
                    value={cityValue || ""}
                    onValueChange={(v) => setDraft({ city: v || null })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione o local" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs">
                    Categoria{" "}
                    {row.category_id ? "" : <span className="text-destructive">*</span>}
                  </label>
                  <Select
                    value={catValue || ""}
                    onValueChange={(v) => setDraft({ category_id: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {cats.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                      <SelectItem value={NEW_CAT}>+ Nova categoria…</SelectItem>
                    </SelectContent>
                  </Select>
                  {catValue === NEW_CAT && (
                    <Input
                      className="h-9 mt-2"
                      placeholder="Nome da nova categoria"
                      value={draft.newCatName || ""}
                      onChange={(e) => setDraft({ newCatName: e.target.value })}
                    />
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!!saving[row.id]}
                    onClick={() => handleSave(row)}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {saving[row.id] ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
