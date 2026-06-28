// ESLint flat config (ESLint 9 + typescript-eslint) dla backendu.
// Cel: wyłapać realne błędy (nieużywane zmienne, floating promises są poza zakresem
// bez type-check), bez zalewania szumem stylistycznym (formatowanie pilnuje Prettier).
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "prisma/migrations/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Skrypty CLI i generator danych legalnie piszą po konsoli.
    files: ["scripts/**", "utils/generateTestData.js", "tests/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Pliki CommonJS (.js) — środowisko Node, składnia require/module.
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        exports: "writable",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },
  prettier
);
