import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { MapPin, Plus, Pencil, Trash2, LocateFixed } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { LocationMap } from "./LocationMap";
import { getCurrentPosition } from "@/lib/geolocation";

interface LocationForm {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  radius_meters: string;
  active: boolean;
}

const emptyForm: LocationForm = {
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  radius_meters: "50",
  active: true,
};

export function LocationsManager() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: locations, isLoading } = useQuery({
    queryKey: ["clock-locations", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await supabase
        .from("clock_locations")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .order("name");
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (loc: any) => {
    setEditId(loc.id);
    setForm({
      name: loc.name,
      address: loc.address || "",
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radius_meters: String(loc.radius_meters),
      active: loc.active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedCompany?.id || !form.name || !form.latitude || !form.longitude) {
      toast({ title: "Preencha nome, latitude e longitude.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      company_id: selectedCompany.id,
      name: form.name,
      address: form.address || null,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radius_meters: parseInt(form.radius_meters) || 50,
      active: form.active,
    };

    const { error } = editId
      ? await supabase.from("clock_locations").update(payload).eq("id", editId)
      : await supabase.from("clock_locations").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar local", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editId ? "Local atualizado" : "Local criado" });
    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["clock-locations"] });
    queryClient.invalidateQueries({ queryKey: ["clock-locations-active"] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("clock_locations").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Local excluído" });
    queryClient.invalidateQueries({ queryKey: ["clock-locations"] });
    queryClient.invalidateQueries({ queryKey: ["clock-locations-active"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Locais Autorizados
        </CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo Local
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !locations?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum local cadastrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Raio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc) => (
                <TableRow key={loc.id}>
                  <TableCell className="font-medium">{loc.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{loc.address || "—"}</TableCell>
                  <TableCell>{loc.radius_meters}m</TableCell>
                  <TableCell>
                    <Badge variant={loc.active ? "default" : "secondary"}>
                      {loc.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(loc)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir local?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Os registros de ponto vinculados serão mantidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(loc.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Local" : "Novo Local"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Clínica Centro" />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, cidade" />
            </div>
          <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Clique no mapa ou use sua localização atual</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const pos = await getCurrentPosition();
                      setForm({ ...form, latitude: String(pos.latitude), longitude: String(pos.longitude) });
                    } catch (err: any) {
                      toast({ title: "Erro ao obter localização", description: err.message, variant: "destructive" });
                    }
                  }}
                >
                  <LocateFixed className="h-4 w-4 mr-1" /> Minha localização
                </Button>
              </div>
              <LocationMap
                latitude={form.latitude ? parseFloat(form.latitude) : null}
                longitude={form.longitude ? parseFloat(form.longitude) : null}
                radius={parseInt(form.radius_meters) || 50}
                onPositionChange={(lat, lng) => {
                  setForm({ ...form, latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Latitude *</Label>
                <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="-23.5505" />
              </div>
              <div className="space-y-2">
                <Label>Longitude *</Label>
                <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="-46.6333" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Raio (metros)</Label>
              <Input type="number" value={form.radius_meters} onChange={(e) => setForm({ ...form, radius_meters: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Local ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
