import path from "path";
import { fileURLToPath } from "url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../backend/shared"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.FRONTEND_PORT) || 8080,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, "../backend/shared"),
      ],
    },
  },
});
