import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` arunca la import in afara serverului React. Next il
      // rezolva pe conditia `react-server`, unde pachetul e gol; aici i se
      // cere direct fisierul gol, ca modulele de serviciu sa poata fi testate.
      // Fara asta, tot ce scrie in baza ar ramane neverificabil.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
});
