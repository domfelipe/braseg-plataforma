import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const companyId = url.searchParams.get("state"); // We pass company_id as state

    if (!code || !companyId) {
      // If no code, generate the OAuth URL
      if (req.method === "POST") {
        const body = await req.json();
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        if (!clientId) throw new Error("GOOGLE_CLIENT_ID not configured");

        const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-auth-callback`;
        const scope = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file";
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(body.company_id)}`;

        return new Response(JSON.stringify({ auth_url: authUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response("Missing code or state", { status: 400 });
    }

    // Exchange code for tokens
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-auth-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenData);
      throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
    }

    // Save tokens to database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    const { error: upsertError } = await supabase
      .from("calendar_sync_config")
      .upsert({
        company_id: companyId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        google_calendar_id: "primary",
      }, { onConflict: "company_id" });

    if (upsertError) {
      console.error("Failed to save tokens:", upsertError);
      throw new Error("Failed to save tokens");
    }

    // Redirect back to the app
    const appUrl = Deno.env.get("SITE_URL") || "https://grupoforteserv.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/integracao?google=success` },
    });
  } catch (error) {
    console.error("Error in google-auth-callback:", error);
    const appUrl = Deno.env.get("SITE_URL") || "https://grupoforteserv.lovable.app";
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/integracao?google=error&message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}` },
    });
  }
});
