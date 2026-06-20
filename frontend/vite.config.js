import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const backendPort = Number(env.PORT) || 3001;
  const backendOrigin = `http://localhost:${backendPort}`;

  return {
    envDir: "..",
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            three: ["three"],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/search": backendOrigin,
        "/health": backendOrigin,
      },
    },
  };
});
