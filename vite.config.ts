import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    server: {
      port: 3000,
      proxy: { "/api": env.TENDOR_API_TARGET || "http://127.0.0.1:8000" },
    },
  };
});
