// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 8080,
  },
  build: {
    lib: {
      entry: resolve(__dirname, "lib/main.js"),
      name: "MyLib",
      fileName: "ukvdb",
    },
    rollupOptions: {
      output: {},
    },
  },
});
