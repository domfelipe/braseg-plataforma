import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(supabase: any, config: any): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

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
    .update({ access_token: data.access_token, token_expires_at: expiresAt })
    .eq("id", config.id);

  return data.access_token;
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  // Search for existing folder
  const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) return searchData.files[0].id;

  // Create folder
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(`Failed to create folder "${name}": ${JSON.stringify(created)}`);
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { payment_id, company_id } = await req.json();
    if (!payment_id || !company_id) {
      return new Response(JSON.stringify({ error: "payment_id and company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get payment record
    const { data: payment, error: payError } = await supabase
      .from("professional_payments")
      .select("*")
      .eq("id", payment_id)
      .single();
    if (payError || !payment) throw new Error("Payment not found");
    if (!payment.nf_file_url) throw new Error("No file URL on payment");
    if (payment.drive_file_id) {
      return new Response(JSON.stringify({ success: true, drive_file_id: payment.drive_file_id, message: "Already synced" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get root folder ID from system settings (per-company, with global fallback)
    let rootFolderId: string | null = null;
    const { data: companySetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", `google_drive_root_folder_id_${company_id}`)
      .eq("is_active", true)
      .maybeSingle();
    if (companySetting?.value) {
      rootFolderId = companySetting.value;
    } else {
      const { data: globalSetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "google_drive_root_folder_id")
        .eq("is_active", true)
        .maybeSingle();
      rootFolderId = globalSetting?.value || null;
    }
    if (!rootFolderId) throw new Error("Google Drive root folder ID not configured");

    // Get Google tokens
    const { data: syncConfig } = await supabase
      .from("calendar_sync_config")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();
    if (!syncConfig?.refresh_token) throw new Error("Google not connected for this company");

    const accessToken = await refreshAccessToken(supabase, syncConfig);

    // Determine city and month folder names
    const city = payment.location || "Sem Local";
    const issueDate = payment.nf_issue_date ? new Date(payment.nf_issue_date + "T00:00:00") : new Date(payment.created_at);
    const monthFolder = `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, "0")}`;

    // Create folder structure: root > city > month
    const cityFolderId = await findOrCreateFolder(accessToken, city, rootFolderId);
    const monthFolderId = await findOrCreateFolder(accessToken, monthFolder, cityFolderId);

    // Download file from storage
    const fileUrl = payment.nf_file_url as string;
    // Extract storage path from URL
    let storagePath = fileUrl;
    const bucketUrlPart = "/storage/v1/object/public/invoices/";
    if (fileUrl.includes(bucketUrlPart)) {
      storagePath = decodeURIComponent(fileUrl.split(bucketUrlPart)[1]);
    }

    const { data: fileData, error: dlError } = await supabase.storage
      .from("invoices")
      .download(storagePath);
    if (dlError || !fileData) throw new Error(`Failed to download file: ${dlError?.message}`);

    // Determine file name
    const doctorName = (payment.doctor_name || "NF").replace(/[/\\?%*:|"<>]/g, "_");
    const nfNumber = payment.nf_number || payment_id.slice(0, 8);
    const ext = storagePath.split(".").pop() || "pdf";
    const driveFileName = `NF_${nfNumber}_${doctorName}.${ext}`;

    // Upload to Google Drive using multipart upload
    const metadata = JSON.stringify({
      name: driveFileName,
      parents: [monthFolderId],
    });

    const boundary = "drive_upload_boundary";
    const fileBuffer = await fileData.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Detect content type
    let contentType = "application/pdf";
    const extLower = ext.toLowerCase();
    if (["png"].includes(extLower)) contentType = "image/png";
    else if (["jpg", "jpeg"].includes(extLower)) contentType = "image/jpeg";
    else if (["webp"].includes(extLower)) contentType = "image/webp";

    const bodyParts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    ];

    const encoder = new TextEncoder();
    const part1 = encoder.encode(bodyParts[0]);
    const part2 = encoder.encode(bodyParts[1]);
    const ending = encoder.encode(`\r\n--${boundary}--`);

    const body = new Uint8Array(part1.length + part2.length + fileBytes.length + ending.length);
    body.set(part1, 0);
    body.set(part2, part1.length);
    body.set(fileBytes, part1.length + part2.length);
    body.set(ending, part1.length + part2.length + fileBytes.length);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`Drive upload failed: ${JSON.stringify(uploadData)}`);

    // Save drive_file_id
    await supabase
      .from("professional_payments")
      .update({ drive_file_id: uploadData.id })
      .eq("id", payment_id);

    console.log(`Synced payment ${payment_id} to Drive: ${uploadData.id}`);

    return new Response(
      JSON.stringify({ success: true, drive_file_id: uploadData.id, web_link: uploadData.webViewLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-drive error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
