import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => {
  const isWidgetBuild = process.env.BUILD_WIDGET === 'true';

  if (isWidgetBuild) {
    // Widget-specific build configuration
    return {
      plugins: [react()],
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "./src"),
        },
      },
      define: {
        // Define browser-compatible globals
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env': '{}',
        'global': 'window',
      },
      build: {
        lib: {
          entry: path.resolve(__dirname, "src/widget.tsx"),
          name: "RufloResearchWidget",
          formats: ["iife"],
          fileName: () => "widget.js",
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
            assetFileNames: "widget.[ext]",
            // Ensure all external dependencies are bundled for standalone widget
            manualChunks: undefined,
          },
        },
        // Don't externalize any dependencies - bundle everything
        commonjsOptions: {
          include: [/node_modules/],
        },
        outDir: "dist",
        emptyOutDir: false,
        // Increase chunk size warning limit for widget bundle
        chunkSizeWarningLimit: 1000,
      },
      // CORS configuration for dev server
      server: {
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    };
  }

  // Main app build configuration
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
