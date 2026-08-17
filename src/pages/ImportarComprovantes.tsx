import { useState, useMemo, useEffect } from "react";
import JSZip from "jszip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { Upload, Loader2, FileArchive, ShieldAlert } from "lucide-react";

type RowStatus = "pending" | "hashing" | "uploading" | "stored" | "duplicate" | "error";

interface RowItem {
  file: File;
  sourceKey: string;
  sha256: string | null;
  status: RowStatus;
  message?: string;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function ImportarComprovantes() {
  const { selectedCompany } = useCompany();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<RowItem[]>([]);
  const [prefix, setPrefix] = useState<string>(() => `manual-${new Date().toISOString().slice(0, 10)}`);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setIsAdmin(false); return; }
      const { data } = await supabase.from("user_roles").select("role")
        .eq("user_id", u.user.id).in("role", ["master", "super-admin"]);
      setIsAdmin(!!data && data.length > 0);
    })();
  }, []);

  const stats = useMemo(() => {
    const by = (s: RowStatus) => rows.filter(r => r.status === s).length;
    return { total: rows.length, stored: by("stored"), duplicate: by("duplicate"), error: by("error") };
  }, [rows]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const items: RowItem[] = [];
    for (const f of arr) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(await f.arrayBuffer());
          for (const entry of Object.values(zip.files)) {
            if (entry.dir) continue;
            if (!entry.name.toLowerCase().endsWith(".pdf")) continue;
            const blob = await entry.async("blob");
            const inner = new File([blob], entry.name.split("/").pop() || entry.name, { type: "application/pdf" });
            items.push({ file: inner, sourceKey: `${prefix}:${inner.name}`, sha256: null, status: "pending" });
          }
        } catch (e) {
          toast.error(`Falha lendo ZIP ${f.name}: ${(e as Error).message}`);
        }
      } else if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        items.push({ file: f, sourceKey: `${prefix}:${f.name}`, sha256: null, status: "pending" });
      }
    }
    setRows(prev => [...prev, ...items]);
  };

  const process = async () => {
    if (!selectedCompany) { toast.error("Selecione uma empresa"); return; }
    setBusy(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status === "stored" || r.status === "duplicate") continue;
      try {
        setRows(cur => cur.map((x, idx) => idx === i ? { ...x, status: "hashing" } : x));
        const buf = await r.file.arrayBuffer();
        const sha = await sha256Hex(buf);
        setRows(cur => cur.map((x, idx) => idx === i ? { ...x, sha256: sha, status: "uploading" } : x));

        const { data: resp, error } = await supabase.functions.invoke("admin-import-source-doc", {
          body: {
            source_key: r.sourceKey, company_id: selectedCompany.id, sha256: sha,
            size_bytes: r.file.size, mime_type: "application/pdf", filename: r.file.name,
            batch_label: prefix,
          },
        });
        if (error) throw error;

        if (resp?.status === "duplicate") {
          setRows(cur => cur.map((x, idx) => idx === i ? { ...x, status: "duplicate", message: `Duplicata de ${resp.duplicate_of}` } : x));
          continue;
        }

        if (resp?.status === "upload_required" && resp.upload_url) {
          const put = await fetch(resp.upload_url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: buf });
          if (!put.ok) throw new Error(`PUT falhou (${put.status})`);
          const { error: confErr } = await supabase.functions.invoke("admin-confirm-source-doc", {
            body: { source_key: r.sourceKey, ok: true },
          });
          if (confErr) throw confErr;
          setRows(cur => cur.map((x, idx) => idx === i ? { ...x, status: "stored" } : x));
        } else {
          throw new Error("Resposta inesperada do servidor");
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        await supabase.functions.invoke("admin-confirm-source-doc", {
          body: { source_key: r.sourceKey, ok: false, error_message: msg },
        }).catch(() => {});
        setRows(cur => cur.map((x, idx) => idx === i ? { ...x, status: "error", message: msg } : x));
      }
    }
    setBusy(false);
    toast.success("Processamento concluído");
  };

  if (isAdmin === false) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-4 w-4" /> Acesso restrito</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Somente master/super-admin podem usar esta página.</p></CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Importar comprovantes (admin)</h1>
        <p className="text-sm text-muted-foreground">Envie PDFs ou um ZIP contendo PDFs. Cada arquivo é hasheado no navegador; duplicatas são detectadas antes do upload.</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label className="text-xs">Rótulo do lote (source_key prefix)</Label>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/[^a-zA-Z0-9_\-:.]/g, "-"))} />
          </div>
          <div>
            <Label className="text-xs">Arquivos (PDF ou ZIP)</Label>
            <Input type="file" multiple accept=".pdf,.zip,application/pdf,application/zip" onChange={(e) => handleFiles(e.target.files)} />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground flex gap-2 items-center flex-wrap">
              <FileArchive className="h-3 w-3" />
              <span>Total: {stats.total}</span>
              <Badge variant="outline">stored: {stats.stored}</Badge>
              <Badge variant="outline">duplicate: {stats.duplicate}</Badge>
              <Badge variant="outline" className="text-destructive">error: {stats.error}</Badge>
            </div>
            <Button disabled={busy || rows.length === 0 || !selectedCompany} onClick={process}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Processar {rows.length} arquivos
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Fila</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <ul className="text-xs space-y-1 max-h-[50vh] overflow-y-auto">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-2 border rounded px-2 py-1">
                  <span className="truncate flex-1">{r.file.name}</span>
                  <span className="text-muted-foreground truncate flex-1">{r.sha256?.slice(0, 12) ?? "—"}</span>
                  <Badge variant="outline" className={
                    r.status === "stored" ? "text-success" :
                    r.status === "duplicate" ? "text-warning" :
                    r.status === "error" ? "text-destructive" : ""
                  }>{r.status}</Badge>
                  {r.message && <span className="text-[10px] text-muted-foreground truncate max-w-[30%]" title={r.message}>{r.message}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
