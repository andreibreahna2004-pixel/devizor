import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint 9 flat config.
 *
 * eslint-config-next v16 exporta direct configuratii flat, deci nu mai e nevoie
 * de FlatCompat — care oricum cade cu "circular structure" pe plugin-ul react.
 */
const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "prisma/migrations/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
