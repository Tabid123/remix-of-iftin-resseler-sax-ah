import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // we register manually in src/registerServiceWorker.ts
      strategies: "generateSW",
      filename: "sw.js",
      manifest: false, // we already ship /public/manifest.json
      devOptions: {
        enabled: false, // never run SW in dev / Lovable preview iframes
      },
      workbox: {
        // Precache EVERYTHING produced by the build (JS, CSS, HTML, images, fonts, etc.)
        globPatterns: [
          "**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,gif,woff,woff2,ttf,otf,eot,json,webmanifest}",
        ],
        // Generous size budget so large bundles still get precached
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Activate the new SW immediately, take control of all open clients
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // SPA fallback so deep links work offline
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        runtimeCaching: [
          // Same-origin navigations + assets: cache-first so returning users always load from cache
          {
            urlPattern: ({ sameOrigin }) => sameOrigin,
            handler: "CacheFirst",
            options: {
              cacheName: "iftin-app-shell",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 60, // 60 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Cross-origin static assets (images, fonts, CDNs)
          {
            urlPattern: ({ request }) =>
              ["image", "font", "style", "script"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "iftin-cross-origin-assets",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    force: true,
  },
}));
