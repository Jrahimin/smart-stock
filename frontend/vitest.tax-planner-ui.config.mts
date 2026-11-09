import { defineConfig } from "vitest/config";
import common from "./vitest.config.mts";

export default defineConfig({
  ...common,
  test: {
    ...common.test,
    include: ["features/wealth/tax-v2/workspaces.api.integration.tsx"],
    testTimeout: 15_000,
  },
});
