import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import React from "https://esm.sh/react@18.2.0";
import { renderToStaticMarkup } from "https://esm.sh/react-dom@18.2.0/server";
import satori from "https://esm.sh/satori@0.10.9";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  const date = new Date(d + "T12:00:00");
  return date.toLocaleDateString("pt-BR");
}

function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function buildReceiptSvgMarkup(payment: any, company: any, sicrediLogoBase64?: string): any {
  // Force GMT-3 (Brasília)
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000 + new Date().getTimezoneOffset() * 60 * 1000);
  const emissionDate = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
  const emissionTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const details: { label: string; value: string }[] = [];
  if (payment.payment_date) details.push({ label: "Data do Pagamento", value: formatDate(payment.payment_date) });
  if (payment.nf_number) details.push({ label: "Nota Fiscal", value: payment.nf_number });
  if (payment.nf_issue_date) details.push({ label: "Emissão NF", value: formatDate(payment.nf_issue_date) });
  if (payment.location) details.push({ label: "Local", value: payment.location });
  if (payment.sicredi_end_to_end) details.push({ label: "End-to-End ID", value: payment.sicredi_end_to_end });
  if (payment.sicredi_id_transacao) details.push({ label: "ID Transação", value: payment.sicredi_id_transacao });

  const beneficiaryRows: { label: string; value: string }[] = [
    { label: "Nome", value: payment.doctor_name },
  ];
  if (payment.doctor_company_name) beneficiaryRows.push({ label: "Razão Social", value: payment.doctor_company_name });
  if (payment.doctor_cnpj) beneficiaryRows.push({ label: "CNPJ", value: formatCnpj(payment.doctor_cnpj) });

  const logoH = sicrediLogoBase64 ? 46 : 0;
  const headerH = 120 + logoH;
  const amountBoxH = 110;
  const sectionTitleH = 30;
  const rowH = 28;
  const dividerH = 20;
  const footerH = 80;
  const padding = 40;

  const beneficiaryH = sectionTitleH + beneficiaryRows.length * rowH;
  const detailsH = sectionTitleH + details.length * rowH;
  const totalH = headerH + padding + amountBoxH + dividerH + beneficiaryH + dividerH + detailsH + dividerH + footerH + padding;

  const width = 480;

  const e = React.createElement;

  const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) =>
    e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" } },
      e("span", { style: { fontSize: 13, color: "#6b7280" } }, label),
      e("span", { style: { fontSize: 13, fontWeight: 600, color: "#1a1a2e", fontFamily: mono ? "monospace" : "sans-serif", maxWidth: 260, textAlign: "right" as const, wordBreak: "break-all" as const } }, value)
    );

  return {
    element: e("div", {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width,
        height: totalH,
        backgroundColor: "#ffffff",
        borderRadius: 16,
        overflow: "hidden",
        fontFamily: "sans-serif",
      }
    },
      // Header
      e("div", {
        style: {
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #16a34a, #15803d)",
          color: "#ffffff",
          padding: "24px 20px",
          textAlign: "center" as const,
        }
      },
        ...(sicrediLogoBase64 ? [
          e("div", {
            style: {
              width: 260,
              height: 46,
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }
          },
            e("img", {
              src: sicrediLogoBase64,
              width: 260,
              height: 46,
              style: { objectFit: "contain" }
            })
          ),
        ] : []),
        e("div", { style: { fontSize: 16, fontWeight: 700, letterSpacing: 1 } }, "COMPROVANTE DE PAGAMENTO"),
        e("div", { style: { fontSize: 12, opacity: 0.85, marginTop: 4 } }, "Transferência realizada com sucesso"),
      ),

      // Body
      e("div", { style: { display: "flex", flexDirection: "column" as const, padding: "20px 24px" } },
        // Amount box
        e("div", {
          style: {
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            padding: "16px 20px",
            background: "#f0fdf4",
            borderRadius: 12,
            border: "1px solid #bbf7d0",
            marginBottom: 16,
          }
        },
          e("div", { style: { fontSize: 11, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4 } }, "Valor pago"),
          e("div", { style: { fontSize: 30, fontWeight: 800, color: "#16a34a" } }, formatCurrency(Number(payment.amount))),
          e("div", {
            style: {
              display: "flex",
              marginTop: 6,
              padding: "3px 14px",
              borderRadius: 20,
              background: "#dcfce7",
              color: "#166534",
              fontSize: 11,
              fontWeight: 700,
            }
          }, "PAGO"),
        ),

        // Beneficiary
        e("div", { style: { display: "flex", flexDirection: "column" as const } },
          e("div", { style: { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "#9ca3af", letterSpacing: 1, marginBottom: 8 } }, "Beneficiário"),
          ...beneficiaryRows.map((r) =>
            e(Row, { key: r.label, label: r.label, value: r.value, mono: r.label === "CNPJ" })
          ),
        ),

        // Divider
        e("div", { style: { height: 1, background: "#e5e7eb", margin: "12px 0" } }),

        // Details
        e("div", { style: { display: "flex", flexDirection: "column" as const } },
          e("div", { style: { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "#9ca3af", letterSpacing: 1, marginBottom: 8 } }, "Detalhes do Pagamento"),
          ...details.map((r) =>
            e(Row, { key: r.label, label: r.label, value: r.value, mono: r.label.includes("End-to-End") || r.label.includes("Transação") })
          ),
        ),

        // Divider
        e("div", { style: { height: 1, background: "#e5e7eb", margin: "12px 0" } }),

        // Footer
        e("div", { style: { display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "8px 0" } },
          e("div", { style: { fontSize: 13, fontWeight: 700, color: "#374151" } }, company.trade_name || company.name),
          e("div", { style: { fontSize: 11, color: "#9ca3af", marginTop: 2 } }, `CNPJ: ${formatCnpj(company.cnpj)}`),
          e("div", { style: { fontSize: 10, color: "#d1d5db", marginTop: 6 } }, `Emitido em ${emissionDate} às ${emissionTime}`),
        ),
      ),
    ),
    width,
    height: totalH,
  };
}

