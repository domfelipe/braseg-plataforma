// Service Worker for Web Push Notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || "",
      icon: data.icon || "/favicon.png",
      badge: data.badge || "/favicon.png",
      data: data.data || {},
      vibrate: [200, 100, 200],
      tag: "notification-" + Date.now(),
      renotify: true,
    };

    event.waitUntil(self.registration.showNotification(data.title || "Grupo Forte", options));
  } catch (e) {
    // Fallback for plain text
    event.waitUntil(
      self.registration.showNotification("Grupo Forte", {
        body: event.data.text(),
        icon: "/favicon.png",
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link;
  const url = link || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
