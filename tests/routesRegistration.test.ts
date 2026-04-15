import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Регрессия для бага с orphaned routes.
 *
 * История. До коммита 74c8a9e в `app/routes/` лежало 7 admin/RAG/eval файлов
 * (api.admin.eval.run.ts, api.admin.feedback.ts, api.admin.metrics.ts и
 * api.admin.rag.*.ts), но в `app/routes.ts` они зарегистрированы не были.
 * React Router 7 не подхватывает file-routes автоматически — каждый
 * route-файл должен быть явно прописан в RouteConfig. В итоге эти 7
 * endpoints молча отдавали 404 в production.
 *
 * Этот тест читает оба источника и сверяет: каждый *.ts/*.tsx файл в
 * app/routes/ должен быть упомянут в app/routes.ts (или явно занесён
 * в whitelist ниже, если это server-only helper и не должен быть routed).
 */

const ROUTES_DIR = path.resolve(process.cwd(), "app/routes");
const ROUTES_CONFIG = path.resolve(process.cwd(), "app/routes.ts");

/** Файлы которые лежат в app/routes/, но НЕ должны быть зарегистрированы. */
const ALLOWED_UNROUTED: string[] = [
  // Сюда добавлять server-only helpers если такие появятся.
  // Пустой по умолчанию — почти всегда orphaned файл это баг.
];

describe("routes registration", () => {
  it("каждый route-файл из app/routes/ зарегистрирован в routes.ts", async () => {
    const [routeFiles, configContent] = await Promise.all([
      fs.readdir(ROUTES_DIR),
      fs.readFile(ROUTES_CONFIG, "utf8"),
    ]);

    const routeBasenames = routeFiles
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => !ALLOWED_UNROUTED.includes(f));

    const orphaned: string[] = [];
    for (const fname of routeBasenames) {
      // routes.ts ссылается на файлы как "routes/api.foo.ts" или "routes/$.tsx"
      const refPath = `routes/${fname}`;
      if (!configContent.includes(refPath)) {
        orphaned.push(fname);
      }
    }

    if (orphaned.length > 0) {
      throw new Error(
        `Orphaned route files (exist in app/routes/ but not registered in app/routes.ts):\n` +
          orphaned.map((f) => `  - ${f}`).join("\n") +
          `\n\nДобавь route(...) запись в app/routes.ts или внеси файл в ALLOWED_UNROUTED ` +
          `в tests/routesRegistration.test.ts если он намеренно не routed.`,
      );
    }
    expect(orphaned).toEqual([]);
  });

  it("каждая ссылка routes/*.ts в routes.ts указывает на существующий файл", async () => {
    const [routeFiles, configContent] = await Promise.all([
      fs.readdir(ROUTES_DIR),
      fs.readFile(ROUTES_CONFIG, "utf8"),
    ]);
    const existingFiles = new Set(routeFiles);

    const refs = configContent.matchAll(/["']routes\/([^"']+)["']/g);
    const dangling: string[] = [];
    for (const m of refs) {
      const fname = m[1]!;
      if (!existingFiles.has(fname)) dangling.push(fname);
    }

    if (dangling.length > 0) {
      throw new Error(
        `Dangling route refs (referenced in routes.ts but file missing):\n` +
          dangling.map((f) => `  - routes/${f}`).join("\n"),
      );
    }
    expect(dangling).toEqual([]);
  });
});
