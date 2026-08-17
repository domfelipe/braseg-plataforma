import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Camera,
  CheckCircle,
  XCircle,
  MapPin,
  Loader2,
  QrCode,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Html5Qrcode } from "html5-qrcode";
import { SelfieCapture } from "./SelfieCapture";

interface ScanResult {
  type: "entrada" | "saida";
  valid: boolean;
  distance: number;
  locationName: string;
  timestamp: string;
}

type Stage = "selfie" | "scan" | "result";

export function QrScanner() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("selfie");
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop().catch(() => {});
    }
    setScanning(false);
  }, []);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopScanner();
      setStage("selfie");
      setResult(null);
      setError(null);
      setLoading(false);
      setSelfieBase64(null);
    }
  }, [open, stopScanner]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleQrScan = useCallback(
    async (decodedText: string) => {
      if (loading) return;

      const match = decodedText.match(/^CLOCK:([0-9a-f-]{36}):(\d+)$/i);
      if (!match) return;

      await stopScanner();
      setLoading(true);
      setError(null);

      const locationId = match[1];
      const qrTimestamp = parseInt(match[2], 10);

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "clock-qr",
          {
            body: {
              location_id: locationId,
              qr_timestamp: qrTimestamp,
              selfie_base64: selfieBase64,
            },
          }
        );

        if (fnError) throw new Error(fnError.message);
        if (data?.error) throw new Error(data.error);

        setResult(data as ScanResult);
        setStage("result");
        toast({
          title: data.valid ? "Ponto registrado ✅" : "Ponto inválido ❌",
          description: `${data.type === "entrada" ? "Entrada" : "Saída"} — ${data.locationName}`,
          variant: data.valid ? "default" : "destructive",
        });

        queryClient.invalidateQueries({ queryKey: ["last-clock-entry"] });
        queryClient.invalidateQueries({ queryKey: ["clock-entries-today"] });
      } catch (err: any) {
        setError(err.message || "Erro ao registrar ponto");
      } finally {
        setLoading(false);
      }
    },
    [loading, stopScanner, toast, queryClient, selfieBase64]
  );

  const startScanning = async () => {
    setError(null);
    setResult(null);

    try {
      const scanner = new Html5Qrcode("qr-reader-dialog");
      scannerRef.current = scanner;
      setScanning(true);

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleQrScan,
        () => {}
      );
    } catch {
      setScanning(false);
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  };

  const handleSelfieCapture = (base64: string) => {
    setSelfieBase64(base64);
    setStage("scan");
  };

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className="w-full gap-2"
        onClick={() => setOpen(true)}
        disabled={!user?.id || !selectedCompany?.id}
      >
        <QrCode className="h-5 w-5" />
        Escanear QR Code do Local
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">
              {stage === "selfie" && "Tirar Selfie"}
              {stage === "scan" && "Escanear QR Code"}
              {stage === "result" && "Resultado"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4">
            {/* SELFIE STAGE */}
            {stage === "selfie" && (
              <SelfieCapture
                onCapture={handleSelfieCapture}
                onCancel={() => setOpen(false)}
              />
            )}

            {/* SCAN STAGE */}
            {stage === "scan" && (
              <>
                {loading && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Registrando ponto...
                    </p>
                  </div>
                )}

                {error && !loading && (
                  <div className="w-full space-y-3">
                    <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-destructive/10">
                      <XCircle className="h-10 w-10 text-destructive" />
                      <p className="text-sm text-destructive text-center">
                        {error}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={startScanning}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                )}

                {!loading && !error && (
                  <>
                    <div
                      id="qr-reader-dialog"
                      className={`w-full rounded-lg overflow-hidden ${
                        scanning ? "" : "hidden"
                      }`}
                    />

                    {!scanning && (
                      <div className="flex flex-col items-center gap-3 py-4">
                        {selfieBase64 && (
                          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary">
                            <img
                              src={selfieBase64}
                              alt="Selfie"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <QrCode className="h-10 w-10 text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          Agora aponte a câmera para o QR Code exibido no tablet da UBS
                        </p>
                        <Button size="lg" onClick={startScanning} className="gap-2">
                          <Camera className="h-5 w-5" />
                          Abrir Câmera
                        </Button>
                      </div>
                    )}

                    {scanning && (
                      <Button variant="outline" onClick={stopScanner}>
                        Cancelar
                      </Button>
                    )}
                  </>
                )}
              </>
            )}

            {/* RESULT STAGE */}
            {stage === "result" && result && (
              <div className="w-full space-y-3">
                <div
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl ${
                    result.valid ? "bg-green-500/10" : "bg-destructive/10"
                  }`}
                >
                  {result.valid ? (
                    <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-12 w-12 text-destructive" />
                  )}
                  <Badge
                    variant={result.type === "entrada" ? "default" : "secondary"}
                    className="text-sm px-3 py-1"
                  >
                    {result.type === "entrada" ? "Entrada" : "Saída"} —{" "}
                    {result.valid ? "Válido" : "Inválido"}
                  </Badge>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {result.locationName} — {result.distance}m
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setOpen(false)}
                >
                  Fechar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
