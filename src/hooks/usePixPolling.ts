import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const TERMINAL_STATUSES = new Set([
  "pago", "SUCESSO", "CONFIRMADO", "EFETIVADO",
  "REJEITADO", "DEVOLVIDO", "erro", "rejeitado",
  "cancelado", "expirado", "pix_erro",
]);

const MAX_ATTEMPTS = 60;

function getDelay(attempt: number): number {
  if (attempt <= 5) return 3000;
  if (attempt <= 20) return 5000;
  return 10000;
}

interface PixPayment {
  id: string;
  doctor_name: string;
  sicredi_id_transacao: string | null;
  sicredi_end_to_end: string | null;
}

interface UsePixPollingOptions {
  payments: PixPayment[];
  onUpdate: () => void;
}

export function usePixPolling({ payments, onUpdate }: UsePixPollingOptions) {
  const activePolls = useRef<Map<string, { attempt: number; timeoutId: ReturnType<typeof setTimeout> }>>(new Map());
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const pollSingle = useCallback(async (payment: PixPayment) => {
    const txId = payment.sicredi_id_transacao!;
    const entry = activePolls.current.get(txId);
    if (!entry) return; // was cancelled

    const attempt = entry.attempt + 1;

    if (attempt > MAX_ATTEMPTS) {
      activePolls.current.delete(txId);
      toast({
        title: "⏱️ Tempo esgotado",
        description: `Polling de ${payment.doctor_name} excedeu o limite. Verifique manualmente.`,
      });
      return;
    }

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/sicredi-multipag?action=pix-status&idTransacao=${txId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey,
          },
        }
      );

      // Treat non-OK responses (429, 500, etc.) as retryable errors
      if (!res.ok) {
        const currentEntry = activePolls.current.get(txId);
        if (currentEntry) {
          currentEntry.attempt = attempt;
          // Use longer delay on rate-limit errors
          const delay = res.status === 429 ? Math.max(getDelay(attempt), 15000) : getDelay(attempt);
          currentEntry.timeoutId = setTimeout(() => pollSingle(payment), delay);
        }
        return;
      }

      const result = await res.json();

      if (result.status === "SUCESSO" || result.status === "CONFIRMADO" || result.status === "EFETIVADO") {
        activePolls.current.delete(txId);
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        await supabase
          .from("professional_payments")
          .update({
            status: "pago",
            payment_date: today,
            sicredi_status: result.status,
            sicredi_end_to_end: result.endToEnd || payment.sicredi_end_to_end,
          })
          .eq("id", payment.id);

        toast({
          title: "✅ PIX confirmado!",
          description: `Pagamento de ${payment.doctor_name} foi efetivado pelo Sicredi.`,
        });
        onUpdateRef.current();
        return;
      }

      if (result.status === "REJEITADO" || result.status === "DEVOLVIDO") {
        activePolls.current.delete(txId);
        await supabase
          .from("professional_payments")
          .update({
            status: "pix_erro",
            sicredi_status: result.status,
            error_message: `PIX ${result.status}: ${result.motivoRejeicao || ""}`.trim(),
          })
          .eq("id", payment.id);

        toast({
          title: "❌ PIX rejeitado",
          description: `Pagamento de ${payment.doctor_name}: ${result.status}`,
          variant: "destructive",
        });
        onUpdateRef.current();
        return;
      }

      if (TERMINAL_STATUSES.has(result.status)) {
        activePolls.current.delete(txId);
        return;
      }

      // Schedule next poll with backoff
      const currentEntry = activePolls.current.get(txId);
      if (currentEntry) {
        currentEntry.attempt = attempt;
        currentEntry.timeoutId = setTimeout(() => pollSingle(payment), getDelay(attempt));
      }
    } catch {
      // Schedule retry on network error
      const currentEntry = activePolls.current.get(txId);
      if (currentEntry) {
        currentEntry.attempt = attempt;
        currentEntry.timeoutId = setTimeout(() => pollSingle(payment), getDelay(attempt));
      }
    }
  }, []);

  useEffect(() => {
    const pixPayments = payments.filter(
      (p) => p.sicredi_id_transacao && (p as any).status === "pix_enviado"
    );

    // Start polling for new transactions not already being polled
    for (const payment of pixPayments) {
      const txId = payment.sicredi_id_transacao!;
      if (!activePolls.current.has(txId)) {
        // First poll starts with initial delay (not 0) to prevent burst
        const entry = { attempt: 0, timeoutId: setTimeout(() => pollSingle(payment), getDelay(0)) };
        activePolls.current.set(txId, entry);
      }
    }

    // Stop polling for transactions no longer in the pix_enviado list
    const activeTxIds = new Set(pixPayments.map(p => p.sicredi_id_transacao!));
    for (const [txId, entry] of activePolls.current.entries()) {
      if (!activeTxIds.has(txId)) {
        clearTimeout(entry.timeoutId);
        activePolls.current.delete(txId);
      }
    }
  }, [payments, pollSingle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, entry] of activePolls.current.entries()) {
        clearTimeout(entry.timeoutId);
      }
      activePolls.current.clear();
    };
  }, []);
}
