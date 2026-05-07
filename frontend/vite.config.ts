import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              priority: 30,
              test: /node_modules[\\/](react|react-dom)[\\/]/,
            },
            {
              name: "router-query-vendor",
              priority: 20,
              test: /node_modules[\\/](@tanstack|react-router|@remix-run)[\\/]/,
            },
            {
              name: "antd-icons-vendor",
              priority: 14,
              test: /node_modules[\\/]@ant-design[\\/]icons[\\/]/,
            },
            {
              name: "rc-vendor",
              priority: 13,
              test: /node_modules[\\/](rc-|@rc-component)[\\/]/,
            },
            {
              name: "ant-design-vendor",
              priority: 12,
              test: /node_modules[\\/]@ant-design[\\/]/,
            },
            {
              name: "antd-vendor",
              priority: 10,
              test: /node_modules[\\/]antd[\\/]/,
            },
          ],
          maxSize: 450_000,
          minSize: 20_000,
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    // UI-heavy Ant Design tests share jsdom/browser mocks and time out under file-level parallelism.
    fileParallelism: false,
    pool: "threads",
    setupFiles: "./src/test/setup.ts",
    testTimeout: 20_000,
  },
});
