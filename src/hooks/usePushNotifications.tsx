import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC_KEY = "BKOgoWr6DMm8nKkcxO3Lhcf6HnrhJCBtrmTd8CDp513dvJc8Tf95-q-mSFx229HIzqHDDetnUmU9yKMg2N3iMm8";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushNotifications() {
  const { session } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Check if already subscribed
  useEffect(() => {
    if (!isSupported || !session?.user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          setIsSubscribed(!!sub);
        }
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, [isSupported, session?.user?.id]);

  const subscribe = useCallback(async () => {
    if (!session?.user?.id || !isSupported) return false;
    setLoading(true);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return false;
      }

      // Use the PWA service worker (already registered by vite-plugin-pwa)
      const reg = await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions" as any).upsert(
        {
          user_id: session.user.id,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
        { onConflict: "user_id,endpoint" }
      );

      if (error) throw error;

      // Also update notification_preferences to reflect push_enabled
      await supabase
        .from("user_profiles")
        .update({
          notification_preferences: {
            ...(await getCurrentPrefs()),
            push_enabled: true,
          } as any,
        })
        .eq("id", session.user.id);

      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Push subscribe error:", err);
      setLoading(false);
      return false;
    }
  }, [session?.user?.id, isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);

    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await supabase
            .from("push_subscriptions" as any)
            .delete()
            .eq("user_id", session.user.id)
            .eq("endpoint", sub.endpoint);
        }
      }

      await supabase
        .from("user_profiles")
        .update({
          notification_preferences: {
            ...(await getCurrentPrefs()),
            push_enabled: false,
          } as any,
        })
        .eq("id", session.user.id);

      setIsSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe error:", err);
    }
    setLoading(false);
  }, [session?.user?.id]);

  async function getCurrentPrefs(): Promise<Record<string, boolean>> {
    if (!session?.user?.id) return {};
    const { data } = await supabase
      .from("user_profiles")
      .select("notification_preferences")
      .eq("id", session.user.id)
      .single();
    return (data?.notification_preferences as Record<string, boolean>) || {};
  }

  return { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe };
}
