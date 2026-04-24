import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      // text — для CI логов; html — артефакт для скачивания и локального
      // просмотра в browser; json — для интеграции с PR-comment ботами
      // в будущем; lcov — для возможной заливки в Codecov.
      reporter: ["text", "html", "json", "lcov"],
      reportsDirectory: "coverage",
      // Coverage scope: server-side бизнес-логика (services + utils + server
      // helpers) — то что мы можем и должны покрывать unit-тестами.
      // Endpoints (app/routes/*) и UI (components/) требуют integration-
      // или RTL-тестов, для них отдельный план в P3.
      include: [
        "app/lib/services/**/*.ts",
        "app/lib/utils/**/*.ts",
        "app/lib/server/**/*.ts",
        "app/lib/llm/**/*.ts",
        "app/lib/eval/**/*.ts",
        "app/lib/image/**/*.ts",
        "app/lib/config/**/*.ts",
        "shared/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/types.ts",
        "**/*.types.ts",
        "app/lib/eval/queries*.ts", // dataset-файлы (~37KB JSON-as-code), не код
        "app/lib/rag/seeds/**",
        // Logger trivial; lazy и тестируется неявно через scope-логи в фичах
        "app/lib/utils/logger.ts",
      ],
      // Baseline по фактическим показателям на момент v2.0.0-beta.1:
      // - lines/statements ~67% (тянет вниз app/lib/server/* без mock'ов
      //   Appwrite и pipeline* без mock'ов LLM-провайдеров — это уровень
      //   integration tests, P3)
      // - functions ~75% (моки покрывают сигнатуры)
      // - branches ~80% (хорошо — error-paths покрыты)
      //
      // Threshold = реальный baseline минус 5pp. Падение ниже = сигнал
      // что или новый код без тестов, или удалили тесты. Поднимать после
      // RTL/integration setup (P3).
      thresholds: {
        lines: 60,
        functions: 70,
        branches: 75,
        statements: 60,
      },
    },
  },
});
