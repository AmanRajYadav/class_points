/**
 * Service-worker lifecycle.
 *
 * Two rules, both of which the previous setup broke:
 *  1. Never run a service worker in dev. It sat in front of Vite's module
 *     graph and served yesterday's modules on refresh.
 *  2. When a new build is deployed, take it over immediately instead of
 *     waiting for every tab to close.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  if (!import.meta.env.PROD) {
    // Tear down anything a previous build left registered on this origin,
    // otherwise a stale worker keeps intercepting the dev server.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
    if (window.caches) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Ask the browser to look for a new worker whenever the tab is
        // brought back to the foreground.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update();
        });

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // A new worker is ready and an old one is in control: activate the
            // new build and reload once so the user is never left on stale code.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch((err) => console.error("[Service Worker] Registration failed:", err));

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
