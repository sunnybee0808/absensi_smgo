import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Saat development, Vite (port 5173) meneruskan /api dan /auth ke server Express (port 3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
