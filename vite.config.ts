import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The built app is served by the API under /app/ (see src/app.ts). In dev, Vite proxies /api to the API.
const API = process.env.VITE_API_PROXY ?? "http://localhost:3000";

export default defineConfig({
  base: "/app/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "NEON RIDE",
        short_name: "NeonRide",
        description: "Cyberpunk ride-hailing: book rides, drive, and review your trip history.",
        start_url: "/app/",
        scope: "/app/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#050505",
        theme_color: "#050505",
        categories: ["travel", "navigation"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/app/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/client\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        runtimeCaching: [
          {
            // OpenStreetMap tiles: cache what the user has seen so maps still render offline.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "osm-tiles", expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 14 }, cacheableResponse: { statuses: [0, 200] } },
          },
          { urlPattern: /\/api\//, handler: "NetworkOnly" },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true, proxy: { "/api": { target: API, changeOrigin: true } } },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
