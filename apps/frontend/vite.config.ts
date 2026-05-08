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
        },
        "/quotes": {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});
