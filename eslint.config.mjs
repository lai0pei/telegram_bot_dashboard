import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: ["lib/db/migrations/**"],
  },
  {
    // Every db call is async; a forgotten `await` would silently drop a write, so catch it at lint time.
    files: ["lib/**/*.ts", "app/api/**/*.ts", "instrumentation.ts", "proxy.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      // Drizzle query builders are thenables, not native Promises: without checkThenables a bare `db.delete(x);` is not flagged.
      "@typescript-eslint/no-floating-promises": ["error", { checkThenables: true }],
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { arguments: true } }],
      "@typescript-eslint/await-thenable": "error",
    },
  },
];

export default config;
