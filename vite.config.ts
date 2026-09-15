import { defineConfig, type ProxyOptions } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiTarget = process.env.API_TARGET || "http://127.0.0.1:8765";
const proxy: Record<string, ProxyOptions> = {
  "/api": {
    target: apiTarget,
    changeOrigin: true,
    configure(proxy) {
      proxy.on("proxyReq", (request, incoming) => {
        // Rewrite only requests from this dev server; keep foreign origins rejected.
        if (incoming.headers.origin === `http://${incoming.headers.host}`) {
          request.setHeader("Origin", new URL(apiTarget).origin);
        }
      });
    },
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy },
});
