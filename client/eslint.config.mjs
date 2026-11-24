import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  // vendor/: the UI kit, linted in its own repo. public/vdui/: its built assets, copied on install.
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "vendor/**", "public/vdui/**"] },
];

export default config;
