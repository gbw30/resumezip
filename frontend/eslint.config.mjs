import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  // Build output and generated files, which `next lint` used to skip.
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Text on the site has apostrophes and quotes as typed: "can't", “Check”.
      "react/no-unescaped-entities": "off",
      // Destructuring a field out to drop it ({ leftOut, ...kept }) is how this
      // code removes one, and _ names a value that's deliberately unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unused-expressions": "error",
    },
  },
  {
    // Browser tests patch Worker.postMessage, whose overloads take any.
    files: ["e2e/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]

export default eslintConfig