// Convert SVG string to PNG
async function svgToPng(svg: string, width: number): Promise<Uint8Array> {
  const { render } = await import("https://deno.land/x/resvg_wasm@0.2.0/mod.ts");
  const png = await render(svg);
  return png;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { payment_id } = await req.json();
    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment + company in parallel
    const [paymentRes, ] = await Promise.all([
      adminClient.from("professional_payments").select("*").eq("id", payment_id).single(),
    ]);

    if (paymentRes.error || !paymentRes.data) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = paymentRes.data;

    const { data: company } = await adminClient
      .from("companies")
      .select("*")
      .eq("id", payment.company_id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load font + Sicredi logo in parallel
    const [fontResponse, fontBoldResponse] = await Promise.all([
      fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff"),
      fetch("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff"),
    ]);
    const fontData = await fontResponse.arrayBuffer();
    const fontBoldData = await fontBoldResponse.arrayBuffer();

    // Load Sicredi logo from storage
    let sicrediLogoBase64: string | undefined;
    try {
      const { data: logoData } = await adminClient.storage.from("receipts").download("sicredi-logo-white.png");
      if (logoData) {
        const logoBytes = new Uint8Array(await logoData.arrayBuffer());
        const base64 = btoa(String.fromCharCode(...logoBytes));
        sicrediLogoBase64 = `data:image/png;base64,${base64}`;
      }
    } catch {
      // Logo is optional
    }

    // Build receipt markup and render to SVG
    const { element, width, height } = buildReceiptSvgMarkup(payment, company, sicrediLogoBase64);

    const svg = await satori(element, {
      width,
      height,
      fonts: [
        { name: "sans-serif", data: fontData, weight: 400, style: "normal" },
        { name: "sans-serif", data: fontBoldData, weight: 700, style: "normal" },
      ],
    });

    // Convert SVG to PNG
    const pngBytes = await svgToPng(svg, width * 2); // 2x for retina

    // Upload PNG to storage
    const filePath = `${payment.company_id}/receipts/${payment_id}_${Date.now()}.png`;
    const { error: uploadError } = await adminClient.storage
      .from("receipts")
      .upload(filePath, pngBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload receipt", details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create signed URL (5 years)
    const { data: signedData } = await adminClient.storage
      .from("receipts")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 5);

    const receiptUrl = signedData?.signedUrl || filePath;

    // Update payment with receipt URL
    await adminClient
      .from("professional_payments")
      .update({ receipt_url: receiptUrl })
      .eq("id", payment_id);

    return new Response(
      JSON.stringify({ success: true, receipt_url: receiptUrl, payment_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
