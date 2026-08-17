import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Image, File, Check, Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DB_NAME = "share-target-db";
const STORE_NAME = "shared-files";

async function getSharedFiles(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const items = getAll.result as Array<{ name: string; type: string; data: ArrayBuffer }>;
        const files = items.map((item) => {
          const blob = new Blob([item.data], { type: item.type });
          const file = new window.File([blob], item.name, { type: item.type });
          return file;
        });
        resolve(files);
      };
      getAll.onerror = () => reject(getAll.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearSharedFiles() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="h-5 w-5 text-accent" />;
  if (type === "application/pdf") return <FileText className="h-5 w-5 text-destructive" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const moduleTargets = [
  { label: "Financeiro (Comprovante)", path: "/financeiro", description: "Enviar como comprovante financeiro" },
  { label: "Pagamentos (Nota Fiscal)", path: "/pagamentos", description: "Enviar como nota fiscal" },
  { label: "Documentos", path: "/documentos", description: "Enviar para documentos de funcionários" },
];

export default function Compartilhar() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSharedFiles()
      .then((f) => {
        setFiles(f);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        toast({ title: "Não foi possível carregar os arquivos compartilhados", variant: "destructive" });
      });
  }, []);

  const handleNavigate = async (path: string) => {
    // Store files in sessionStorage as base64 for the target page to pick up
    const fileData = await Promise.all(
      files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        return { name: file.name, type: file.type, size: file.size, base64 };
      })
    );
    sessionStorage.setItem("shared-files", JSON.stringify(fileData));
    await clearSharedFiles();
    navigate(path);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 gap-4">
        <File className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground text-center">Nenhum arquivo foi compartilhado.</p>
        <Button onClick={() => navigate("/")} variant="outline">
          Ir para o início
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Check className="h-6 w-6 text-success" />
            <h1 className="text-xl font-semibold text-foreground">Arquivo recebido!</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {files.length === 1 ? "1 arquivo" : `${files.length} arquivos`} compartilhado{files.length > 1 ? "s" : ""}. Escolha para onde enviar:
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Arquivos recebidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((file, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                {getFileIcon(file.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {file.type.split("/")[1]?.toUpperCase() || "ARQUIVO"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enviar para</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {moduleTargets.map((target) => (
              <Button
                key={target.path}
                variant="outline"
                className="w-full justify-between h-auto py-3 px-4"
                onClick={() => handleNavigate(target.path)}
              >
                <div className="text-left">
                  <p className="font-medium text-sm">{target.label}</p>
                  <p className="text-xs text-muted-foreground">{target.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            ))}
          </CardContent>
        </Card>

        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => { clearSharedFiles(); navigate("/"); }}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
