import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(supabase: any, config: any): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  if (config.token_expires_at && new Date(config.token_expires_at) > new Date(Date.now() + 60000)) {
    return config.access_token;
  }

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
  if (!res.ok) throw new Error(`Token refresh failed: ${data.error}`);

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await supabase.from("calendar_sync_config").update({
    access_token: data.access_token,
    token_expires_at: expiresAt,
  }).eq("id", config.id);

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all configs that have a refresh_token (i.e. connected)
    const { data: configs, error } = await supabase
      .from("calendar_sync_config")
      .select("*")
      .not("refresh_token", "is", null);

    if (error) throw error;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: "No configs to renew" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const config of configs) {
      try {
        // Check if expiration is within 2 days or already expired
        const expiration = config.sync_expiration ? new Date(config.sync_expiration) : null;
        const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

        if (expiration && expiration > twoDaysFromNow) {
          results.push({ company_id: config.company_id, status: "skipped", reason: "not expiring soon" });
          continue;
        }

        const accessToken = await refreshAccessToken(supabase, config);
        const calendarId = config.google_calendar_id || "primary";

        // Stop existing watch if we have one
        if (config.sync_channel_id && config.sync_resource_id) {
          try {
            await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id: config.sync_channel_id,
                resourceId: config.sync_resource_id,
              }),
            });
          } catch (e) {
            console.log("Stop channel failed (may already be expired):", e);
          }
        }

        // Create new watch
        const channelId = crypto.randomUUID();
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/calendar-webhook`;

        const watchRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: channelId,
              type: "web_hook",
              address: webhookUrl,
            }),
          }
        );

        const watchData = await watchRes.json();
        if (!watchRes.ok) throw new Error(`Watch failed: ${JSON.stringify(watchData)}`);

        await supabase.from("calendar_sync_config").update({
          sync_channel_id: channelId,
          sync_resource_id: watchData.resourceId,
          sync_expiration: new Date(parseInt(watchData.expiration)).toISOString(),
        }).eq("id", config.id);

        results.push({ company_id: config.company_id, status: "renewed", channelId });
      } catch (err) {
        console.error(`Error renewing for company ${config.company_id}:`, err);
        results.push({ company_id: config.company_id, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Renew error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
