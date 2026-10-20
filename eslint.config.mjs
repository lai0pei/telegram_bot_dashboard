import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: ["lib/db/migrations/**"],
  },
  {
    // Every db call is async; a forgotten `await` would silently drop a write, so catch it at lint time.
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
];

export default config;
