import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Default config используется обоими project'ами через extends.
    // По factu это разные project'ы (см. test.projects ниже) — тестам в
    // tests/ui/ нужен jsdom, остальным node. Раньше разделялось через
    // deprecated `environmentMatchGlobs`.
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/ui/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/ui/**/*.test.{ts,tsx}", "tests/**/*.test.tsx"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "app/lib/services/**/*.ts",
        "app/lib/utils/**/*.ts",
        "app/lib/server/**/*.ts",
        "app/lib/llm/**/*.ts",
        "app/lib/eval/**/*.ts",
        "app/lib/image/**/*.ts",
        "app/lib/config/**/*.ts",
        "app/lib/contexts/**/*.{ts,tsx}",
        "app/lib/hooks/**/*.{ts,tsx}",
        "shared/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/types.ts",
        "**/*.types.ts",
        "app/lib/eval/queries*.ts",
        "app/lib/rag/seeds/**",
        "app/lib/utils/logger.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 70,
        branches: 75,
        statements: 60,
      },
    },
  },
});
