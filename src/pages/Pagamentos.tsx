import { useEffect, useState, useRef, useCallback } from "react";
import { usePixPolling } from "@/hooks/usePixPolling";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Search, CalendarIcon, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CreditCard, Upload, Check, AlertCircle, Clock, Loader2, RefreshCw, Trash2, Pencil, X, LayoutGrid, TableIcon, MapPin, Download, FileCheck, MessageCircle, Link2 } from "lucide-react";
import PaymentsTable from "@/components/pagamentos/PaymentsTable";
import PaymentQueueDialog from "@/components/pagamentos/PaymentQueueDialog";
import PaymentsReports from "@/components/pagamentos/PaymentsReports";

import WhatsAppHistory from "@/components/pagamentos/WhatsAppHistory";
import ValidationBadge from "@/components/pagamentos/ValidationBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PAYMENT_DATE_BASE_OPTIONS, paymentRefDate, type PaymentDateBase, normalizeProfessionalLocation } from "@/lib/professionalLocation";
import { parseBRLAmount } from "@/lib/money";


const LOCATION_OPTIONS = [
  "Botucatu - PSA",
  "Botucatu - PSF",
  "Igaraçu do Tietê",
  "Mineiros do Tietê",
  "Valinhos",
] as const;
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Payment {
  id: string;
  doctor_name: string;
  doctor_company_name: string | null;
  doctor_cnpj: string | null;
  amount: number;
  nf_number: string | null;
  nf_issue_date: string | null;
  nf_description: string | null;
  nf_file_url: string | null;
  location: string | null;
  status: string;
  payment_date: string | null;
  receipt_url: string | null;
  error_message: string | null;
  created_at: string;
  sicredi_status: string | null;
  sicredi_id_transacao: string | null;
  sicredi_end_to_end: string | null;
  validation_status?: string | null;
  validation_issues?: string[] | null;
  validation_data?: any;
}

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  processando_nf: { label: "Processando NF", icon: RefreshCw, color: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400" },
  aguardando_pagamento: { label: "Aguardando Pagamento", icon: Clock, color: "bg-warning/20 text-warning-foreground border-warning/30" },
  pix_enviado: { label: "PIX Enviado", icon: Zap, color: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400" },
  pagamento_enviado: { label: "Pagamento Enviado", icon: CreditCard, color: "bg-accent/20 text-accent border-accent/30" },
  pago: { label: "Pago", icon: Check, color: "bg-success/20 text-success border-success/30" },
  pix_erro: { label: "Erro PIX", icon: AlertCircle, color: "bg-destructive/20 text-destructive border-destructive/30" },
  pix_incerto: { label: "⚠️ Verificar Extrato", icon: AlertCircle, color: "bg-amber-500/25 text-amber-700 border-amber-500/40 dark:text-amber-300 font-semibold" },
  erro: { label: "Erro", icon: AlertCircle, color: "bg-destructive/20 text-destructive border-destructive/30" },
};

const statusOrder = ["processando_nf", "aguardando_pagamento", "pix_enviado", "pagamento_enviado", "pago", "pix_incerto", "pix_erro", "erro"];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Pagamentos() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recentWebhookIds, setRecentWebhookIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [dateBase, setDateBase] = useState<PaymentDateBase>("payment");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [locationFilter, setLocationFilter] = useState("all");
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [pixSending, setPixSending] = useState<string | null>(null);

  const [manualForm, setManualForm] = useState({
    doctor_name: "",
    doctor_company_name: "",
    doctor_cnpj: "",
    amount: "",
    nf_number: "",
    nf_issue_date: "",
    nf_description: "",
    location: "",
  });
  const [analysisValidation, setAnalysisValidation] = useState<{
    status: "valida" | "invalida";
    issues: string[];
    data: any;
  } | null>(null);

  const resetForm = () => {
    setManualForm({ doctor_name: "", doctor_company_name: "", doctor_cnpj: "", amount: "", nf_number: "", nf_issue_date: "", nf_description: "", location: "" });
    setSelectedFile(null);
    setUploadedFileUrl(null);
    setAnalyzing(false);
    setEditingPayment(null);
    setAnalysisValidation(null);
  };

  const handleEdit = (payment: Payment) => {
    setEditingPayment(payment);
    setManualForm({
      doctor_name: payment.doctor_name,
      doctor_company_name: payment.doctor_company_name || "",
      doctor_cnpj: payment.doctor_cnpj || "",
      amount: String(payment.amount).replace(".", ","),
      nf_number: payment.nf_number || "",
      nf_issue_date: payment.nf_issue_date || "",
      nf_description: payment.nf_description || "",
      location: normalizeProfessionalLocation(payment.location) || "",
    });
    setUploadedFileUrl(payment.nf_file_url || null);
    setUploadDialogOpen(true);
  };

  const fetchPayments = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    const { data } = await supabase
      .from("professional_payments")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .order("created_at", { ascending: false })
      .limit(20000);

    if (data)
      setPayments(
        (data as Payment[]).map((p) => ({
          ...p,
          location: normalizeProfessionalLocation(p.location),
        })),
      );
    setLoading(false);
  }, [selectedCompany]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // Normaliza nome: remove acentos, baixa caixa, comprime espaços.
  const normalizeName = (s: string) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  // Nomes "sentinela" que NÃO são profissionais reais — sempre abrir modal.
  const isSentinelName = (s: string) => {
    const n = normalizeName(s);
    if (!n) return true;
    return (
      n.includes("processamento automatico") ||
      n.includes("aguardando identificacao") ||
      n.includes("aguardando identificação")
    );
  };

  const handleSendWhatsApp = useCallback(
    async (doctorName: string, message: string, payment?: Payment) => {
      // Abre o WhatsApp sem destinatário — o usuário seleciona o contato do médico.
      const encoded = encodeURIComponent(message);
      window.open(`https://wa.me/?text=${encoded}`, "_blank");

      // Registra histórico do envio
      if (selectedCompany) {
        try {
          await supabase.from("whatsapp_send_history").insert({
            company_id: selectedCompany.id,
            payment_id: payment?.id ?? null,
            doctor_name: doctorName,
            amount: payment?.amount ?? null,
            message_preview: message.slice(0, 300),
            status: "enviado",
            sent_by: user?.id ?? null,
          });
        } catch (err) {
          console.error("Falha ao registrar histórico WhatsApp", err);
        }
      }
    },
    [selectedCompany, user],
  );

  // Realtime subscription
  useEffect(() => {
    if (!selectedCompany) return;

    const channel = supabase
      .channel(`payments-${selectedCompany.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "professional_payments",
          filter: `company_id=eq.${selectedCompany.id}`,
        },
        (payload) => {
          const newPayment = payload.new as Payment;
          setPayments((prev) => [newPayment, ...prev]);

          // Mark as recently received via webhook
          if (newPayment.status === "processando_nf") {
            setRecentWebhookIds((prev) => new Set(prev).add(newPayment.id));
            toast({
              title: "📥 Nova NF recebida via webhook!",
              description: `NF de ${newPayment.doctor_name} está sendo processada pela IA.`,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "professional_payments",
          filter: `company_id=eq.${selectedCompany.id}`,
        },
        (payload) => {
          const updated = payload.new as Payment;
          setPayments((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p))
          );

          // Notify when processing completes
          if (payload.old && (payload.old as any).status === "processando_nf" && updated.status === "aguardando_pagamento") {
            setRecentWebhookIds((prev) => {
              const next = new Set(prev);
              next.delete(updated.id);
              return next;
            });
            toast({
              title: "✅ NF processada com sucesso!",
              description: `${updated.doctor_name} — ${formatCurrency(Number(updated.amount))}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCompany, toast]);

  // Smart PIX polling with backoff, deduplication, and max attempts
  usePixPolling({ payments, onUpdate: fetchPayments });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany) return;
    setSelectedFile(file);
    setAnalyzing(true);

    try {
      const now = new Date();
      const path = `${selectedCompany.id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("invoices").upload(path, file);
      if (uploadError) throw uploadError;
      setUploadedFileUrl(path);

      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("analyze-nf", {
        body: { fileBase64: base64, mimeType: file.type },
      });

      if (error) throw error;

      if (data?.extracted) {
        const ext = data.extracted;
        setManualForm((prev) => ({
          ...prev,
          doctor_name: ext.doctor_name || prev.doctor_name,
          doctor_company_name: ext.doctor_company_name || prev.doctor_company_name,
          doctor_cnpj: ext.doctor_cnpj || prev.doctor_cnpj,
          amount: ext.amount ? String(ext.amount).replace(".", ",") : prev.amount,
          nf_number: ext.nf_number || prev.nf_number,
          nf_issue_date: ext.nf_issue_date || prev.nf_issue_date,
          nf_description: ext.nf_description || prev.nf_description,
          location:
            normalizeProfessionalLocation(ext?.descricao?.local_identificado) ||
            prev.location,
        }));

        const v = data.validation;
        if (v?.status) {
          setAnalysisValidation({ status: v.status, issues: v.issues || [], data: ext });
        }
        if (v?.status === "invalida") {
          toast({
            title: `⚠️ NF importada com ${v.issues.length} pendência${v.issues.length === 1 ? "" : "s"}`,
            description: "Os motivos ficarão visíveis no card. Você decide se paga ou não.",
          });
        } else {
          toast({ title: "✅ NF validada com sucesso!", description: "Todos os critérios conferem." });
        }
      }
    } catch (err: any) {
      console.error("Analyze error:", err);
      toast({ title: "Erro na análise", description: err.message || "Preencha os campos manualmente.", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleManualSave = async () => {
    if (!manualForm.doctor_name || !manualForm.amount) {
      toast({ title: "Preencha nome e valor", variant: "destructive" });
      return;
    }
    const parsedAmount = parseBRLAmount(manualForm.amount);
    if (!parsedAmount.ok) {
      toast({ title: "Valor inválido", description: parsedAmount.message, variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload: Record<string, any> = {
      doctor_name: manualForm.doctor_name,
      doctor_company_name: manualForm.doctor_company_name || null,
      doctor_cnpj: manualForm.doctor_cnpj || null,
      amount: parsedAmount.value,

      nf_number: manualForm.nf_number || null,
      nf_issue_date: manualForm.nf_issue_date || null,
      nf_description: manualForm.nf_description || null,
      nf_file_url: uploadedFileUrl || null,
      location: normalizeProfessionalLocation(manualForm.location),
    };

    if (analysisValidation) {
      payload.validation_status = analysisValidation.status;
      payload.validation_issues = analysisValidation.issues;
      payload.validation_data = analysisValidation.data;
      payload.validated_at = new Date().toISOString();
    }

    let error;
    if (editingPayment) {
      ({ error } = await supabase.from("professional_payments").update(payload).eq("id", editingPayment.id));
    } else {
      ({ error } = await supabase.from("professional_payments").insert({
        ...(payload as any),
        company_id: selectedCompany!.id,
        status: "aguardando_pagamento",
        created_by: user?.id,
      } as any));
    }

    if (error) {
      const isDup =
        (error as any).code === "23505" ||
        /unique_nf_per_cnpj|duplicate key/i.test(error.message || "");
      toast({
        title: isDup ? "Nota duplicada" : "Erro ao salvar",
        description: isDup
          ? "Já existe uma nota fiscal cadastrada com este CNPJ e número para esta empresa."
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: editingPayment ? "Pagamento atualizado!" : "Nota fiscal registrada!" });
      setUploadDialogOpen(false);
      resetForm();
      fetchPayments();
    }
    setSaving(false);
  };

  const handlePayViaBank = (payment: Payment) => {
    const cleanCnpj = (payment.doctor_cnpj || "").replace(/\D/g, "");
    if (cleanCnpj) {
      navigator.clipboard.writeText(cleanCnpj);
      toast({ title: "✅ CNPJ copiado! Cole como chave PIX no internet banking." });
    } else {
      toast({ title: "⚠️ Sem CNPJ cadastrado", variant: "destructive" });
    }
    window.open("https://ibpj.sicredi.com.br/ib-view/loginpj/preauth.html", "_blank");
    supabase.from("professional_payments").update({ status: "pagamento_enviado" }).eq("id", payment.id).then(() => fetchPayments());
  };

  const handlePayViaPix = async (payment: Payment) => {
    const cleanCnpj = (payment.doctor_cnpj || "").replace(/\D/g, "");
    if (!cleanCnpj) {
      toast({ title: "⚠️ Sem CNPJ cadastrado", description: "Não é possível enviar PIX sem CNPJ.", variant: "destructive" });
      return;
    }

    // SAFETY CHECK #1: never resend when we already have a BACEN end-to-end ID.
    if ((payment as any).sicredi_end_to_end) {
      toast({
        title: "🚫 Reenvio bloqueado",
        description: "Este pagamento já possui End-to-End ID do BACEN — o PIX pode ter sido liquidado. Confirme no extrato antes de qualquer ação.",
        variant: "destructive",
      });
      return;
    }

    // SAFETY CHECK #2: for resends (already has idTransacao), force a status
    // reconciliation first. If Sicredi reports success/endToEnd, we abort.
    if (payment.sicredi_id_transacao) {
      const confirm = window.confirm(
        "Este pagamento já teve uma tentativa anterior. Vamos consultar o status atual na Sicredi antes de reenviar. Continuar?"
      );
      if (!confirm) return;
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) throw new Error("Não autenticado");
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/sicredi-multipag?action=pix-status&idTransacao=${payment.sicredi_id_transacao}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${session.access_token}`,
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        const check = await res.json();
        if (check?.endToEnd || ["SUCESSO", "CONFIRMADO", "EFETIVADO"].includes(check?.status)) {
          toast({
            title: "🚫 PIX já foi efetivado",
            description: `A tentativa anterior foi liquidada (${check.status || "com End-to-End"}). Reenvio bloqueado.`,
            variant: "destructive",
          });
          await fetchPayments();
          return;
        }
      } catch (e: any) {
        toast({
          title: "⚠️ Não foi possível confirmar o status anterior",
          description: "Reenvio bloqueado por segurança. Verifique o extrato e tente de novo.",
          variant: "destructive",
        });
        return;
      }
    }

    setPixSending(payment.id);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Não autenticado");

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/sicredi-multipag?action=pix-chave`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            paymentId: payment.id,
            chavePix: cleanCnpj,
            documentoBeneficiario: cleanCnpj,
            valorPagamento: Number(payment.amount),
            nomeBeneficiario: payment.doctor_company_name || payment.doctor_name,
            mensagemPix: `NF ${payment.nf_number || "S/N"} - ${payment.doctor_name}`,
          }),
        }
      );

      const result = await res.json();

      if (res.status === 409 || result.blocked) {
        toast({
          title: "🚫 Envio bloqueado por segurança",
          description: result.error || "O servidor bloqueou o envio para evitar débito duplicado.",
          variant: "destructive",
        });
        fetchPayments();
      } else if (result.uncertain) {
        toast({
          title: "⚠️ Status incerto — verifique o extrato!",
          description: "A Sicredi não confirmou o envio. NÃO reenvie sem antes checar o extrato bancário. O PIX pode ter sido debitado.",
          variant: "destructive",
        });
        fetchPayments();
      } else if (result.ok) {
        toast({
          title: "✅ PIX enviado com sucesso!",
          description: `Transação ${result.idTransacao} - Status: ${result.sicrediStatus}`,
        });
        // Auto-generate receipt after successful PIX
        try {
          const session2 = (await supabase.auth.getSession()).data.session;
          if (session2) {
            fetch(`https://${projectId}.supabase.co/functions/v1/generate-receipt`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session2.access_token}`,
                "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({ payment_id: payment.id }),
            }).then(r => r.json()).then(res => {
              if (res.success) {
                toast({ title: "📄 Comprovante gerado!", description: "Disponível para envio via WhatsApp." });
              }
            }).catch(() => {});
          }
        } catch {}
        fetchPayments();
      } else {
        toast({
          title: "❌ Erro ao enviar PIX",
          description: result.error || JSON.stringify(result.result),
          variant: "destructive",
        });
        fetchPayments();
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar PIX", description: err.message, variant: "destructive" });
    } finally {
      setPixSending(null);
    }
  };

  const handleCheckPixStatus = async (payment: Payment) => {
    if (!payment.sicredi_id_transacao) return;
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Não autenticado");

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/sicredi-multipag?action=pix-status&idTransacao=${payment.sicredi_id_transacao}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const result = await res.json();
      toast({
        title: `Status PIX: ${result.status || "Consultado"}`,
        description: result.endToEnd ? `End-to-End: ${result.endToEnd}` : undefined,
      });
      // Auto-generate receipt if PIX confirmed as paid
      if (result.status === "EFETIVADO" || result.status === "SUCESSO" || result.status === "pago") {
        fetch(`https://${projectId}.supabase.co/functions/v1/generate-receipt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ payment_id: payment.id }),
        }).catch(() => {});
      }
      fetchPayments();
    } catch (err: any) {
      toast({ title: "Erro ao consultar status", description: err.message, variant: "destructive" });
    }
  };

  const handleMarkPaid = async () => {
    if (!selectedPayment) return;
    setSaving(true);
    const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    await supabase.from("professional_payments").update({ status: "pago", payment_date: today }).eq("id", selectedPayment.id);
    toast({ title: "Pagamento confirmado!" });

    // Auto-generate receipt
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = (await supabase.auth.getSession()).data.session;
      if (session) {
        fetch(`https://${projectId}.supabase.co/functions/v1/generate-receipt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ payment_id: selectedPayment.id }),
        }).then(r => r.json()).then(res => {
          if (res.success) {
            toast({ title: "📄 Comprovante gerado!", description: "Disponível para envio via WhatsApp." });
          }
        }).catch(() => {});
      }
    } catch {}

    setPayDialogOpen(false);
    setSelectedPayment(null);
    fetchPayments();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!paymentToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("professional_payments").delete().eq("id", paymentToDelete.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Pagamento excluído!" });
      setPayments((prev) => prev.filter((p) => p.id !== paymentToDelete.id));
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
    setPaymentToDelete(null);
  };

  const filtered = payments.filter((p) => {
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesLocation =
      locationFilter === "all" ||
      normalizeProfessionalLocation(p.location) === normalizeProfessionalLocation(locationFilter);
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      p.doctor_name.toLowerCase().includes(q) || 
      (p.nf_number && p.nf_number.toLowerCase().includes(q)) ||
      (p.doctor_company_name && p.doctor_company_name.toLowerCase().includes(q)) ||
      (p.doctor_cnpj && p.doctor_cnpj.includes(q));
    // Base de data explícita: pagamento (padrão), emissão da NF ou importação.
    // created_at nunca é tratado como data de pagamento.
    const ref = paymentRefDate(p, dateBase);
    const fromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : null;
    const toStr = dateTo ? format(dateTo, "yyyy-MM-dd") : null;
    const matchesDate =
      (!fromStr && !toStr) ||
      (!!ref && (!fromStr || ref >= fromStr) && (!toStr || ref <= toStr));
    return matchesStatus && matchesSearch && matchesDate && matchesLocation;
  });
  const processingCount = payments.filter((p) => p.status === "processando_nf").length;

  const filteredTotals = filtered.reduce(
    (acc, p) => {
      const amount = Number(p.amount);
      acc.total += amount;
      if (p.status === "pago") acc.pago += amount;
      else if (p.status === "aguardando_pagamento") acc.aguardando += amount;
      else if (p.status === "pagamento_enviado") acc.enviado += amount;
      acc.count += 1;
      return acc;
    },
    { total: 0, pago: 0, aguardando: 0, enviado: 0, count: 0 }
  );

  if (!selectedCompany) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Pagamento de Profissionais</h1>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/30 text-xs font-semibold text-destructive uppercase tracking-wide">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
          </span>
          Produção
        </span>
      </div>
      <Tabs defaultValue="pagamentos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="historico-wpp">Histórico WhatsApp</TabsTrigger>
        </TabsList>
        <TabsContent value="pagamentos">
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {processingCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {processingCount} processando
              </span>
            </motion.div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              const url = `${window.location.origin}/enviar-nf/${selectedCompany.id}`;
              navigator.clipboard.writeText(url).then(
                () => toast({ title: "Link copiado!", description: "Compartilhe com o profissional para envio da NF." }),
                () => toast({ title: "Link de envio", description: url }),
              );
            }}
            title="Copiar link público de envio de NF para profissionais"
          >
            <Link2 className="h-4 w-4 mr-1" /> Link para médicos
          </Button>
          {payments.filter(p => p.status === "aguardando_pagamento").length > 0 && (
            <Button variant="outline" onClick={() => setQueueDialogOpen(true)}>
              <CreditCard className="h-4 w-4 mr-1" /> Processar em Lote ({payments.filter(p => p.status === "aguardando_pagamento").length})
            </Button>
          )}
        <Dialog open={uploadDialogOpen} onOpenChange={(open) => { setUploadDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-1" /> Nova Nota Fiscal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPayment ? "Editar Pagamento" : "Registrar Nota Fiscal"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-1">
              {/* File upload */}
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {analyzing ? (
                  <div className="flex items-center justify-center gap-2 text-accent">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm font-medium">Analisando NF com IA...</span>
                  </div>
                ) : selectedFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-success" />
                    <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>Trocar</Button>
                  </div>
                ) : (
                  <Button variant="ghost" onClick={() => fileInputRef.current?.click()} className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload NF (PDF/Imagem) — IA preenche automaticamente
                  </Button>
                )}
              </div>

              <div>
                <Label>Nome do Médico *</Label>
                <Input value={manualForm.doctor_name} onChange={(e) => setManualForm({ ...manualForm, doctor_name: e.target.value })} />
              </div>
              <div>
                <Label>Razão Social</Label>
                <Input value={manualForm.doctor_company_name} onChange={(e) => setManualForm({ ...manualForm, doctor_company_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>CNPJ</Label>
                  <Input value={manualForm.doctor_cnpj} onChange={(e) => setManualForm({ ...manualForm, doctor_cnpj: e.target.value })} placeholder="XX.XXX.XXX/XXXX-XX" />
                </div>
                <div>
                  <Label>Valor *</Label>
                  <Input value={manualForm.amount} onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })} placeholder="0,00" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nº da NF</Label>
                  <Input value={manualForm.nf_number} onChange={(e) => setManualForm({ ...manualForm, nf_number: e.target.value })} />
                </div>
                <div>
                  <Label>Data de Emissão</Label>
                  <Input type="date" value={manualForm.nf_issue_date} onChange={(e) => setManualForm({ ...manualForm, nf_issue_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Local</Label>
                <Select value={manualForm.location} onValueChange={(v) => setManualForm({ ...manualForm, location: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_OPTIONS.map((loc) => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={manualForm.nf_description}
                  onChange={(e) => setManualForm({ ...manualForm, nf_description: e.target.value })}
                  rows={3}
                />
              </div>
              <Button onClick={handleManualSave} className="w-full bg-accent hover:bg-accent/90" disabled={saving || analyzing}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingPayment ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <PaymentQueueDialog
        open={queueDialogOpen}
        onOpenChange={setQueueDialogOpen}
        payments={payments.filter(p => p.status === "aguardando_pagamento")}
        onRefresh={fetchPayments}
      />

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        <Button variant={statusFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("all")}>
          Todos ({payments.length})
        </Button>
        {statusOrder.map((s) => {
          const cfg = statusConfig[s];
          const count = payments.filter((p) => p.status === s).length;
          return (
            <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
              {cfg.label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Search + Date filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, razão social, CNPJ ou nº da NF..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={dateBase} onValueChange={(v) => setDateBase(v as PaymentDateBase)}>
            <SelectTrigger className="min-w-[150px] text-xs sm:text-sm" aria-label="Base de data">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_DATE_BASE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="default" className={cn("justify-start text-left font-normal min-w-[120px] sm:min-w-[140px] text-xs sm:text-sm", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 mr-2 shrink-0" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="default" className={cn("justify-start text-left font-normal min-w-[120px] sm:min-w-[140px] text-xs sm:text-sm", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 mr-2 shrink-0" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }} title="Limpar filtro de data">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Location filter + View mode toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por local" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os locais</SelectItem>
              {LOCATION_OPTIONS.map((loc) => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Visualização:</span>
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "cards" ? "default" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode("cards")}
            >
              <LayoutGrid className="h-4 w-4 mr-1" /> Cards
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode("table")}
            >
              <TableIcon className="h-4 w-4 mr-1" /> Tabela
            </Button>
          </div>
        </div>
      </div>

      {/* Totalizador */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total ({filteredTotals.count})</p>
              <p className="text-sm font-bold">{formatCurrency(filteredTotals.total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">A Pagar</p>
              <p className="text-sm font-bold text-warning">{formatCurrency(filteredTotals.aguardando)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Enviado</p>
              <p className="text-sm font-bold text-accent">{formatCurrency(filteredTotals.enviado)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Pago</p>
              <p className="text-sm font-bold text-success">{formatCurrency(filteredTotals.pago)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhum pagamento encontrado.</div>
      ) : viewMode === "table" ? (
        <PaymentsTable
          payments={filtered}
          onEdit={handleEdit}
          onDelete={(p) => { setPaymentToDelete(p as Payment); setDeleteDialogOpen(true); }}
          onPayViaBank={(p) => handlePayViaBank(p as Payment)}
          onConfirmPayment={(p) => { setSelectedPayment(p as Payment); setPayDialogOpen(true); }}
          onPayViaPix={(p) => handlePayViaPix(p as Payment)}
          onCheckPixStatus={(p) => handleCheckPixStatus(p as Payment)}
          pixSending={pixSending}
          onSendWhatsApp={handleSendWhatsApp}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((payment) => {
              const cfg = statusConfig[payment.status];
              const StatusIcon = cfg?.icon || Clock;
              const isProcessing = payment.status === "processando_nf";
              const isRecentWebhook = recentWebhookIds.has(payment.id);

              return (
                <motion.div
                  key={payment.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className={`hover:shadow-md transition-all ${
                    isProcessing ? "border-amber-500/40 shadow-amber-500/10 shadow-md" : ""
                  } ${isRecentWebhook ? "ring-2 ring-amber-500/50" : ""} ${
                    !isProcessing && payment.validation_status === "invalida"
                      ? "border-destructive/50 bg-destructive/5 shadow-destructive/10 shadow-md"
                      : ""
                  }`}>
                    <CardContent className="p-4 space-y-3">
                      {isProcessing && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            IA analisando nota fiscal...
                          </span>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm break-words">{payment.doctor_name}</h3>
                          {payment.doctor_company_name && (
                            <p className="text-xs text-muted-foreground break-words">{payment.doctor_company_name}</p>
                          )}
                        </div>
                        <Badge variant="outline" className={`shrink-0 text-[10px] whitespace-nowrap ${cfg?.color || ""}`}>
                          {isProcessing && (
                            <span className="relative flex h-2 w-2 mr-1">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                            </span>
                          )}
                          {!isProcessing && <StatusIcon className="h-3 w-3 mr-1" />}
                          {cfg?.label}
                        </Badge>
                      </div>
                      {payment.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {payment.location}
                        </p>
                      )}
                      {payment.doctor_cnpj && <p className="text-xs text-muted-foreground font-mono">{payment.doctor_cnpj}</p>}
                      {!isProcessing && payment.validation_status && (
                        <ValidationBadge
                          status={payment.validation_status}
                          issues={payment.validation_issues || []}
                          warnings={(payment as any).validation_warnings || []}
                          validationData={payment.validation_data}
                        />
                      )}
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <p className="text-lg font-bold tabular-nums">
                          {isProcessing && payment.amount === 0 ? (
                            <span className="text-muted-foreground text-sm">Aguardando extração...</span>
                          ) : (
                            formatCurrency(Number(payment.amount))
                          )}
                        </p>
                        {payment.nf_number && <span className="text-xs text-muted-foreground whitespace-nowrap">NF {payment.nf_number}</span>}
                      </div>
                      {payment.nf_issue_date && (
                        <p className="text-xs text-muted-foreground">Emissão: {new Date(payment.nf_issue_date + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                      )}
                      <div className="pt-2 border-t space-y-2">
                        {payment.status === "aguardando_pagamento" && (
                          <div className="flex gap-2">
                            {payment.doctor_cnpj && (
                              <Button
                                size="sm"
                                className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => handlePayViaPix(payment)}
                                disabled={pixSending === payment.id}
                              >
                                {pixSending === payment.id ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Zap className="h-3.5 w-3.5 mr-1" />
                                )}
                                Pagar via PIX
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => handlePayViaBank(payment)}>
                              <CreditCard className="h-3.5 w-3.5 mr-1" /> Banking
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => { setSelectedPayment(payment); setPayDialogOpen(true); }}>
                              <Check className="h-3.5 w-3.5 mr-1" /> Pago
                            </Button>
                          </div>
                        )}
                        {payment.status === "pix_enviado" && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/10 border border-blue-500/20">
                              <Zap className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                PIX enviado — {payment.sicredi_status || "Aguardando"}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => handleCheckPixStatus(payment)}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar Status
                            </Button>
                          </div>
                        )}
                        {payment.status === "pix_erro" && (
                          <div className="space-y-1">
                            <p className="text-xs text-destructive">{payment.error_message || "Erro no envio PIX"}</p>
                            {(payment as any).sicredi_end_to_end && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                                ⚠️ End-to-End BACEN registrado: {(payment as any).sicredi_end_to_end}. Confira o extrato — o PIX pode ter sido efetivado.
                              </p>
                            )}
                            <div className="flex gap-2">
                              {payment.doctor_cnpj && !(payment as any).sicredi_end_to_end && (
                                <Button
                                  size="sm"
                                  className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={() => handlePayViaPix(payment)}
                                  disabled={pixSending === payment.id}
                                >
                                  <Zap className="h-3.5 w-3.5 mr-1" /> Reenviar PIX
                                </Button>
                              )}
                              {payment.sicredi_id_transacao && (
                                <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCheckPixStatus(payment)}>
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Consultar Sicredi
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => handlePayViaBank(payment)}>
                                <CreditCard className="h-3.5 w-3.5 mr-1" /> Banking
                              </Button>
                            </div>
                          </div>
                        )}
                        {payment.status === "pix_incerto" && (
                          <div className="space-y-1 p-2 rounded-md bg-amber-500/10 border-2 border-amber-500/40">
                            <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">
                              ⚠️ Status incerto — verifique o extrato bancário antes de qualquer nova ação. O PIX pode ter sido debitado.
                            </p>
                            {payment.sicredi_id_transacao && (
                              <p className="text-[10px] text-muted-foreground">Ref: {payment.sicredi_id_transacao}</p>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => handleCheckPixStatus(payment)}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Consultar Sicredi agora
                            </Button>
                          </div>
                        )}
                        {payment.status === "pagamento_enviado" && (
                          <Button size="sm" className="w-full bg-success hover:bg-success/90 text-success-foreground text-xs" onClick={() => { setSelectedPayment(payment); setPayDialogOpen(true); }}>
                            <Upload className="h-3.5 w-3.5 mr-1" /> Confirmar Pagamento
                          </Button>
                        )}
                        {payment.status === "processando_nf" && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Processamento em andamento...
                          </p>
                        )}
                        {payment.status === "pago" && payment.payment_date && (
                          <p className="text-xs text-success">Pago em {new Date(payment.payment_date + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                        )}
                        {payment.status === "erro" && (
                          <p className="text-xs text-destructive">{payment.error_message || "Erro no processamento"}</p>
                        )}
                        <div className="flex gap-1 justify-end">
                          {payment.receipt_url && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-primary hover:text-primary shrink-0"
                                onClick={() => window.open(payment.receipt_url!, "_blank")}
                                title="Ver comprovante"
                              >
                                <FileCheck className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 shrink-0"
                                onClick={() => {
                                  const firstName = payment.doctor_name.split(" ")[0];
                                  const msg = `Olá Dra. ${firstName}, seu pagamento foi efetuado por nossa equipe financeira, segue o seu comprovante de recebimento!\n\n${payment.receipt_url}\n\nMuito obrigado!\n\nEquipe Acudir Saúde.`;
                                  handleSendWhatsApp(payment.doctor_name, msg);
                                }}
                                title="Enviar comprovante via WhatsApp"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {payment.nf_file_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                              onClick={async () => {
                                try {
                                  let storagePath = payment.nf_file_url!;
                                  const bucketPart = "/storage/v1/object/public/invoices/";
                                  if (storagePath.includes(bucketPart)) {
                                    storagePath = decodeURIComponent(storagePath.split(bucketPart)[1]);
                                  }
                                  const { data, error } = await supabase.storage.from("invoices").createSignedUrl(storagePath, 300);
                                  if (error) throw error;
                                  window.open(data.signedUrl, "_blank");
                                } catch {
                                  toast({ title: "Erro ao abrir arquivo", variant: "destructive" });
                                }
                              }}
                              title="Download NF"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {payment.status !== "processando_nf" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                              onClick={() => handleEdit(payment)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => { setPaymentToDelete(payment); setDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Confirm payment dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirmar pagamento de <strong>{formatCurrency(Number(selectedPayment?.amount || 0))}</strong> para <strong>{selectedPayment?.doctor_name}</strong>?
            </p>
            <Button onClick={handleMarkPaid} className="w-full bg-success hover:bg-success/90 text-success-foreground" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar Pagamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o pagamento de <strong>{paymentToDelete?.doctor_name}</strong> no valor de <strong>{formatCurrency(Number(paymentToDelete?.amount || 0))}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
        </TabsContent>
        <TabsContent value="relatorios">
          <PaymentsReports companyId={selectedCompany.id} />
        </TabsContent>
        <TabsContent value="historico-wpp">
          <WhatsAppHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
