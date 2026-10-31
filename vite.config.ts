import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    // Bind the IPv4 loopback explicitly. The default (host "localhost") resolves to ::1 on
    // machines where IPv6 localhost comes first, which silently breaks the README's documented
    // http://127.0.0.1:5173 quick-start URL. Loopback-only either way — nothing is exposed.
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: "forks",
  },
});
