import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api/suggest-reply": {
        target: "https://rqaebwzoxuzfrnwdwufn.supabase.co/functions/v1/suggest-reply",
        changeOrigin: true,
        rewrite: () => "",
      },
      "/api/whatsapp-manage": {
        target: "https://rqaebwzoxuzfrnwdwufn.supabase.co/functions/v1/whatsapp-manage",
        changeOrigin: true,
        rewrite: () => "",
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
