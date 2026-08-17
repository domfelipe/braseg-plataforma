import { useState, useEffect, useCallback } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventDialog, EventFormData } from "@/components/eventos/EventDialog";
import { MonthView } from "@/components/eventos/MonthView";
import { WeekView } from "@/components/eventos/WeekView";
import { DayView } from "@/components/eventos/DayView";

interface EventRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  color: string | null;
  google_event_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type ViewMode = "month" | "week" | "day";

export default function Eventos() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const [form, setForm] = useState<EventFormData>({
    title: "", description: "", location: "",
    start_at: "", end_at: "", all_day: false, color: "",
  });

  const companyId = selectedCompany?.id;

  const { data: events = [] } = useQuery({
    queryKey: ["events", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("events").select("*").eq("company_id", companyId)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return data as EventRow[];
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel("events-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `company_id=eq.${companyId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["events", companyId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, queryClient]);

  const syncToGoogle = useCallback(async (action: string, event: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.functions.invoke("sync-calendar", {
        body: { action, event, company_id: companyId },
      });
    } catch (err) {
      console.error("Sync error:", err);
    }
  }, [companyId]);

  const saveMutation = useMutation({
    mutationFn: async (formData: EventFormData) => {
      const startAt = formData.all_day
        ? new Date(formData.start_at + "T00:00:00").toISOString()
        : new Date(formData.start_at).toISOString();
      const endAt = formData.all_day
        ? new Date(formData.end_at + "T00:00:00").toISOString()
        : new Date(formData.end_at).toISOString();
      const payload = {
        company_id: companyId!, title: formData.title,
        description: formData.description || null, location: formData.location || null,
        start_at: startAt, end_at: endAt, all_day: formData.all_day,
        color: formData.color || null, created_by: user?.id,
      };
      if (editingEvent) {
        const { data, error } = await supabase.from("events").update(payload).eq("id", editingEvent.id).select().single();
        if (error) throw error;
        await syncToGoogle("update", data);
        return data;
      } else {
        const { data, error } = await supabase.from("events").insert(payload).select().single();
        if (error) throw error;
        await syncToGoogle("create", data);
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", companyId] });
      setDialogOpen(false);
      setEditingEvent(null);
      toast({ title: editingEvent ? "Evento atualizado" : "Evento criado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar evento", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (event: EventRow) => {
      const { error } = await supabase.from("events").delete().eq("id", event.id);
      if (error) throw error;
      await syncToGoogle("delete", event);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", companyId] });
      setDialogOpen(false);
      setEditingEvent(null);
      toast({ title: "Evento excluído" });
    },
  });

  const openNewEvent = (date?: Date, hour?: number) => {
    const d = date || new Date();
    const dateStr = format(d, "yyyy-MM-dd");
    const h = hour ?? 9;
    setForm({
      title: "", description: "", location: "",
      start_at: `${dateStr}T${String(h).padStart(2, "0")}:00`,
      end_at: `${dateStr}T${String(h + 1).padStart(2, "0")}:00`,
      all_day: false, color: "",
    });
    setEditingEvent(null);
    setDialogOpen(true);
  };

  const openEditEvent = (event: EventRow) => {
    const startDate = parseISO(event.start_at);
    const endDate = parseISO(event.end_at);
    setForm({
      title: event.title, description: event.description || "", location: event.location || "",
      start_at: event.all_day ? format(startDate, "yyyy-MM-dd") : format(startDate, "yyyy-MM-dd'T'HH:mm"),
      end_at: event.all_day ? format(endDate, "yyyy-MM-dd") : format(endDate, "yyyy-MM-dd'T'HH:mm"),
      all_day: event.all_day, color: event.color || "",
    });
    setEditingEvent(event);
    setDialogOpen(true);
  };

  // Navigation
  const goBack = () => {
    if (viewMode === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };
  const goForward = () => {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };
  const goToday = () => setCurrentDate(new Date());

  const navigationLabel = () => {
    if (viewMode === "month") return format(currentDate, "MMMM yyyy", { locale: ptBR });
    if (viewMode === "week") {
      const start = format(currentDate, "d MMM", { locale: ptBR });
      return `Semana de ${start}`;
    }
    return format(currentDate, "EEEE, d 'de' MMMM yyyy", { locale: ptBR });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 md:p-8 border border-primary/20">
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <CalendarIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agenda de Eventos</h1>
              <p className="text-muted-foreground text-sm">Eventos sincronizados com Google Calendar</p>
            </div>
          </div>
          <Button onClick={() => openNewEvent()} className="gap-2 w-fit">
            <Plus className="h-4 w-4" /> Novo Evento
          </Button>
        </div>
      </div>

      {/* View Tabs + Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={goForward}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize ml-2">{navigationLabel()}</h2>
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="day">Dia</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Calendar Views */}
      {viewMode === "month" && (
        <MonthView
          currentDate={currentDate}
          events={events}
          onDayClick={(day) => openNewEvent(day)}
          onEventClick={(ev) => openEditEvent(ev as EventRow)}
        />
      )}
      {viewMode === "week" && (
        <WeekView
          currentDate={currentDate}
          events={events}
          onSlotClick={(day, hour) => openNewEvent(day, hour)}
          onEventClick={(ev) => openEditEvent(ev as EventRow)}
        />
      )}
      {viewMode === "day" && (
        <DayView
          currentDate={currentDate}
          events={events}
          onSlotClick={(hour) => openNewEvent(currentDate, hour)}
          onEventClick={(ev) => openEditEvent(ev as EventRow)}
        />
      )}

      {/* Event Dialog */}
      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        isEditing={!!editingEvent}
        onSave={() => saveMutation.mutate(form)}
        onDelete={() => editingEvent && deleteMutation.mutate(editingEvent)}
        isSaving={saveMutation.isPending}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
