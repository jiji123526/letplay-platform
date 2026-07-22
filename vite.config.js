import { defineConfig } from "vite";
import { resolve } from "path";

const appVersion = process.env.VERCEL_GIT_COMMIT_SHA || "local";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    minify: "esbuild",
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
        onboarding: resolve(__dirname, "onboarding.html"),
      },
    },
  },
});
