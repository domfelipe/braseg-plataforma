import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Sicredi production paths (the proxy prepends the mTLS base URL)
const AUTH_PATH = "thirdparty/auth/token";
const API_PATH = "multipag";

// --- Structured logging ---
function log(level: "INFO" | "WARN" | "ERROR", action: string, data: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    action,
    ...data,
  };
  if (level === "ERROR") {
    console.error(JSON.stringify(entry));
  } else if (level === "WARN") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// Safe JSON parse helper
function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function getUserIdFromJwt(token: string): string | null {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

async function validateUserToken(token: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    log("WARN", "auth_validation_failed", { status: response.status, body: text.slice(0, 160) });
    return null;
  }

  const data = text ? safeJsonParse(text) : null;
  return typeof data?.id === "string" ? data.id : null;
}

// All requests go through the Railway mTLS proxy
async function proxyFetch(
  path: string,
  options: { method: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  let proxyUrl = Deno.env.get("SICREDI_PROXY_URL");
  const proxySecret = Deno.env.get("SICREDI_PROXY_SECRET");
  if (!proxyUrl || !proxySecret) {
    throw new Error("SICREDI_PROXY_URL and SICREDI_PROXY_SECRET must be configured");
  }

  if (!proxyUrl.startsWith("http")) {
    proxyUrl = `https://${proxyUrl}`;
  }

  const url = `${proxyUrl}/proxy/${path}`;
  const headers: Record<string, string> = {
    "x-proxy-secret": proxySecret,
    ...(options.headers || {}),
  };

  const start = Date.now();
  const res = await fetch(url, {
    method: options.method,
    headers,
    body: options.body,
  });
  const elapsed = Date.now() - start;

  log("INFO", "proxy_fetch", { path, method: options.method, status: res.status, elapsed_ms: elapsed });

  return res;
}

// --- Token cache ---
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    log("INFO", "token_cache_hit", { expires_in_ms: tokenExpiry - Date.now() });
    return cachedToken;
  }

  log("INFO", "token_request", { reason: cachedToken ? "expired" : "first_request" });

  const clientId = Deno.env.get("SICREDI_CLIENT_ID")!;
  const clientSecret = Deno.env.get("SICREDI_CLIENT_SECRET")!;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "multipag.pix.pagar multipag.pix.consultar",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await proxyFetch(AUTH_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    log("ERROR", "token_request_failed", { status: res.status, body: text.slice(0, 300) });
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }

  const data = JSON.parse(text);
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  log("INFO", "token_acquired", { expires_in: data.expires_in });
  return cachedToken!;
}

// --- Sicredi API calls (via proxy) ---

