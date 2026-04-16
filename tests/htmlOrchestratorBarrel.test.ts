import { describe, it, expect } from "vitest";

/**
 * Регрессия для декомпозиции htmlOrchestrator.ts (commit bbddeca).
 *
 * Раньше всё было в одном файле 38KB. Сейчас разбито на 6 модулей:
 *   - htmlOrchestrator.ts       — barrel re-export (этот публичный API)
 *   - htmlOrchestrator.types    — PipelineEvent, OrchestratorOptions
 *   - htmlOrchestrator.helpers  — stripCodeFences, readUsage, readFinishReason
 *   - pipelinePlanner           — obtainPlan, runPlannerForEval
 *   - pipelineCreate            — executeHtmlSimple
 *   - pipelineContinue          — executeHtmlContinue
 *   - pipelinePolish            — executeHtmlPolish
 *
 * Тест проверяет что:
 *   1. Все 4 публичные функции экспортируются из barrel
 *   2. Они являются async-генераторами (executeHtml*) или async (runPlannerForEval)
 *   3. Тип PipelineEvent доступен (compile-time проверка через usage)
 *
 * Если кто-то случайно удалит export из barrel или переименует функцию —
 * этот тест упадёт с понятным сообщением, не дожидаясь runtime поломки
 * в /api/pipeline/simple.
 */

describe("htmlOrchestrator barrel re-export", () => {
  it("экспортирует executeHtmlSimple как async generator function", async () => {
    const mod = await import("~/lib/services/htmlOrchestrator");
    expect(typeof mod.executeHtmlSimple).toBe("function");
    // async generators имеют constructor.name === "AsyncGeneratorFunction"
    expect(mod.executeHtmlSimple.constructor.name).toBe("AsyncGeneratorFunction");
  });

  it("экспортирует executeHtmlPolish как async generator function", async () => {
    const mod = await import("~/lib/services/htmlOrchestrator");
    expect(typeof mod.executeHtmlPolish).toBe("function");
    expect(mod.executeHtmlPolish.constructor.name).toBe("AsyncGeneratorFunction");
  });

  it("экспортирует executeHtmlContinue как async generator function", async () => {
    const mod = await import("~/lib/services/htmlOrchestrator");
    expect(typeof mod.executeHtmlContinue).toBe("function");
    expect(mod.executeHtmlContinue.constructor.name).toBe("AsyncGeneratorFunction");
  });

  it("экспортирует runPlannerForEval как async function", async () => {
    const mod = await import("~/lib/services/htmlOrchestrator");
    expect(typeof mod.runPlannerForEval).toBe("function");
    expect(mod.runPlannerForEval.constructor.name).toBe("AsyncFunction");
  });

  it("PipelineEvent type usable как discriminated union (compile-time)", async () => {
    // Этот тест прошёл бы typecheck stage до того как сюда дошёл.
    // Проверяем что тип принимает разные варианты union'а — это сигнал
    // что barrel правильно re-export'ит type из htmlOrchestrator.types.
    const { } = await import("~/lib/services/htmlOrchestrator");
    type Event = import("~/lib/services/htmlOrchestrator").PipelineEvent;
    const events: Event[] = [
      { type: "session_init", sessionId: "abc" },
      { type: "text", text: "hello" },
      { type: "step_complete" },
      { type: "error", message: "oops" },
    ];
    expect(events.length).toBe(4);
    // discriminated union narrowing работает
    const e = events[0]!;
    if (e.type === "session_init") {
      expect(e.sessionId).toBe("abc");
    }
  });

  it("OrchestratorOptions type принимает все опциональные поля", async () => {
    type Opts = import("~/lib/services/htmlOrchestrator").OrchestratorOptions;
    const opts: Opts = {
      providerOverride: { modelName: "qwen2.5-coder" },
      skipPlanCache: true,
      polishIntent: "css_patch",
      targetSection: "hero",
      stylePresetId: "neon-cyber",
    };
    expect(opts.skipPlanCache).toBe(true);
    expect(opts.polishIntent).toBe("css_patch");
  });

  it("прямой импорт из подмодулей тоже работает (для тестов и eval)", async () => {
    const planner = await import("~/lib/services/pipelinePlanner");
    expect(typeof planner.obtainPlan).toBe("function");
    expect(typeof planner.runPlannerForEval).toBe("function");

    const helpers = await import("~/lib/services/htmlOrchestrator.helpers");
    expect(typeof helpers.stripCodeFences).toBe("function");
    expect(typeof helpers.readUsage).toBe("function");
    expect(typeof helpers.readFinishReason).toBe("function");
    expect(helpers.SCOPE).toBe("htmlOrchestrator");
    expect(Array.isArray(helpers.HTML_STOP_SEQUENCES)).toBe(true);
  });

  it("stripCodeFences поведение не сломалось после декомпозиции", async () => {
    const { stripCodeFences } = await import(
      "~/lib/services/htmlOrchestrator.helpers"
    );

    // Случай 1: чистый HTML
    const html1 = "<!DOCTYPE html><html><body><h1>ok</h1></body></html>";
    expect(stripCodeFences(html1)).toContain("<!DOCTYPE html>");
    expect(stripCodeFences(html1)).toContain("<h1>ok</h1>");

    // Случай 2: HTML внутри markdown fences
    const html2 = "```html\n<!DOCTYPE html><html><body>x</body></html>\n```";
    const cleaned2 = stripCodeFences(html2);
    expect(cleaned2).toContain("<!DOCTYPE html>");
    expect(cleaned2).not.toContain("```");

    // Случай 3: HTML без </html> — должно дозакрыть
    const html3 = "<html><body>x</body>";
    const cleaned3 = stripCodeFences(html3);
    expect(cleaned3).toContain("</html>");

    // Случай 4: section markers удаляются
    const html4 =
      '<!DOCTYPE html><html><body><!-- ═══ SECTION: hero ═══ -->' +
      "<section>x</section><!-- ═══ END SECTION ═══ --></body></html>";
    const cleaned4 = stripCodeFences(html4);
    expect(cleaned4).not.toContain("SECTION:");
    expect(cleaned4).not.toContain("═══");
  });
});
