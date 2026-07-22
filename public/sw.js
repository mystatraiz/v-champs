/* Service worker V-Champs — notifications push + badge d'icône.
   Pas de gestion de 'fetch' : n'interfère pas avec le fonctionnement de l'app. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "V-Champs";
  const body = data.body || "Nouvelle activité";
  const count = typeof data.count === "number" ? data.count : undefined;

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: data.tag || "vchamps",
        renotify: true,
        data: { url: data.url || "/admin" },
      });
      if (count !== undefined && self.navigator && "setAppBadge" in self.navigator) {
        try {
          if (count > 0) await self.navigator.setAppBadge(count);
          else await self.navigator.clearAppBadge();
        } catch (e) {
          /* ignore */
        }
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of clients) {
        if ("focus" in c) {
          try {
            await c.navigate(url);
          } catch (e) {
            /* ignore */
          }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
