import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedMimes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/jpg"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const companyId = formData.get("company_id") as string | null;
    const type = (formData.get("type") as string) || "despesa";
    const city = (formData.get("city") as string) || null;
    const description = (formData.get("description") as string) || "Comprovante";
    const amount = Number(formData.get("amount") || 0);
    const dueDate = (formData.get("due_date") as string) || null;
    const paymentDate = (formData.get("payment_date") as string) || null;
    const status = (formData.get("status") as string) || "pago";
    const notes = (formData.get("notes") as string) || null;
    const categoryName = (formData.get("category_name") as string) || null;

    if (!file || !companyId) {
      return new Response(JSON.stringify({ error: "file and company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!allowedMimes.includes(file.type)) {
      return new Response(JSON.stringify({ error: "Invalid file type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["receita", "despesa"].includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: hasAccess } = await adminClient.rpc("has_company_access", {
      _user_id: userId, _company_id: companyId,
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const filePath = `${companyId}/${year}/${month}/${Date.now()}_${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from("receipts")
      .upload(filePath, fileBuffer, { contentType: file.type });
    if (uploadError) {
      return new Response(JSON.stringify({ error: "Upload failed", details: uploadError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signedData } = await adminClient.storage
      .from("receipts")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 5);
    const fileUrl = signedData?.signedUrl || filePath;

    // Resolve category
    let categoryId: string | null = null;
    if (categoryName) {
      const { data: existingCat } = await adminClient
        .from("financial_categories")
        .select("id")
        .eq("company_id", companyId)
        .eq("type", type)
        .ilike("name", categoryName)
        .limit(1)
        .maybeSingle();
      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const { data: newCat } = await adminClient
          .from("financial_categories")
          .insert({ company_id: companyId, name: categoryName, type })
          .select("id")
          .single();
        if (newCat) categoryId = newCat.id;
      }
    }

    const today = now.toISOString().split("T")[0];
    const { data: txData, error: txError } = await adminClient
      .from("financial_transactions")
      .insert({
        company_id: companyId,
        type,
        description,
        amount: amount > 0 ? amount : 0,
        due_date: dueDate || paymentDate || today,
        payment_date: status === "pago" ? (paymentDate || dueDate || today) : paymentDate,
        status,
        city,
        attachment_url: fileUrl,
        notes,
        category_id: categoryId,
        created_by: userId,
      })
      .select("id")
      .single();

    if (txError) {
      return new Response(JSON.stringify({ error: "Insert failed", details: txError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: txData.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("save-receipt-triaged error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
