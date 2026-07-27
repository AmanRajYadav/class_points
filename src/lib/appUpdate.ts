/**
 * Manual "get me the newest build" escape hatch.
 *
 * The service worker already serves the HTML network-first and reloads itself
 * when a new build lands (see registerSW.ts and public/sw.js), so in the normal
 * case none of this is needed. It exists for the cases the automatic path
 * cannot cover:
 *
 *  - A phone still running a *pre-fix* worker. Those older workers used
 *    stale-while-revalidate for the HTML, so they hand back the old app and
 *    only notice the new one on the next launch. Until that happens the user is
 *    stuck, and no amount of pull-to-refresh helps.
 *  - An installed PWA that is never really closed. `registration.update()` on
 *    visibilitychange usually catches it, but Android WebViews are not
 *    consistent about firing that.
 *  - A flaky connection, where networkFirst silently falls back to the cached
 *    copy and the app looks fine while being days old.
 *
 * So this is a diagnostic, not the update mechanism: it throws away every cache
 * this origin holds, drops the worker, and reloads from the network.
 */

/** Build timestamp, injected at build time. */
export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "";

/** Short, human-readable stamp for the footer: "27 Jul, 17:20". */
export function buildLabel(): string {
  if (!BUILD_ID) return "dev";
  const date = new Date(BUILD_ID);
  if (Number.isNaN(date.getTime())) return "dev";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Clears every cached copy of the app and reloads from the network.
 *
 * Each step is independently guarded: if the browser refuses one of them we
 * still want the reload at the end, because a plain reload is already better
 * than nothing.
 */
export async function forceRefresh(): Promise<void> {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn("[update] could not clear caches:", err);
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
  } catch (err) {
    console.warn("[update] could not unregister the service worker:", err);
  }

  try {
    // Dropping the worker is not enough on its own. GitHub Pages serves
    // index.html with `Cache-Control: max-age=600`, so for ten minutes the
    // browser's own HTTP cache will answer the reload without asking the
    // server — handing back HTML that names the previous bundle hash. Fetching
    // with `cache: "reload"` forces a real download and overwrites that entry,
    // so the reload below picks up the new document.
    await fetch(new URL(import.meta.env.BASE_URL, window.location.origin).href, {
      cache: "reload",
    });
  } catch (err) {
    console.warn("[update] could not re-fetch the shell:", err);
  }

  window.location.reload();
}
