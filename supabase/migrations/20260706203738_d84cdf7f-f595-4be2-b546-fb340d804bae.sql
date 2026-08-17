-- Reconcile the P.G.D. PEREIRA payment that was wrongly flagged as pix_erro
-- despite having a BACEN End-to-End ID (E8119210620260706201725bpenqob6t)
-- which proves BACEN accepted and settled the PIX at 2026-07-06 20:17:25.
UPDATE public.professional_payments
   SET status = 'pago',
       payment_date = '2026-07-06',
       sicredi_status = 'SUCESSO',
       error_message = NULL,
       updated_at = now()
 WHERE id = 'c595bdc3-6970-44b1-b7a5-20943b62de1f'
   AND sicredi_end_to_end = 'E8119210620260706201725bpenqob6t';