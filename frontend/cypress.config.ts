import * as path from "path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "cypress";

// package.json nie ma "type":"module", więc Cypress ładuje ten config jako CJS —
// używamy natywnego __dirname (bez import.meta.url, które wymuszałoby ESM i psuło config).
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:8080",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.ts",
    // ≥1024px, żeby sidebar (lg:) był widoczny — inaczej jest schowany (mobile).
    viewportWidth: 1280,
    viewportHeight: 800,
    video: true,
    setupNodeEvents(_on, config) {
      return config;
    },
  },
  component: {
    devServer: {
      framework: "vue",
      bundler: "vite",
      viteConfig: {
        plugins: [vue()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "src"),
            "@shared": path.resolve(__dirname, "../backend/shared"),
          },
        },
      },
    },
    specPattern: "cypress/component/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/component.ts",
    indexHtmlFile: "cypress/support/component-index.html",
  },
});
