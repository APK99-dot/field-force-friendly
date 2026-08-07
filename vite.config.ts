import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
const buildId = `${Date.now()}`;

function buildMetaPlugin(id: string): Plugin {
  return {
    name: "build-meta",
    writeBundle(options) {
      const outDir = options.dir || "dist";
      fs.writeFileSync(
        path.resolve(outDir, "build-meta.json"),
        JSON.stringify({ buildId: id }),
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mcpPlugin(),
    buildMetaPlugin(buildId),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Route the real package first, then swap the bare specifier for our shim
      // so every format() call follows the user's date/time preferences.
      {
        find: /^date-fns-original$/,
        replacement: path.resolve(__dirname, "./node_modules/date-fns/index.mjs"),
      },
      { find: /^date-fns$/, replacement: path.resolve(__dirname, "./src/lib/dateFnsShim.ts") },
    ],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-select', '@radix-ui/react-tabs'],
          charts: ['recharts'],
          xlsx: ['xlsx'],
          pdf: ['jspdf'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "@tanstack/react-query"],
  },
}));
