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
  const target = env.VITE_SSE_URL ?? "http://localhost:3003";
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
        "/stream": {
          target,
          changeOrigin: true,
          // The dev proxy keeps the browser's side of a stream open when the
          // SSE service goes away, so the client would only notice through its
          // silence watchdog. Close it as soon as the upstream response closes.
          configure: (proxy) => {
            proxy.on("proxyRes", (proxyRes, _req, res) => {
              proxyRes.on("close", () => {
                if (!res.writableEnded) res.destroy();
              });
            });
          },
        },
        "/quotes": {
          target,
          changeOrigin: true,
        },
        // Same origin as the app, so the refresh cookie (Path=/auth, A3) is first-party.
        // `xfwd` adds X-Forwarded-For, which the services trust from loopback (TRUST_PROXY)
        // to rate-limit by the browser's IP rather than the proxy's.
        "/auth": {
          target: env.VITE_AUTH_URL ?? "http://localhost:3005",
          changeOrigin: true,
          xfwd: true,
        },
        "/users": {
          target: env.VITE_USER_URL ?? "http://localhost:3004",
          changeOrigin: true,
          xfwd: true,
        },
        "/realms": keycloak,
        "/resources": keycloak,
      },
    },
  };
});
