// Service worker registration powered by vite-plugin-pwa (Workbox).
// The generated /sw.js precaches ALL build assets and uses a Cache-First
// strategy, so returning users boot fully offline.
//
// We keep this thin wrapper so:
//  - Lovable preview iframes never register a SW (prevents stale shells)
//  - Updates apply automatically via skipWaiting + clientsClaim
//  - We reload at most ONCE per session to avoid loops

const SESSION_RELOAD_FLAG = "__sw_session_reload_done__";

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com") ||
    window.location.hostname.includes("lovable.app"));

const hasReloadedThisSession = () => {
  try {
    return sessionStorage.getItem(SESSION_RELOAD_FLAG) === "1";
  } catch {
    return true;
  }
};

const markReloadedThisSession = () => {
  try {
    sessionStorage.setItem(SESSION_RELOAD_FLAG, "1");
  } catch {}
};

export const registerServiceWorker = async () => {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Don't register in Lovable preview / iframes — causes stale-cache issues.
  if (isInIframe || isPreviewHost) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {}
    return;
  }

  try {
    // Dynamically import so the workbox-window dependency is only pulled in
    // when we actually register (keeps preview/iframe paths lean).
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox("/sw.js", { scope: "/" });

    wb.addEventListener("controlling", () => {
      // A new SW took control. Reload at most once per session so the page
      // immediately uses the freshly precached assets.
      if (hasReloadedThisSession()) return;
      markReloadedThisSession();
      window.location.reload();
    });

    wb.addEventListener("waiting", () => {
      // New SW is installed but waiting — tell it to activate now.
      wb.messageSkipWaiting();
    });

    await wb.register({ immediate: true });
    console.log("[SW] Registered with Workbox (cache-first, full precache)");
  } catch (error) {
    console.error("[SW] Registration failed:", error);
  }
};
