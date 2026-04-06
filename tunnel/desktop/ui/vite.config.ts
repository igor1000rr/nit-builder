import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri v2 dev server runs on 5174 (configured in tauri.conf.json)
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
    host: "localhost",
    watch: {
      // Don't watch Rust sources
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
    outDir: "dist",
  },
});
