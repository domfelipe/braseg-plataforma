import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { location_id, qr_timestamp, selfie_base64 } = await req.json();

    if (!location_id || qr_timestamp == null) {
      return new Response(
        JSON.stringify({ error: "location_id e qr_timestamp são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate QR timestamp (must be within 60-second window)
    const nowSec = Math.floor(Date.now() / 1000);
    const diff = Math.abs(nowSec - qr_timestamp);
    if (diff > 60) {
      return new Response(
        JSON.stringify({ error: "QR Code expirado. Escaneie novamente." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user token
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida. Faça login novamente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get location
    const { data: location, error: locError } = await supabaseAdmin
      .from("clock_locations")
      .select("id, name, latitude, longitude, radius_meters, company_id")
      .eq("id", location_id)
      .eq("active", true)
      .single();

    if (locError || !location) {
      return new Response(
        JSON.stringify({ error: "Local não encontrado ou desativado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user has access to this company
    const { data: access } = await supabaseAdmin
      .from("user_company_access")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", location.company_id)
      .limit(1);

    // Also check if user is master
    const { data: masterRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .in("role", ["master", "super-admin"])
      .limit(1);

    if ((!access || access.length === 0) && (!masterRole || masterRole.length === 0)) {
      return new Response(
        JSON.stringify({ error: "Você não tem acesso a esta empresa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this QR code was already used (single-use validation)
    const { data: existingEntry } = await supabaseAdmin
      .from("clock_entries")
      .select("id")
      .eq("clock_location_id", location_id)
      .eq("notes", `qr:${qr_timestamp}`)
      .limit(1);

    if (existingEntry && existingEntry.length > 0) {
      return new Response(
        JSON.stringify({ error: "Este QR Code já foi utilizado. Aguarde o próximo código." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine next type (entrada/saida)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: lastEntry } = await supabaseAdmin
      .from("clock_entries")
      .select("type")
      .eq("company_id", location.company_id)
      .eq("user_id", user.id)
      .gte("timestamp", today.toISOString())
      .order("timestamp", { ascending: false })
      .limit(1);

    const nextType = lastEntry?.[0]?.type === "entrada" ? "saida" : "entrada";
    const now = new Date();
    const nowISO = now.toISOString();
    const todayStr = now.toISOString().split("T")[0];

    // Find matching shift_assignment for today
    let shiftAssignmentId: string | null = null;
    try {
      const { data: assignments } = await supabaseAdmin
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

    // Generate entry ID for selfie path
    const entryId = crypto.randomUUID();

    // Upload selfie if provided
    let selfieUrl: string | null = null;
    if (selfie_base64) {
      try {
        // Remove data:image/jpeg;base64, prefix
        const raw = selfie_base64.replace(/^data:image\/\w+;base64,/, "");
        const bytes = decode(raw);
        const filePath = `${location.company_id}/${user.id}/${entryId}.jpg`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("clock-selfies")
          .upload(filePath, bytes, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) {
          console.error("Selfie upload error:", uploadError);
        } else {
          selfieUrl = filePath;
        }
      } catch (e) {
        console.error("Error processing selfie:", e);
      }
    }

    // Insert clock entry
    const { error: insertError } = await supabaseAdmin.from("clock_entries").insert({
      id: entryId,
      company_id: location.company_id,
      user_id: user.id,
      type: nextType,
      timestamp: nowISO,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      distance_meters: 0,
      valid: true,
      clock_location_id: location.id,
      notes: `qr:${qr_timestamp}`,
      shift_assignment_id: shiftAssignmentId,
      selfie_url: selfieUrl,
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Erro ao registrar ponto" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        type: nextType,
        valid: true,
        distance: 0,
        locationName: location.name,
        timestamp: nowISO,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
