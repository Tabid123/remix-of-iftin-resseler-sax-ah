import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { registerServiceWorker } from "./registerServiceWorker";
import { initializeAdMob } from "./services/admob";
import { initializeOneSignal } from "./services/onesignal";
import { initializeFirebase, recordError } from "./services/firebase";

// Canonical tenant entry routing must happen before React, auth, splash, or a
// cached landing route can render. Preserve the complete URL when normalizing
// www, then send root tenant links straight to the storefront.
const normalizeTenantEntryUrl = () => {
  try {
    const url = new URL(window.location.href);

    if (url.hostname.toLowerCase() === "www.iftinresellers.com") {
      url.hostname = "iftinresellers.com";
      window.location.replace(url.toString());
      return true;
    }

    const tenantSlug = url.searchParams.get("t")?.trim();
    if (url.pathname === "/" && tenantSlug) {
      url.pathname = "/providers";
      url.searchParams.set("t", tenantSlug);
      window.location.replace(url.toString());
      return true;
    }
  } catch (error) {
    console.warn("[Tenant Route] URL normalization failed", error);
  }

  return false;
};

const tenantRedirectStarted = normalizeTenantEntryUrl();

// Mark the app as mounted so the HTML watchdog can hide its recovery screen
// and the service worker knows it's safe to do update work.
const markAppMounted = () => {
  (window as any).__APP_MOUNTED__ = true;
  try {
    window.dispatchEvent(new Event("app:mounted"));
  } catch {}
  // Hide the initial HTML splash AFTER React has had a paint, so we never
  // expose a blank black/white WebView frame on iOS / Android.
  setTimeout(() => {
    const splash = document.getElementById("initial-splash");
    if (splash && splash.parentNode) {
      splash.parentNode.removeChild(splash);
    }
  }, 250);
};

// Detect chunk-load failures (lazy imports that fail when WebView/network hiccups).
// These are silent killers — page goes white forever. Auto-reload heals them.
const isChunkLoadError = (err: unknown): boolean => {
  if (!err) return false;
  const msg = (err as any)?.message || String(err);
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg);
};

// Global error handlers — silently retry instead of showing error UI.
// App should always appear to load. Splash stays visible during silent reload.
window.addEventListener("error", (event) => {
  if (event.error) {
    try { recordError(event.error); } catch {}
  }
  // Chunk load errors → ALWAYS recover (even after mount). Page is broken otherwise.
  if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
    silentBootRecovery("chunk-load-error");
    return;
  }
  if (!(window as any).__APP_MOUNTED__) {
    silentBootRecovery("runtime-error");
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof Error) {
    try { recordError(event.reason); } catch {}
  }
  if (isChunkLoadError(event.reason)) {
    silentBootRecovery("chunk-load-rejection");
    return;
  }
  if (!(window as any).__APP_MOUNTED__) {
    silentBootRecovery("unhandled-rejection");
  }
});

// Legacy hook for older code paths
window.onerror = (_message, _source, _lineno, _colno, error) => {
  if (error) {
    try { recordError(error); } catch {}
  }
};

// AUTO-RECOVERY: Marka internet-ku dib u soo noqdo oo app-ku weli aanu mount samayn → silent reload.
window.addEventListener("online", () => {
  if (!(window as any).__APP_MOUNTED__) {
    silentBootRecovery("back-online-not-mounted");
  }
});

// AUTO-RECOVERY: Marka tab/app dib loo soo furo, hadii root-ku madhan yahay → silent reload.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  setTimeout(() => {
    if ((window as any).__APP_MOUNTED__) return;
    const root = document.getElementById("root");
    const looksEmpty = !root || (root.children.length <= 1 && !document.getElementById("app-render-sentinel"));
    if (looksEmpty) {
      silentBootRecovery("visible-but-blank");
    }
  }, 600);
});

// Silent recovery: reload at most twice per session, no visible error message.
// Splash + spinner stay visible during the reload, so the user just sees loading.
const SILENT_RELOAD_KEY = "__iftin_boot_reloads__";
function silentBootRecovery(reason: string) {
  console.warn("[Boot] silent retry due to:", reason);
  try {
    const n = parseInt(sessionStorage.getItem(SILENT_RELOAD_KEY) || "0", 10);
    if (n >= 2) {
      // Already retried twice — keep splash visible, don't loop forever.
      return;
    }
    sessionStorage.setItem(SILENT_RELOAD_KEY, String(n + 1));
  } catch {}
  // Splash is already up; just reload silently.
  try { window.location.reload(); } catch {}
}

// Backwards-compatible no-op hook for the HTML watchdog (it now does its own silent reload).
(window as any).__showBootRecovery = silentBootRecovery;

// Initialize services (non-blocking failures)
try { initializeAdMob(); } catch (e) { console.warn("AdMob init failed", e); }
try { initializeOneSignal(); } catch (e) { console.warn("OneSignal init failed", e); }
try { initializeFirebase(); } catch (e) { console.warn("Firebase init failed", e); }

// Register service worker — does its own gating, never reloads during boot
registerServiceWorker();

if (!tenantRedirectStarted) {
  const container = document.getElementById("root");
  if (container) {
    const root = createRoot(container);

    root.render(
      <React.StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </React.StrictMode>
    );

    // Mark mounted on next paint so update logic / splash removal can proceed
    requestAnimationFrame(() => {
      requestAnimationFrame(markAppMounted);
    });
  }
}
