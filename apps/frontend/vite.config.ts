import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The fonts live in @stock-platform/design-tokens and get hashed names, so index.html
// cannot name them. Preload whichever .woff2 files the build emitted.
function preloadFonts(): Plugin {
  return {
    name: "preload-fonts",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        return Object.values(ctx.bundle)
          .filter((file) => file.type === "asset" && file.fileName.endsWith(".woff2"))
          .map((file) => ({
            tag: "link",
            attrs: {
              rel: "preload",
              href: `/${file.fileName}`,
              as: "font",
              type: "font/woff2",
              crossorigin: "",
            },
            injectTo: "head",
          }));
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Everything the app calls goes through the BFF, which holds the session and adds the
  // bearer token; nothing reaches the SSE service directly.
  const bffTarget = env.VITE_BFF_URL ?? "http://localhost:3005";
  // Keycloak's pages, its form posts and its cookies stay on the app's origin (K1).
  // changeOrigin stays off: with KC_HOSTNAME_BACKCHANNEL_DYNAMIC Keycloak builds the
  // token and JWKS URLs from the Host header, so the browser keeps seeing localhost:5173.
  const keycloak = {
    target: env.VITE_KEYCLOAK_URL ?? "http://localhost:8180",
    changeOrigin: false,
  };

  return {
    plugins: [react(), tailwindcss(), preloadFonts()],
    server: {
      proxy: {
        "/bff": { target: bffTarget, changeOrigin: true },
        "/stream": {
          target: bffTarget,
          changeOrigin: true,
          // The dev proxy keeps the browser's side of a stream open when the
          // BFF goes away, so the client would only notice through its
          // silence watchdog. Close it as soon as the upstream response closes.
          configure: (proxy) => {
            proxy.on("proxyRes", (proxyRes, _req, res) => {
              proxyRes.on("close", () => {
                if (!res.writableEnded) res.destroy();
              });
            });
          },
        },
        "/quotes": { target: bffTarget, changeOrigin: true },
        "/realms": keycloak,
        "/resources": keycloak,
      },
    },
  };
});
