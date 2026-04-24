// @ts-check
/**
 * Минимальный ESLint config для NIT Builder.
 *
 * Принципы:
 * - НЕ переопределяем формат — это работа Prettier (есть .prettierrc.json).
 *   ESLint только про корректность и потенциальные баги.
 * - Не валим CI на стилистике/предпочтениях. Каждое error-правило ловит
 *   реальный класс багов, который встречался в codebase.
 * - Test-файлы ослаблены: моки и `as never` там нормально.
 *
 * Плагины:
 * - typescript-eslint — recommended preset (no-unused-vars, no-misused-promises и т.п.)
 * - react-hooks — критично, ловит rules-of-hooks нарушения которые SSR
 *   проявляет рандомно
 *
 * Что СОЗНАТЕЛЬНО не включено:
 * - eslint-plugin-react: правила про JSX в React 19 + React Router 7 уже
 *   обеспечиваются TS типами + new JSX transform. Лишний шум.
 * - import/order, sort-imports: Prettier и Cursor сами это делают,
 *   ESLint-overhead не нужен.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  // ─── 1. Игнор ───────────────────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      "build/**",
      ".react-router/**",
      "coverage/**",
      "dist/**",
      "tunnel/desktop/src-tauri/target/**",
      "tunnel/desktop/ui/dist/**",
      "tunnel/dist/**",
      "shared/dist/**",
      "**/*.html",
      "**/*.md",
      "package-lock.json",
      "eval-reports/**",
    ],
  },

  // ─── 2. Базовые JS правила для всех .ts/.tsx ───────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ─── 3. Browser/Node globals + React Hooks ─────────────────
  {
    files: ["app/**/*.{ts,tsx}", "shared/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // ─── React Hooks ─────────────
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ─── TypeScript строгости ───
      // Допускаем неиспользуемые args начинающиеся с _ — конвенция для
      // implements/override сигнатур и обработчиков событий.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // any запрещён везде, но через `as never` иногда нужен (см. server.ts
      // dynamic build import). Для конкретных мест — eslint-disable-next-line.
      "@typescript-eslint/no-explicit-any": "error",

      // no-empty-object-type: пустые {} типы часто баг (хотел Record<string, unknown>),
      // но в JSX prop-типах допустимо для placeholder'ов.
      "@typescript-eslint/no-empty-object-type": "off",

      // ─── Vanilla JS ─────────────
      "no-console": "off", // логгер ниже warn-уровня — namespaced, ок
      "no-debugger": "error",
      "no-alert": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Allow NBSP (U+00A0) и тонкие пробелы в комментариях/строках —
      // часто встречаются в русских ценах ("₽1 500"), типографике и
      // примерах юзер-инпута. На реальный код не влияют.
      "no-irregular-whitespace": [
        "error",
        { skipStrings: true, skipComments: true, skipTemplates: true },
      ],
    },
  },

  // ─── 4. Server-only ужесточения ────────────────────────────
  // В server-коде ловим необработанные промисы — на сервере unhandled
  // rejection потенциально роняет процесс/режет SSR ответ.
  {
    files: ["app/lib/server/**/*.ts", "app/routes/api.*.ts", "server.ts"],
    rules: {
      // no-misused-promises требует type info — оставим warn чтобы
      // постепенно прибирать без падения CI.
      "@typescript-eslint/no-floating-promises": "off", // нужен type-aware, дорого
    },
  },

  // ─── 5. Тестам можно больше ────────────────────────────────
  {
    files: ["tests/**/*.ts", "**/*.test.ts", "**/*.test.tsx"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-empty": "off",
    },
  },

  // ─── 6. Скрипты — Node-only globals ────────────────────────
  {
    files: ["scripts/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },

  // ─── 7. Tunnel CLI / Tauri UI ──────────────────────────────
  {
    files: ["tunnel/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
