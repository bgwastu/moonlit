import coreWebVitals from "eslint-config-next/core-web-vitals";
import { globalIgnores } from "eslint/config";

const config = [
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts"]),
  ...coreWebVitals,
  {
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default config;