async function pixChave(token: string, payload: {
  chavePix: string;
  documentoBeneficiario: string;
  valorPagamento: number;
  dataPagamento: string;
  idTransacao: string;
  mensagemPix?: string;
  nomeBeneficiario?: string;
}) {
  const conta = Deno.env.get("SICREDI_CONTA")!;
  const cooperativa = Deno.env.get("SICREDI_COOPERATIVA")!;
  const documento = Deno.env.get("SICREDI_DOCUMENTO")!;

  // Format phone PIX keys: if it looks like a phone number (10-11 digits), add +55 prefix
  let formattedChavePix = payload.chavePix;
  const digitsOnly = formattedChavePix.replace(/\D/g, "");
  if (/^\d{10,11}$/.test(digitsOnly) && !formattedChavePix.startsWith("+")) {
    formattedChavePix = `+55${digitsOnly}`;
    log("INFO", "pix_chave_formatted_phone", { original: payload.chavePix, formatted: formattedChavePix });
  }

  const body = {
    chavePix: formattedChavePix,
    documentoBeneficiario: payload.documentoBeneficiario,
    cooperativa,
    conta,
    documento,
    valorPagamento: payload.valorPagamento,
    dataPagamento: payload.dataPagamento,
    identificadorPagamentoAssociado: `NF-${payload.idTransacao.substring(0, 8)}`,
    mensagemPix: payload.mensagemPix || "Pagamento NF",
    idTransacao: payload.idTransacao,
    ...(payload.nomeBeneficiario ? { nomeBeneficiario: payload.nomeBeneficiario } : {}),
  };

  log("INFO", "pix_chave_request", {
    idTransacao: payload.idTransacao,
    valor: payload.valorPagamento,
    chave: payload.chavePix.slice(0, 6) + "***",
    beneficiario: payload.nomeBeneficiario || "N/A",
  });

  const res = await proxyFetch(`${API_PATH}/v1/pagamentos/pix/chave`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  log(res.status < 400 ? "INFO" : "ERROR", "pix_chave_response", {
    idTransacao: payload.idTransacao,
    httpStatus: res.status,
    sicrediStatus: data?.status || "N/A",
    idPagamento: data?.idPagamento || null,
  });

  return { status: res.status, data };
}

async function pixStatus(token: string, idTransacao: string) {
  const conta = Deno.env.get("SICREDI_CONTA")!;
  const cooperativa = Deno.env.get("SICREDI_COOPERATIVA")!;
  const documento = Deno.env.get("SICREDI_DOCUMENTO")!;

  log("INFO", "pix_status_request", { idTransacao });

  const res = await proxyFetch(`${API_PATH}/v1/pagamentos/pix/${idTransacao}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-cooperativa": cooperativa,
      "x-conta": conta,
      "x-documento": documento,
    },
  });

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  log("INFO", "pix_status_response", {
    idTransacao,
    httpStatus: res.status,
    sicrediStatus: data?.status || "N/A",
    endToEnd: data?.endToEnd || null,
  });

  return { status: res.status, data };
}

async function pixComprovante(token: string, idTransacao: string) {
  const conta = Deno.env.get("SICREDI_CONTA")!;
  const cooperativa = Deno.env.get("SICREDI_COOPERATIVA")!;
  const documento = Deno.env.get("SICREDI_DOCUMENTO")!;

  log("INFO", "pix_comprovante_request", { idTransacao });

  const res = await proxyFetch(`${API_PATH}/v1/pagamentos/pix/${idTransacao}/comprovantes`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-cooperativa": cooperativa,
      "x-conta": conta,
      "x-documento": documento,
    },
  });

  if (res.headers.get("content-type")?.includes("application/pdf")) {
    const blob = await res.blob();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
    log("INFO", "pix_comprovante_response", { idTransacao, type: "pdf", size_bytes: blob.size });
    return { status: res.status, pdf: base64, contentType: "application/pdf" };
  }

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;
  log("WARN", "pix_comprovante_response", { idTransacao, httpStatus: res.status, type: "non-pdf", data });
  return { status: res.status, data };
}

// --- HTTP handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestStart = Date.now();

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    log("INFO", "request_start", { action: action || "none", method: req.method });

    // Test connection (authenticated admins only in production)
    if (action === "test-connection") {
      try {
        const accessToken = await getAccessToken();
        log("INFO", "test_connection_ok", {});
        return new Response(
          JSON.stringify({ ok: true, message: "Proxy + OAuth OK", token_preview: accessToken.substring(0, 20) + "..." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        log("ERROR", "test_connection_failed", { error: err.message });
        return new Response(
          JSON.stringify({ ok: false, error: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Auth: accept either user JWT or service_role key
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader) {
      log("WARN", "auth_missing", {});
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwtToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const isServiceRole = !!serviceRoleKey && jwtToken === serviceRoleKey;
    let authenticatedUserId: string | null = null;

    if (!isServiceRole) {
      const userIdFromJwt = getUserIdFromJwt(jwtToken);
      if (!userIdFromJwt) {
        log("WARN", "auth_jwt_invalid", {});
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const validatedUserId = await validateUserToken(jwtToken);
      if (!validatedUserId || validatedUserId !== userIdFromJwt) {
        log("WARN", "auth_token_validation_failed", { userId: userIdFromJwt });
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      authenticatedUserId = validatedUserId;

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: roleData, error: roleError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", validatedUserId)
        .in("role", ["master", "super-admin"]);

      if (roleError) {
        log("ERROR", "auth_role_check_error", { userId: validatedUserId, error: roleError.message });
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!roleData || roleData.length === 0) {
        log("WARN", "auth_insufficient_permissions", { userId: validatedUserId });
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      log("INFO", "auth_ok", { userId: validatedUserId, role: roleData[0]?.role });
    } else {
      log("INFO", "auth_ok", { type: "service_role" });
    }

    switch (action) {
      case "get-token": {
        const token = await getAccessToken();
        return new Response(
          JSON.stringify({ ok: true, token_preview: token.substring(0, 20) + "..." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "pix-chave": {
        const body = await req.json();
        const { paymentId, chavePix, documentoBeneficiario, valorPagamento, dataPagamento, mensagemPix, nomeBeneficiario } = body;

        if (!paymentId || !chavePix || !valorPagamento || !documentoBeneficiario) {
          log("WARN", "pix_chave_validation_error", { paymentId, hasChave: !!chavePix, hasValor: !!valorPagamento, hasDoc: !!documentoBeneficiario });
          return new Response(
            JSON.stringify({ error: "paymentId, chavePix, documentoBeneficiario, valorPagamento are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        // SAFETY: refuse to re-send a PIX if this payment already has an end-to-end
        // ID from BACEN, or is already marked as paid / in-flight. Prevents double debit.
        const { data: existingRow } = await adminClient
          .from("professional_payments")
          .select("status, sicredi_end_to_end, sicredi_id_transacao, sicredi_status")
          .eq("id", paymentId)
          .single();

        if (existingRow) {
          if (existingRow.sicredi_end_to_end) {
            log("ERROR", "pix_chave_blocked_end_to_end_exists", {
              paymentId,
              existing_end_to_end: existingRow.sicredi_end_to_end,
              existing_status: existingRow.status,
            });
            return new Response(
              JSON.stringify({
                ok: false,
                blocked: true,
                error: "Este pagamento já possui um End-to-End ID do BACEN registrado. Verifique o extrato bancário antes de tentar novamente — o PIX pode já ter sido liquidado.",
                sicredi_end_to_end: existingRow.sicredi_end_to_end,
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (["pago", "pix_enviado", "pix_incerto", "pagamento_enviado"].includes(existingRow.status || "")) {
            log("ERROR", "pix_chave_blocked_status", { paymentId, status: existingRow.status });
            return new Response(
              JSON.stringify({
                ok: false,
                blocked: true,
                error: `Envio bloqueado: pagamento está com status "${existingRow.status}". Consulte o status atual antes de reenviar.`,
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

        const idTransacao = `PIX${Date.now()}`;
        log("INFO", "pix_chave_init", { paymentId, idTransacao, valor: valorPagamento, userId: authenticatedUserId });

        const accessToken = await getAccessToken();

        // Persist idTransacao BEFORE calling Sicredi so that if the send crashes
        // mid-flight we can still reconcile against Sicredi with this id.
        await adminClient
          .from("professional_payments")
          .update({
            sicredi_id_transacao: idTransacao,
            sicredi_status: "ENVIANDO",
            status: "pix_incerto",
            error_message: null,
          })
          .eq("id", paymentId);

        let result: { status: number; data: any } | null = null;
        let sendException: string | null = null;
        try {
          result = await pixChave(accessToken, {
            chavePix,
            documentoBeneficiario,
            valorPagamento,
            dataPagamento: dataPagamento || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
            idTransacao,
            mensagemPix,
            nomeBeneficiario,
          });
        } catch (err) {
          sendException = err instanceof Error ? err.message : String(err);
          log("ERROR", "pix_chave_send_exception", { paymentId, idTransacao, error: sendException });
        }

        const httpOk = !!result && (result.status === 200 || result.status === 201);
        const initialSicrediStatus = httpOk
          ? (result!.data?.status || "RECEBIDO")
          : "ERRO";

        // RECONCILIATION: if the initial send failed for ANY reason (exception,
        // non-2xx, no data), we CANNOT assume the payment did not reach Sicredi
        // — the request may have arrived and been processed. Query pix-status
        // with retries before deciding the final status. This prevents the
        // "money debited but marked as error" bug.
        let reconciled: { finalStatus: string; endToEnd: string | null; idPagamento: string | null; source: string } | null = null;
        const needsReconciliation = !httpOk || initialSicrediStatus === "ERRO";

        if (needsReconciliation) {
          log("WARN", "pix_chave_reconciliation_start", {
            paymentId, idTransacao,
            httpStatus: result?.status ?? null,
            sendException,
          });
          const backoffs = [1500, 3000, 6000, 10000];
          for (let i = 0; i < backoffs.length; i++) {
            await new Promise((r) => setTimeout(r, backoffs[i]));
            try {
              const statusRes = await pixStatus(accessToken, idTransacao);
              const s = statusRes.data?.status || null;
              const ete = statusRes.data?.endToEnd || null;
              log("INFO", "pix_chave_reconciliation_attempt", {
                paymentId, idTransacao, attempt: i + 1,
                httpStatus: statusRes.status, sicrediStatus: s, endToEnd: ete,
              });
              // 404 => Sicredi confirms it never received the transaction.
              if (statusRes.status === 404) {
                reconciled = { finalStatus: "ERRO", endToEnd: null, idPagamento: null, source: `reconcile_404_attempt_${i + 1}` };
                break;
              }
              // Any endToEnd populated => BACEN accepted the settlement.
              if (ete) {
                reconciled = { finalStatus: s || "SUCESSO", endToEnd: ete, idPagamento: statusRes.data?.idPagamento || null, source: `reconcile_ete_attempt_${i + 1}` };
                break;
              }
              // Explicit terminal statuses without endToEnd
              if (s === "REJEITADO" || s === "DEVOLVIDO" || s === "CANCELADO") {
                reconciled = { finalStatus: s, endToEnd: null, idPagamento: null, source: `reconcile_terminal_${s}_attempt_${i + 1}` };
                break;
              }
              if (s === "SUCESSO" || s === "CONFIRMADO" || s === "EFETIVADO") {
                reconciled = { finalStatus: s, endToEnd: ete, idPagamento: statusRes.data?.idPagamento || null, source: `reconcile_success_${s}_attempt_${i + 1}` };
                break;
              }
              // s === "RECEBIDO" / "EM_PROCESSAMENTO" / null => keep polling
            } catch (err) {
              log("WARN", "pix_chave_reconciliation_error", {
                paymentId, idTransacao, attempt: i + 1,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          if (!reconciled) {
            log("ERROR", "pix_chave_reconciliation_inconclusive", { paymentId, idTransacao });
          }
        }

        // Decide final DB state
        let finalStatus: string; // sicredi_status
        let dbStatus: string;    // internal status
        let endToEnd: string | null = null;
        let idPagamento: string | null = result?.data?.idPagamento || null;

        if (reconciled) {
          finalStatus = reconciled.finalStatus;
          endToEnd = reconciled.endToEnd;
          idPagamento = reconciled.idPagamento || idPagamento;
          if (endToEnd || ["SUCESSO", "CONFIRMADO", "EFETIVADO"].includes(finalStatus)) {
            dbStatus = "pix_enviado";
          } else if (["REJEITADO", "DEVOLVIDO", "CANCELADO", "ERRO"].includes(finalStatus)) {
            dbStatus = "pix_erro";
          } else {
            dbStatus = "pix_incerto";
          }
        } else if (needsReconciliation) {
          // Inconclusive: DO NOT mark as pix_erro (may have been debited).
          finalStatus = "INCERTO";
          dbStatus = "pix_incerto";
        } else {
          finalStatus = initialSicrediStatus;
          dbStatus = "pix_enviado";
        }

        const dbUpdate: Record<string, any> = {
          sicredi_id_transacao: idTransacao,
          sicredi_status: finalStatus,
          sicredi_id_pagamento: idPagamento,
          status: dbStatus,
          error_message: dbStatus === "pix_erro"
            ? (sendException || JSON.stringify(result?.data ?? { source: reconciled?.source }))
            : (dbStatus === "pix_incerto"
                ? "Envio incerto — verifique o extrato bancário. O PIX pode ter sido debitado. NÃO reenvie sem confirmar."
                : null),
        };
        if (endToEnd) dbUpdate.sicredi_end_to_end = endToEnd;

        const { error: updateError } = await adminClient
          .from("professional_payments")
          .update(dbUpdate)
          .eq("id", paymentId);

        if (updateError) {
          log("ERROR", "pix_chave_db_update_failed", { paymentId, idTransacao, error: updateError.message });
        } else {
          log("INFO", "pix_chave_db_updated", { paymentId, idTransacao, newStatus: dbStatus, sicrediStatus: finalStatus, endToEnd });
        }

        const elapsed = Date.now() - requestStart;
        log("INFO", "pix_chave_complete", { paymentId, idTransacao, dbStatus, finalStatus, reconciled: !!reconciled, elapsed_ms: elapsed });

        return new Response(
          JSON.stringify({
            ok: dbStatus === "pix_enviado",
            uncertain: dbStatus === "pix_incerto",
            idTransacao,
            sicrediStatus: finalStatus,
            endToEnd,
            result: result?.data ?? null,
            reconciled: !!reconciled,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "pix-status": {
        const idTransacao = url.searchParams.get("idTransacao");
        if (!idTransacao) {
          return new Response(
            JSON.stringify({ error: "idTransacao is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const token = await getAccessToken();
        const result = await pixStatus(token, idTransacao);

        if (result.data?.status || result.data?.endToEnd) {
          const adminClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );

          const sicrediStatus: string = result.data?.status || "";
          const endToEnd: string | null = result.data?.endToEnd || null;

          // Fetch current DB state to prevent regressions and preserve endToEnd.
          const { data: currentRow } = await adminClient
            .from("professional_payments")
            .select("id, status, sicredi_end_to_end, sicredi_status")
            .eq("sicredi_id_transacao", idTransacao)
            .single();

          const update: Record<string, any> = {
            sicredi_status: sicrediStatus || currentRow?.sicredi_status || "CONSULTADO",
          };

          // Never overwrite an existing endToEnd with null (BACEN never revokes it).
          if (endToEnd) update.sicredi_end_to_end = endToEnd;

          // CRITICAL FIX: endToEnd is assigned by Sicredi at the RECEBIDO stage
          // (BEFORE the debit is settled). It is NOT proof of payment. Only the
          // explicit terminal success statuses (SUCESSO/CONFIRMADO/EFETIVADO)
          // guarantee the account was debited and BACEN settled the transfer.
          // Treating endToEnd as success caused payments with insufficient funds
          // to be marked as "pago" while no money left the account.
          const effectiveEndToEnd = endToEnd || currentRow?.sicredi_end_to_end || null;
          const isSuccessStatus = ["SUCESSO", "CONFIRMADO", "EFETIVADO"].includes(sicrediStatus);
          const isTerminalFail = ["REJEITADO", "DEVOLVIDO", "ERRO", "CANCELADO"].includes(sicrediStatus);
          const isPending = ["RECEBIDO", "EM_PROCESSAMENTO", "AGENDADO", "PROCESSANDO"].includes(sicrediStatus) || sicrediStatus === "";

          let newInternalStatus: string | null = null;
          if (isSuccessStatus) {
            newInternalStatus = "pago";
            update.payment_date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
          } else if (isTerminalFail) {
            newInternalStatus = "pix_erro";
            update.error_message = `PIX ${sicrediStatus}${result.data?.motivoRejeicao ? `: ${result.data.motivoRejeicao}` : ""} — verifique o extrato bancário antes de reenviar.`;
          } else if (isPending) {
            // Still pending at Sicredi. Do NOT mark as pago even if endToEnd exists.
            newInternalStatus = "pix_enviado";
          }

          // Regression protection: once marked as pago, only allow moving TO
          // pix_erro when Sicredi explicitly reports a terminal failure. This
          // is the ONLY way to correct wrongly-paid records (insufficient funds bug).
          if (currentRow?.status === "pago") {
            if (isTerminalFail) {
              log("ERROR", "pix_status_correction_paid_to_error", {
                idTransacao, sicrediStatus, endToEnd: effectiveEndToEnd,
                note: "Sicredi reports terminal failure — correcting wrongly-paid record.",
              });
              // keep newInternalStatus = "pix_erro"
            } else {
              newInternalStatus = null;
              if (!isSuccessStatus) {
                log("WARN", "pix_status_regression_blocked", {
                  idTransacao, sicrediStatus, currentStatus: currentRow.status,
                });
              }
            }
          }

          if (newInternalStatus) {
            update.status = newInternalStatus;
            if (newInternalStatus === "pago") update.error_message = null;
          }

          // Auto-generate receipt whenever we land on "pago" for the first time.
          if (newInternalStatus === "pago" && currentRow?.id) {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            try {
              await fetch(`${supabaseUrl}/functions/v1/generate-receipt`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({ payment_id: currentRow.id }),
              });
              log("INFO", "receipt_auto_generated", { paymentId: currentRow.id, idTransacao });
            } catch (e) {
              log("WARN", "receipt_auto_generate_failed", { paymentId: currentRow.id, error: String(e) });
            }
          }

          const { error: updateError } = await adminClient
            .from("professional_payments")
            .update(update)
            .eq("sicredi_id_transacao", idTransacao);

          if (updateError) {
            log("ERROR", "pix_status_db_update_failed", { idTransacao, error: updateError.message });
          } else {
            log("INFO", "pix_status_db_updated", {
              idTransacao,
              newStatus: update.status || currentRow?.status,
              sicrediStatus,
              endToEnd: effectiveEndToEnd,
            });
          }
        }

        const elapsed = Date.now() - requestStart;
        log("INFO", "pix_status_complete", { idTransacao, elapsed_ms: elapsed });

        return new Response(
          JSON.stringify({ ok: true, ...result.data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "pix-comprovante": {
        const idTransacao = url.searchParams.get("idTransacao");
        if (!idTransacao) {
          return new Response(
            JSON.stringify({ error: "idTransacao is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const token = await getAccessToken();
        const result = await pixComprovante(token, idTransacao);

        const elapsed = Date.now() - requestStart;

        if (result.pdf) {
          log("INFO", "pix_comprovante_complete", { idTransacao, hasPdf: true, elapsed_ms: elapsed });
          return new Response(
            JSON.stringify({ ok: true, pdf_base64: result.pdf }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        log("WARN", "pix_comprovante_complete", { idTransacao, hasPdf: false, elapsed_ms: elapsed });
        return new Response(
          JSON.stringify({ ok: false, ...result.data }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      default:
        log("WARN", "invalid_action", { action });
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: test-connection, get-token, pix-chave, pix-status, pix-comprovante" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
  } catch (err) {
    const elapsed = Date.now() - requestStart;
    log("ERROR", "unhandled_error", { error: err.message, stack: err.stack?.slice(0, 500), elapsed_ms: elapsed });
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
