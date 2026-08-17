import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  // Google sends a sync notification with X-Goog-Channel-ID header
  const isGoogleWebhook = !!req.headers.get("X-Goog-Channel-ID");

  if (req.method === "POST" && isGoogleWebhook) {
    const channelId = req.headers.get("X-Goog-Channel-ID");
    const resourceState = req.headers.get("X-Goog-Resource-State");

    console.log("Webhook received:", { channelId, resourceState });

    // For "sync" state (initial verification), just acknowledge
    if (resourceState === "sync") {
      return new Response("OK", { status: 200 });
    }

    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Find the config by channel_id
      const { data: config, error: configError } = await supabase
        .from("calendar_sync_config")
        .select("*")
        .eq("sync_channel_id", channelId)
        .single();

      if (configError || !config) {
        console.error("Config not found for channel:", channelId);
        return new Response("OK", { status: 200 });
      }

      const accessToken = await refreshAccessToken(supabase, config);
      const calendarId = config.google_calendar_id || "primary";

      // Fetch changed events using sync token
      let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&maxResults=100`;
      if (config.sync_token) {
        url += `&syncToken=${encodeURIComponent(config.sync_token)}`;
      } else {
        // Initial sync - get events from last 30 days
        const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        url += `&timeMin=${encodeURIComponent(timeMin)}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 410) {
        // Sync token expired, do full sync
        await supabase.from("calendar_sync_config").update({ sync_token: null }).eq("id", config.id);
        return new Response("OK", { status: 200 });
      }

      const data = await res.json();
      if (!res.ok) {
        console.error("Google events fetch failed:", data);
        return new Response("OK", { status: 200 });
      }

      // Process each event
      for (const gEvent of (data.items || [])) {
        const isDeleted = gEvent.status === "cancelled";

        if (isDeleted) {
          await supabase.from("events").delete().eq("google_event_id", gEvent.id).eq("company_id", config.company_id);
          continue;
        }

        const allDay = !!gEvent.start?.date;
        const startAt = allDay
          ? new Date(gEvent.start.date + "T00:00:00-03:00").toISOString()
          : gEvent.start?.dateTime;
        const endAt = allDay
          ? new Date(gEvent.end.date + "T00:00:00-03:00").toISOString()
          : gEvent.end?.dateTime;

        if (!startAt || !endAt) continue;

        const eventData = {
          company_id: config.company_id,
          title: gEvent.summary || "(Sem título)",
          description: gEvent.description || null,
          location: gEvent.location || null,
          start_at: startAt,
          end_at: endAt,
          all_day: allDay,
          google_event_id: gEvent.id,
          color: gEvent.colorId || null,
        };

        // Upsert: update if exists, insert if not
        const { data: existing } = await supabase
          .from("events")
          .select("id")
          .eq("google_event_id", gEvent.id)
          .eq("company_id", config.company_id)
          .maybeSingle();

        if (existing) {
          await supabase.from("events").update(eventData).eq("id", existing.id);
        } else {
          await supabase.from("events").insert(eventData);
        }
      }

      // Save new sync token
      if (data.nextSyncToken) {
        await supabase.from("calendar_sync_config").update({ sync_token: data.nextSyncToken }).eq("id", config.id);
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Webhook processing error:", error);
      return new Response("OK", { status: 200 }); // Always return 200 to Google
    }
  }

  // App request to setup/renew the watch channel (via supabase.functions.invoke or PUT)
  if (req.method === "POST" || req.method === "PUT") {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

      const { company_id } = await req.json();

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: config } = await supabase
        .from("calendar_sync_config")
        .select("*")
        .eq("company_id", company_id)
        .single();

      if (!config?.refresh_token) {
        return new Response(JSON.stringify({ error: "Not connected" }), { status: 400, headers: corsHeaders });
      }

      const accessToken = await refreshAccessToken(supabase, config);
      const calendarId = config.google_calendar_id || "primary";
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
      if (!watchRes.ok) throw new Error(`Watch setup failed: ${JSON.stringify(watchData)}`);

      // Also do initial sync to get events
      let eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&maxResults=250`;
      const timeMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      eventsUrl += `&timeMin=${encodeURIComponent(timeMin)}`;

      const eventsRes = await fetch(eventsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const eventsData = await eventsRes.json();

      if (eventsRes.ok && eventsData.items) {
        for (const gEvent of eventsData.items) {
          if (gEvent.status === "cancelled") continue;

          const allDay = !!gEvent.start?.date;
          const startAt = allDay
            ? new Date(gEvent.start.date + "T00:00:00-03:00").toISOString()
            : gEvent.start?.dateTime;
          const endAt = allDay
            ? new Date(gEvent.end.date + "T00:00:00-03:00").toISOString()
            : gEvent.end?.dateTime;

          if (!startAt || !endAt) continue;

          const eventPayload = {
            company_id: config.company_id,
            title: gEvent.summary || "(Sem título)",
            description: gEvent.description || null,
            location: gEvent.location || null,
            start_at: startAt,
            end_at: endAt,
            all_day: allDay,
            google_event_id: gEvent.id,
            color: gEvent.colorId || null,
          };

          const { data: existing } = await supabase
            .from("events")
            .select("id")
            .eq("google_event_id", gEvent.id)
            .eq("company_id", config.company_id)
            .maybeSingle();

          if (existing) {
            await supabase.from("events").update(eventPayload).eq("id", existing.id);
          } else {
            await supabase.from("events").insert(eventPayload);
          }
        }
      }

      // Save channel info and sync token
      await supabase.from("calendar_sync_config").update({
        sync_channel_id: channelId,
        sync_resource_id: watchData.resourceId,
        sync_expiration: new Date(parseInt(watchData.expiration)).toISOString(),
        sync_token: eventsData.nextSyncToken || config.sync_token,
      }).eq("id", config.id);

      return new Response(JSON.stringify({ success: true, channelId, expiration: watchData.expiration }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Watch setup error:", error);
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
