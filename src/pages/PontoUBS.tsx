import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, MapPin, QrCode, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";

interface Location {
  id: string;
  name: string;
  company_id: string;
}

export default function PontoUBS() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [loading, setLoading] = useState(true);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load all active locations (this page runs unauthenticated, use service role via edge or preload)
  useEffect(() => {
    const loadLocations = async () => {
      // Try to get locations - if user is logged in as master they can see them
      const { data } = await supabase
        .from("clock_locations")
        .select("id, name, company_id")
        .eq("active", true)
        .order("name");
      if (data && data.length > 0) {
        setLocations(data);
        setSelectedLocationId(data[0].id);
      }
      setLoading(false);
    };
    loadLocations();
  }, []);

  const [countdown, setCountdown] = useState(30);

  // Generate rotating QR code every 30 seconds with countdown
  useEffect(() => {
    if (!selectedLocationId) return;

    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const window = Math.floor(nowSec / 30) * 30;
      const remaining = 30 - (nowSec - window);
      setCountdown(remaining);
      setQrValue(`CLOCK:${selectedLocationId}:${window}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [selectedLocationId]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Ponto UBS
          </h1>
        </div>
        <p className="text-4xl font-bold tabular-nums text-foreground">
          {currentTime.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {currentTime.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Main card */}
      <Card className="w-full max-w-md border-2">
        <CardContent className="flex flex-col items-center gap-4 py-6">
          {loading ? (
            <p className="text-muted-foreground py-8">Carregando locais...</p>
          ) : locations.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">
                Nenhum local de ponto cadastrado.
              </p>
              <p className="text-xs text-muted-foreground">
                Faça login como administrador e cadastre locais na aba "Relógio de Ponto".
              </p>
            </div>
          ) : (
            <>
              {/* Location selector */}
              <div className="w-full">
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Local
                </label>
                <Select
                  value={selectedLocationId}
                  onValueChange={setSelectedLocationId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o local..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* QR Code */}
              {qrValue && (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-white p-6 rounded-2xl shadow-sm">
                    <QRCodeSVG
                      value={qrValue}
                      size={280}
                      level="H"
                    />
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <div className="relative h-14 w-14">
                      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                        <circle
                          cx="28" cy="28" r="24" fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 24}
                          strokeDashoffset={2 * Math.PI * 24 * (1 - countdown / 30)}
                          className="transition-all duration-1000 ease-linear"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-foreground">
                        {countdown}
                      </span>
                    </div>
                    <Badge variant="outline" className="gap-1.5">
                      <Shield className="h-3 w-3" />
                      Novo código em {countdown}s
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground text-center">
                    Escaneie este código pelo app para registrar o ponto
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-1.5 mt-4">
        <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Mantenha esta tela aberta no tablet do local
        </p>
      </div>
    </div>
  );
}
