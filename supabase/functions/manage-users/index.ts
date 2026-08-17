import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is master
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) throw new Error("Unauthorized");

    const { data: isMaster } = await supabaseAdmin.rpc("is_master", { _user_id: caller.id });
    if (!isMaster) throw new Error("Forbidden: master role required");

    const { action, ...payload } = await req.json();

    if (action === "create_user") {
      const { email, password, full_name, phone, role, company_ids, modules } = payload;

      let userId: string | null = null;
      let reused = false;

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        const msg = (createError.message || "").toLowerCase();
        const alreadyExists = msg.includes("already been registered") ||
          msg.includes("already exists") ||
          msg.includes("already registered") ||
          msg.includes("duplicate");

        if (!alreadyExists) throw createError;

        // Find the existing user by email (paginate to be safe)
        let foundId: string | null = null;
        for (let page = 1; page <= 20 && !foundId; page++) {
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: 200,
          });
          if (listErr) throw listErr;
          const match = list?.users?.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
          if (match) foundId = match.id;
          if (!list?.users || list.users.length < 200) break;
        }

        if (!foundId) throw createError;
        userId = foundId;
        reused = true;
      } else {
        userId = newUser.user.id;
      }

      // Ensure profile exists / update name + phone
      const profileUpdate: Record<string, unknown> = {};
      if (full_name) profileUpdate.full_name = full_name;
      if (phone) profileUpdate.phone = phone;
      if (Object.keys(profileUpdate).length > 0) {
        const { data: existingProfile } = await supabaseAdmin
          .from("user_profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        if (existingProfile) {
          await supabaseAdmin.from("user_profiles").update(profileUpdate).eq("id", userId);
        } else {
          await supabaseAdmin.from("user_profiles").insert({ id: userId, ...profileUpdate });
        }
      }

      // Assign role (skip if already has it)
      if (role) {
        const { data: existingRole } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("user_id", userId)
          .eq("role", role)
          .maybeSingle();
        if (!existingRole) {
          await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
        }
      }

      // Assign company access (upsert-like: skip duplicates)
      if (company_ids?.length) {
        const { data: existingAccess } = await supabaseAdmin
          .from("user_company_access")
          .select("company_id")
          .eq("user_id", userId);
        const existingSet = new Set((existingAccess || []).map((r: any) => r.company_id));
        const toInsert = company_ids
          .filter((cid: string) => !existingSet.has(cid))
          .map((cid: string) => ({ user_id: userId, company_id: cid, modules: modules || [] }));
        if (toInsert.length > 0) {
          await supabaseAdmin.from("user_company_access").insert(toInsert);
        }
      }

      return new Response(JSON.stringify({ user: { id: userId, email }, reused }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "batch_create_users") {
      const { users } = payload as {
        users: { email: string; password: string; full_name: string; phone?: string; role?: string }[];
      };

      const results: { email: string; status: string; error?: string }[] = [];

      for (const u of users) {
        try {
          // Check if user already exists by email
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1,
          });

          // Try to create the user
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: u.email,
            password: u.password,
            email_confirm: true,
            user_metadata: { full_name: u.full_name },
          });

          if (createError) {
            // If user already exists, skip
            if (createError.message?.includes("already been registered") || 
                createError.message?.includes("already exists")) {
              results.push({ email: u.email, status: "skipped", error: "already exists" });
              continue;
            }
            results.push({ email: u.email, status: "error", error: createError.message });
            continue;
          }

          // Update phone in profile if provided
          if (u.phone) {
            await supabaseAdmin.from("user_profiles").update({ phone: u.phone }).eq("id", newUser.user.id);
          }

          // Assign role
          if (u.role) {
            await supabaseAdmin.from("user_roles").insert({ user_id: newUser.user.id, role: u.role });
          }

          results.push({ email: u.email, status: "created" });
        } catch (err: any) {
          results.push({ email: u.email, status: "error", error: err.message });
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_user") {
      const { user_id, full_name, phone, role, company_ids, modules } = payload;

      // Update profile name and/or phone
      const profileUpdate: Record<string, unknown> = {};
      if (full_name !== undefined) profileUpdate.full_name = full_name;
      if (phone !== undefined) profileUpdate.phone = phone;
      if (Object.keys(profileUpdate).length > 0) {
        await supabaseAdmin.from("user_profiles").update(profileUpdate).eq("id", user_id);
      }

      // Update role: delete existing, insert new
      if (role) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
        await supabaseAdmin.from("user_roles").insert({ user_id, role });
      }

      // Update company access: delete existing, insert new
      if (company_ids) {
        await supabaseAdmin.from("user_company_access").delete().eq("user_id", user_id);
        if (company_ids.length > 0) {
          const accessRows = company_ids.map((cid: string) => ({
            user_id,
            company_id: cid,
            modules: modules || [],
          }));
          await supabaseAdmin.from("user_company_access").insert(accessRows);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_users") {
      const { data: profiles } = await supabaseAdmin.from("user_profiles").select("*");
      const { data: roles } = await supabaseAdmin.from("user_roles").select("*");
      const { data: access } = await supabaseAdmin.from("user_company_access").select("*");

      // Fetch emails from auth.users
      const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const emailMap: Record<string, string> = {};
      if (authUsers) {
        for (const au of authUsers) {
          emailMap[au.id] = au.email || "";
        }
      }

      // Attach email to profiles
      const profilesWithEmail = (profiles || []).map((p: any) => ({
        ...p,
        email: emailMap[p.id] || "",
      }));

      return new Response(JSON.stringify({ profiles: profilesWithEmail, roles, access }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      const { user_id } = payload;
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
