import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Without this, every third-party dependency (react, supabase-js,
        // framer-motion, radix, i18next, the sound libs...) lands in one
        // ~700kB shared chunk that even an unauthenticated visitor on the
        // Landing/Login pages has to download in full before anything
        // renders, alongside this app's own shell code (Topbar/Sidebar/
        // authContext) — none of which they need yet either. Splitting by
        // vendor package: these chunks change far less often than app
        // code between deploys, so a browser that already has them cached
        // from a previous visit skips re-downloading them entirely, and a
        // first-time visitor's chunks now download in parallel instead of
        // one large serial blob.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("class-variance-authority") || id.includes("tailwind-merge") || id.includes("clsx")) return "vendor-ui";
          if (id.includes("i18next")) return "vendor-i18n";
          if (id.includes("howler") || id.includes("react-sounds") || id.includes("use-sound")) return "vendor-sound";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
});
