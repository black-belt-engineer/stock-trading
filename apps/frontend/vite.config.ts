import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
    plugins: [react(), tailwindcss()],
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
