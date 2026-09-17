import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 제품 소스가 아니다 — 콘솔에 붙여넣어 쓰는 리팩토링 기준선 계측 도구다(docs/baseline/README.md).
    "docs/baseline/**",
  ]),
]);

export default eslintConfig;
