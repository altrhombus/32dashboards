// Lints the repo's own scripts (packages and bundles have their own configs).
import js from "@eslint/js";

export default [
  { ignores: ["bundles/**", "packages/**", "node_modules/**"] },
  {
    files: ["scripts/**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        crypto: "readonly",
        Buffer: "readonly",
      },
    },
  },
];
