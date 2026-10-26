import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DATABASE_URL: "postgres://aidbridge_app:aidbridge_app@localhost:54329/aidbridge",
      DATABASE_URL_ADMIN: "postgres://aidbridge:aidbridge@localhost:54329/aidbridge",
    },
  },
});
