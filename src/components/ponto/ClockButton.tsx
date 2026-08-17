import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { getCurrentPosition, findNearestLocation } from "@/lib/geolocation";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QrScanner } from "./QrScanner";

interface ClockResult {
  type: "entrada" | "saida";
  valid: boolean;
  distance: number;
  locationName?: string;
  timestamp: string;
}

export function ClockButton() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ClockResult | null>(null);

  // Get last entry to determine next type (entrada/saida)
  const { data: lastEntry } = useQuery({
    queryKey: ["last-clock-entry", selectedCompany?.id, user?.id],
    queryFn: async () => {
      if (!selectedCompany?.id || !user?.id) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("clock_entries")
        .select("type")
        .eq("company_id", selectedCompany.id)
        .eq("user_id", user.id)
        .gte("timestamp", today.toISOString())
        .order("timestamp", { ascending: false })
        .limit(1);

      return data?.[0] || null;
    },
    enabled: !!selectedCompany?.id && !!user?.id,
  });

  // Get active locations
  const { data: locations } = useQuery({
    queryKey: ["clock-locations-active", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await supabase
        .from("clock_locations")
        .select("id, name, latitude, longitude, radius_meters")
        .eq("company_id", selectedCompany.id)
        .eq("active", true);
      return (data || []).map((l) => ({
        ...l,
        latitude: Number(l.latitude),
        longitude: Number(l.longitude),
      }));
    },
    enabled: !!selectedCompany?.id,
  });

  const nextType: "entrada" | "saida" = lastEntry?.type === "entrada" ? "saida" : "entrada";

  const handleClockIn = async () => {
    if (!user?.id || !selectedCompany?.id) return;

    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      const nearest = findNearestLocation(pos.latitude, pos.longitude, locations || []);

    const isValid = nearest?.withinRadius ?? false;
      const now = new Date();
      const nowISO = now.toISOString();
      const todayStr = nowISO.split("T")[0];

      // Find matching shift_assignment for today
      let shiftAssignmentId: string | null = null;
      try {
        const { data: assignments } = await supabase
          .from("shift_assignments")
          .select("id, grade_id, schedule_grades!inner(start_time, end_time)")
          .eq("user_id", user.id)
          .eq("date", todayStr)
          .eq("status", "confirmado");

        if (assignments && assignments.length === 1) {
          shiftAssignmentId = assignments[0].id;
        } else if (assignments && assignments.length > 1) {
          const nowMin = now.getHours() * 60 + now.getMinutes();
          let bestDiff = Infinity;
          for (const a of assignments) {
            const grade = a.schedule_grades as any;
            const [h, m] = (grade?.start_time || "00:00").split(":").map(Number);
            const d = Math.abs(nowMin - (h * 60 + m));
            if (d < bestDiff) {
              bestDiff = d;
              shiftAssignmentId = a.id;
            }
          }
        }
      } catch (e) {
        console.error("Error finding shift assignment:", e);
      }

      const { error } = await supabase.from("clock_entries").insert({
        company_id: selectedCompany.id,
        user_id: user.id,
        type: nextType,
        timestamp: nowISO,
        latitude: pos.latitude,
        longitude: pos.longitude,
        distance_meters: nearest?.distance ?? null,
        valid: isValid,
        clock_location_id: isValid ? nearest?.locationId : null,
        shift_assignment_id: shiftAssignmentId,
      });

      if (error) throw error;

      const result: ClockResult = {
        type: nextType,
        valid: isValid,
        distance: nearest?.distance ?? 0,
        locationName: nearest?.locationName,
        timestamp: nowISO,
      };
      setLastResult(result);

      toast({
        title: isValid ? "Ponto registrado ✅" : "Ponto inválido ❌",
        description: isValid
          ? `${nextType === "entrada" ? "Entrada" : "Saída"} registrada em ${nearest?.locationName} (${nearest?.distance}m)`
          : `Você está a ${nearest?.distance ?? "?"}m do local mais próximo. Máximo permitido: ${locations?.[0]?.radius_meters ?? 50}m`,
        variant: isValid ? "default" : "destructive",
      });

      queryClient.invalidateQueries({ queryKey: ["last-clock-entry"] });
      queryClient.invalidateQueries({ queryKey: ["clock-entries-today"] });
    } catch (err: any) {
      toast({
        title: "Erro ao registrar ponto",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-2">
      <CardContent className="flex flex-col items-center gap-6 py-8">
        <div className="text-center space-y-1">
          <p className="text-4xl font-bold tabular-nums">
            {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        <Badge variant={nextType === "entrada" ? "default" : "secondary"} className="text-sm px-4 py-1">
          Próximo: {nextType === "entrada" ? "Entrada" : "Saída"}
        </Badge>

        <Button
          size="lg"
          className="h-20 w-20 rounded-full text-lg"
          onClick={handleClockIn}
          disabled={loading || !locations?.length}
        >
          {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Clock className="h-8 w-8" />}
        </Button>
        <p className="text-xs text-muted-foreground">
          {!locations?.length ? "Nenhum local cadastrado" : "Toque para bater o ponto"}
        </p>

        <div className="w-full border-t pt-4">
          <QrScanner />
        </div>

        {lastResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg w-full ${lastResult.valid ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
            {lastResult.valid ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            <div className="text-sm">
              <p className="font-medium">
                {lastResult.type === "entrada" ? "Entrada" : "Saída"} — {lastResult.valid ? "Válido" : "Inválido"}
              </p>
              <p className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {lastResult.locationName ? `${lastResult.locationName} — ` : ""}
                {lastResult.distance}m de distância
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
