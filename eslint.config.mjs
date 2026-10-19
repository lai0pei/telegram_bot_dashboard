import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: ["lib/db/migrations/**"],
  },
];

export default config;
