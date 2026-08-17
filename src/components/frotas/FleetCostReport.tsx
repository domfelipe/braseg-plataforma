import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Loader2, TrendingUp, DollarSign, Download, FileText, CalendarIcon } from "lucide-react";
import { format, parseISO, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Maintenance {
  id: string;
  vehicle_id: string;
  type: string;
  description: string;
  date: string;
  cost: number;
}

interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(210, 70%, 50%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(270, 60%, 55%)",
  "hsl(0, 70%, 55%)",
];

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))"];

export default function FleetCostReport() {
  const { selectedCompany } = useCompany();
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date>(startOfYear(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfYear(new Date()));

  useEffect(() => {
    if (!selectedCompany) return;
    const fetch = async () => {
      setLoading(true);
      const [mRes, vRes] = await Promise.all([
        supabase
          .from("fleet_maintenances")
          .select("id, vehicle_id, type, description, date, cost")
          .eq("company_id", selectedCompany.id)
          .order("date", { ascending: true }),
        supabase
          .from("fleet_vehicles")
          .select("id, plate, brand, model")
          .eq("company_id", selectedCompany.id)
          .order("plate"),
      ]);
      setMaintenances((mRes.data as Maintenance[]) || []);
      setVehicles((vRes.data as Vehicle[]) || []);
      setLoading(false);
    };
    fetch();
  }, [selectedCompany]);

  const vehicleMap = useMemo(() => {
    const map: Record<string, Vehicle> = {};
    vehicles.forEach((v) => (map[v.id] = v));
    return map;
  }, [vehicles]);

  const filtered = useMemo(() => {
    const fromStr = format(dateFrom, "yyyy-MM-dd");
    const toStr = format(dateTo, "yyyy-MM-dd");
    return maintenances.filter((m) => {
      if (filterVehicle !== "all" && m.vehicle_id !== filterVehicle) return false;
      if (m.date < fromStr || m.date > toStr) return false;
      return true;
    });
  }, [maintenances, filterVehicle, dateFrom, dateTo]);

  // Bar chart: monthly costs
  const monthlyData = useMemo(() => {
    const months = eachMonthOfInterval({ start: startOfMonth(dateFrom), end: endOfMonth(dateTo) });
    const map: Record<string, number> = {};
    months.forEach((m) => {
      map[format(m, "yyyy-MM")] = 0;
    });
    filtered.forEach((m) => {
      const key = m.date.substring(0, 7);
      if (map[key] !== undefined) map[key] += Number(m.cost);
    });
    return Object.entries(map).map(([month, total]) => ({
      month: format(parseISO(`${month}-01`), "MMM/yy", { locale: ptBR }),
      total,
    }));
  }, [filtered, dateFrom, dateTo]);

  // Pie chart: preventiva vs corretiva
  const typeData = useMemo(() => {
    const map: Record<string, number> = { preventiva: 0, corretiva: 0 };
    filtered.forEach((m) => {
      const t = m.type === "preventiva" ? "preventiva" : "corretiva";
      map[t] += Number(m.cost);
    });
    return [
      { name: "Preventiva", value: map.preventiva },
      { name: "Corretiva", value: map.corretiva },
    ].filter((d) => d.value > 0);
  }, [filtered]);

  // Summary table: per vehicle
  const vehicleSummary = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    filtered.forEach((m) => {
      if (!map[m.vehicle_id]) map[m.vehicle_id] = { count: 0, total: 0 };
      map[m.vehicle_id].count++;
      map[m.vehicle_id].total += Number(m.cost);
    });
    return Object.entries(map)
      .map(([vid, data]) => ({
        vehicle: vehicleMap[vid],
        ...data,
        avg: data.total / data.count,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered, vehicleMap]);

  const totalCost = vehicleSummary.reduce((s, v) => s + v.total, 0);

  const exportCSV = useCallback(() => {
    const header = "Veículo;Placa;Manutenções;Custo Total;Custo Médio\n";
    const rows = vehicleSummary.map((r) => {
      const v = r.vehicle;
      return `${v ? `${v.brand} ${v.model}` : "Removido"};${v?.plate || "-"};${r.count};${r.total.toFixed(2).replace(".", ",")};${r.avg.toFixed(2).replace(".", ",")}`;
    }).join("\n");
    const totalRow = `\nTOTAL;;;${totalCost.toFixed(2).replace(".", ",")};\n`;
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + rows + totalRow], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-custos-frotas-${format(dateFrom, "dd-MM-yyyy")}_${format(dateTo, "dd-MM-yyyy")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  }, [vehicleSummary, totalCost, dateFrom, dateTo]);

  const exportPDF = useCallback(() => {
    const companyName = selectedCompany?.trade_name || selectedCompany?.name || "";
    const vehicleLabel = filterVehicle === "all" ? "Todos os veículos" : (() => { const v = vehicleMap[filterVehicle]; return v ? `${v.plate} - ${v.brand} ${v.model}` : filterVehicle; })();

    let html = `
      <html><head><title>Relatório de Custos - Frotas</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .subtitle { font-size: 12px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-size: 12px; }
        th { background: #f5f5f5; text-align: left; }
        .right { text-align: right; }
        .center { text-align: center; }
        .total { font-weight: bold; background: #f0f7ff; }
        .section { margin-top: 24px; font-size: 14px; font-weight: bold; }
      </style></head><body>
      <h1>Relatório de Custos de Frotas</h1>
      <div class="subtitle">${companyName} — Período: ${format(dateFrom, "dd/MM/yyyy")} a ${format(dateTo, "dd/MM/yyyy")} — Veículo: ${vehicleLabel}</div>
      <p class="section">Resumo por Veículo</p>
      <table>
        <tr><th>Veículo</th><th>Placa</th><th class="center">Manutenções</th><th class="right">Custo Total</th><th class="right">Custo Médio</th></tr>`;
    vehicleSummary.forEach((r) => {
      const v = r.vehicle;
      html += `<tr><td>${v ? `${v.brand} ${v.model}` : "Removido"}</td><td>${v?.plate || "-"}</td><td class="center">${r.count}</td><td class="right">${formatCurrency(r.total)}</td><td class="right">${formatCurrency(r.avg)}</td></tr>`;
    });
    html += `<tr class="total"><td colspan="3">TOTAL</td><td class="right">${formatCurrency(totalCost)}</td><td></td></tr></table>`;

    html += `<p class="section">Evolução Mensal</p><table><tr><th>Mês</th><th class="right">Custo</th></tr>`;
    monthlyData.forEach((d) => {
      if (d.total > 0) html += `<tr><td>${d.month}</td><td class="right">${formatCurrency(d.total)}</td></tr>`;
    });
    html += `</table>`;

    if (typeData.length > 0) {
      html += `<p class="section">Distribuição por Tipo</p><table><tr><th>Tipo</th><th class="right">Valor</th></tr>`;
      typeData.forEach((d) => { html += `<tr><td>${d.name}</td><td class="right">${formatCurrency(d.value)}</td></tr>`; });
      html += `</table>`;
    }

    html += `<p style="margin-top:24px;font-size:10px;color:#999;">Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</p></body></html>`;

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.print();
    }
    toast.success("PDF gerado para impressão!");
  }, [vehicleSummary, totalCost, monthlyData, typeData, dateFrom, dateTo, filterVehicle, vehicleMap, selectedCompany]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const barChartConfig = {
    total: { label: "Custo", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6">
      {/* Filters + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterVehicle} onValueChange={setFilterVehicle}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todos os veículos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os veículos</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.plate} - {v.brand} {v.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(dateFrom, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <span className="text-sm text-muted-foreground">até</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(dateTo, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={vehicleSummary.length === 0}>
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportPDF} disabled={vehicleSummary.length === 0}>
          <FileText className="h-4 w-4 mr-1.5" /> PDF
        </Button>
      </div>

      {/* Total card */}
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <DollarSign className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm text-muted-foreground">Custo total no período</p>
            <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Evolução Mensal de Custos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={barChartConfig} className="h-[300px] w-full">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  }
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preventiva vs Corretiva</CardTitle>
          </CardHeader>
          <CardContent>
            {typeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            ) : (
              <ChartContainer config={{ preventiva: { label: "Preventiva", color: PIE_COLORS[0] }, corretiva: { label: "Corretiva", color: PIE_COLORS[1] } }} className="h-[250px] w-full">
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {typeData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo por Veículo</CardTitle>
        </CardHeader>
        <CardContent>
          {vehicleSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma manutenção encontrada no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Veículo</TableHead>
                  <TableHead className="text-center">Manutenções</TableHead>
                  <TableHead className="text-right">Custo Total</TableHead>
                  <TableHead className="text-right">Custo Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicleSummary.map((row) => (
                  <TableRow key={row.vehicle?.id || "unknown"}>
                    <TableCell>
                      {row.vehicle ? `${row.vehicle.plate} - ${row.vehicle.brand} ${row.vehicle.model}` : "Veículo removido"}
                    </TableCell>
                    <TableCell className="text-center">{row.count}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(row.avg)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
