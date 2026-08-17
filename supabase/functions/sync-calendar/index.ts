import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshAccessToken(supabase: any, config: any): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  // Check if token is still valid
  if (config.token_expires_at && new Date(config.token_expires_at) > new Date(Date.now() + 60000)) {
    return config.access_token;
  }

  // Refresh the token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${data.error_description || data.error}`);

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  await supabase
    .from("calendar_sync_config")
    .update({
      access_token: data.access_token,
      token_expires_at: expiresAt,
    })
    .eq("id", config.id);

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, event, company_id } = await req.json();

    // Get sync config
    const { data: config, error: configError } = await supabase
      .from("calendar_sync_config")
      .select("*")
      .eq("company_id", company_id)
      .single();

    if (configError || !config?.refresh_token) {
      return new Response(JSON.stringify({ error: "Google Calendar não conectado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await refreshAccessToken(supabase, config);
    const calendarId = config.google_calendar_id || "primary";
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const toGoogleEvent = (e: any) => ({
      summary: e.title,
      description: e.description || "",
      location: e.location || "",
      start: e.all_day
        ? { date: e.start_at.split("T")[0] }
        : { dateTime: e.start_at, timeZone: "America/Sao_Paulo" },
      end: e.all_day
        ? { date: e.end_at.split("T")[0] }
        : { dateTime: e.end_at, timeZone: "America/Sao_Paulo" },
      colorId: e.color || undefined,
    });

    let result: any = {};

    if (action === "create") {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(toGoogleEvent(event)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Google API error [${res.status}]: ${JSON.stringify(data)}`);

      // Update local event with google_event_id
      await supabase
        .from("events")
        .update({ google_event_id: data.id })
        .eq("id", event.id);

      result = { google_event_id: data.id };

    } else if (action === "update") {
      if (!event.google_event_id) {
        // Event doesn't exist on Google yet, create it
        const res = await fetch(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(toGoogleEvent(event)),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Google API error [${res.status}]: ${JSON.stringify(data)}`);

        await supabase.from("events").update({ google_event_id: data.id }).eq("id", event.id);
        result = { google_event_id: data.id };
      } else {
        const res = await fetch(`${baseUrl}/${event.google_event_id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(toGoogleEvent(event)),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Google API error [${res.status}]: ${JSON.stringify(data)}`);
        result = { updated: true };
      }

    } else if (action === "delete") {
      if (event.google_event_id) {
        const res = await fetch(`${baseUrl}/${event.google_event_id}`, {
          method: "DELETE",
          headers,
        });
        if (!res.ok && res.status !== 404) {
          const data = await res.text();
          throw new Error(`Google API error [${res.status}]: ${data}`);
        }
      }
      result = { deleted: true };

    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in sync-calendar:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
