import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Web Push crypto helpers using Web Crypto API
async function generatePushPayload(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
) {
  const encoder = new TextEncoder();

  // Import subscriber keys
  const p256dhRaw = base64urlToUint8Array(subscription.p256dh);
  const authSecret = base64urlToUint8Array(subscription.auth);

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    p256dhRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberKey },
    localKeyPair.privateKey,
    256
  );

  // Export local public key
  const localPublicKeyRaw = await crypto.subtle.exportKey(
    "raw",
    localKeyPair.publicKey
  );

  // Build encryption context
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF-based key derivation (RFC 8291)
  const authInfo = encoder.encode("Content-Encoding: auth\0");
  const prkKey = await crypto.subtle.importKey(
    "raw",
    authSecret,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  // IKM = HKDF(auth_secret, shared_secret, "Content-Encoding: auth\0", 32)
  const ikmHkdf = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(sharedSecret),
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: authSecret, info: authInfo },
      ikmHkdf,
      256
    )
  );

  // Key info and nonce info for aes128gcm
  const keyInfo = concatUint8Arrays(
    encoder.encode("Content-Encoding: aes128gcm\0"),
    new Uint8Array(0)
  );
  const nonceInfo = concatUint8Arrays(
    encoder.encode("Content-Encoding: nonce\0"),
    new Uint8Array(0)
  );

  const prkForKey = await crypto.subtle.importKey(
    "raw",
    ikm,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const contentKey = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info: keyInfo },
      prkForKey,
      128
    )
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
      prkForKey,
      96
    )
  );

  // Encrypt payload
  const paddedPayload = concatUint8Arrays(
    encoder.encode(payload),
    new Uint8Array([2]) // delimiter
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    paddedPayload
  );

  // Build aes128gcm body: salt(16) + rs(4) + idlen(1) + keyid(65) + encrypted
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const localPubBytes = new Uint8Array(localPublicKeyRaw);
  const idlen = new Uint8Array([localPubBytes.length]);

  const body = concatUint8Arrays(
    salt,
    rs,
    idlen,
    localPubBytes,
    new Uint8Array(encrypted)
  );

  // Generate VAPID JWT
  const vapidToken = await generateVapidJwt(
    subscription.endpoint,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject
  );

  return { body, vapidToken, localPublicKeyRaw: localPubBytes };
}

async function generateVapidJwt(
  audience: string,
  publicKey: string,
  privateKey: string,
  subject: string
) {
  const url = new URL(audience);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp, sub: subject };

  const headerB64 = uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadB64 = uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import VAPID private key for signing
  const privKeyBytes = base64urlToUint8Array(privateKey);
  const pubKeyBytes = base64urlToUint8Array(publicKey);

  // Build JWK
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: uint8ArrayToBase64url(pubKeyBytes.slice(1, 33)),
    y: uint8ArrayToBase64url(pubKeyBytes.slice(33, 65)),
    d: uint8ArrayToBase64url(privKeyBytes),
  };

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER-like signature to raw r||s format (already raw from WebCrypto)
  const sigB64 = uint8ArrayToBase64url(new Uint8Array(signature));
  return `${unsignedToken}.${sigB64}`;
}

function base64urlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { notification_id } = await req.json();
    if (!notification_id) {
      return new Response(JSON.stringify({ error: "notification_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the notification
    const { data: notification, error: notifErr } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", notification_id)
      .single();

    if (notifErr || !notification) {
      return new Response(JSON.stringify({ error: "Notification not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user notification preferences
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("notification_preferences")
      .eq("id", notification.user_id)
      .single();

    const prefs = (profile?.notification_preferences as Record<string, boolean>) || {};
    const notifType = notification.type as string;

    // If user has explicitly disabled this notification type, skip push
    if (prefs[notifType] === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "user_preference" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if push is enabled in preferences
    if (prefs.push_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "push_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's push subscriptions
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", notification.user_id);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushPayload = JSON.stringify({
      title: notification.title,
      body: notification.message,
      icon: "/favicon.png",
      badge: "/favicon.png",
      data: { link: notification.link },
    });

    const results: { endpoint: string; status: number }[] = [];
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        const { body, vapidToken } = await generatePushPayload(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          pushPayload,
          vapidPublicKey,
          vapidPrivateKey,
          `mailto:contato@grupoforteservicos.com.br`
        );

        const resp = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Encoding": "aes128gcm",
            Authorization: `vapid t=${vapidToken}, k=${vapidPublicKey}`,
            TTL: "86400",
            Urgency: "high",
          },
          body,
        });

        results.push({ endpoint: sub.endpoint, status: resp.status });

        // 404 or 410 means subscription expired
        if (resp.status === 404 || resp.status === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      } catch (err) {
        console.error("Push send error:", err);
        results.push({ endpoint: sub.endpoint, status: 0 });
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return new Response(JSON.stringify({ sent: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
