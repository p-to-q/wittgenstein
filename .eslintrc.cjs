/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    "dist/",
    "node_modules/",
    ".next/",
    "apps/site/.next/",
    "artifacts/",
    "coverage/",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": "warn",
    // Disabled because we lean on TypeScript strict mode + vitest coverage to
    // catch misused-promise patterns. The rule produces too many false positives
    // on intentional async callback shapes (vitest beforeEach, promise-returning
    // event handlers) to be useful as a hard gate. Re-enable selectively via
    // inline `eslint-disable-next-line` if a specific path is high-risk.
    "@typescript-eslint/no-misused-promises": "off",
    "@typescript-eslint/naming-convention": [
      "warn",
      {
        selector: "default",
        format: ["camelCase"],
        leadingUnderscore: "allow",
        trailingUnderscore: "allow",
      },
      {
        selector: "variable",
        format: ["camelCase", "UPPER_CASE", "PascalCase"],
        leadingUnderscore: "allow",
        trailingUnderscore: "allow",
      },
      {
        selector: "function",
        format: ["camelCase", "PascalCase"],
      },
      {
        selector: "parameter",
        format: ["camelCase"],
        leadingUnderscore: "allow",
      },
      {
        selector: "typeLike",
        format: ["PascalCase"],
      },
      {
        selector: "property",
        format: null,
      },
    ],
  },
};
