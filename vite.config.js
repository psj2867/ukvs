// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 8080,
  },
  build: { minify: false },
});

// build: {
//   lib: {
//     entry: resolve(__dirname, "lib/main.js"),
//     name: "MyLib",
//     fileName: "ukvs",
//   },
//   rollupOptions: {
//     output: {},
//   },
// },
