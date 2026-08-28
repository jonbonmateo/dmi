import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", ".data/**", "fixtures/**"] },
];

export default config;
