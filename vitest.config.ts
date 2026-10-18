import { defineConfig } from "vitest/config";
import path from "path";

// Configuration des tests, séparée de vite.config.js (pas de PWA ni de React ici)
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Les tests de règles partagent un même émulateur : pas en parallèle
    fileParallelism: false,
    testTimeout: 20000,
  },
});
