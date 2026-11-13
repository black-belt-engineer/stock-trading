import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_SSE_URL ?? "http://localhost:3003";

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
      },
    },
  };
});
