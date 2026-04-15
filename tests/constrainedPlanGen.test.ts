import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generatePlanConstrained,
  isConstrainedDecodingEnabled,
  resetConstrainedDecodingState,
} from "~/lib/services/constrainedPlanGen";
import type { Plan } from "~/lib/utils/planSchema";

const originalFetch = global.fetch;

const VALID_PLAN: Plan = {
  business_type: "кофейня",
  target_audience: "офисные работники",
  tone: "тёплый",
  style_hints: "",
  color_mood: "warm-pastel",
  sections: ["hero", "menu"],
  keywords: ["кофе"],
  cta_primary: "Смотреть меню",
  language: "ru",
  suggested_template_id: "coffee-shop",
  hero_headline: "Кофе варят те, кто им живёт",
  hero_subheadline: "Обжарка каждую пятницу",
  key_benefits: [
    { title: "Свежая обжарка", description: "Через 7 дней." },
    { title: "Бариста", description: "3 месяца стажировки." },
    { title: "V60", description: "Альтернативные методы." },
  ],
  social_proof_line: "500+ гостей",
  cta_microcopy: "Первая чашка бесплатно",
};

function mockChatResponse(content: string, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    }),
  } as Response);
}

beforeEach(() => {
  resetConstrainedDecodingState();
  delete process.env.NIT_CONSTRAINED_DECODING_ENABLED;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("isConstrainedDecodingEnabled", () => {
  it("true по умолчанию", () => {
    expect(isConstrainedDecodingEnabled()).toBe(true);
  });

  it("false если NIT_CONSTRAINED_DECODING_ENABLED=0", () => {
    process.env.NIT_CONSTRAINED_DECODING_ENABLED = "0";
    expect(isConstrainedDecodingEnabled()).toBe(false);
  });
});

describe("generatePlanConstrained", () => {
  const baseParams = {
    modelName: "qwen2.5-coder-7b",
    systemPrompt: "sys",
    userPrompt: "кофейня в центре",
  };

  it("возвращает ok:false disabled когда отключен", async () => {
    process.env.NIT_CONSTRAINED_DECODING_ENABLED = "0";
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("disabled");
  });

  it("парсит валидный plan из ответа", async () => {
    mockChatResponse(JSON.stringify(VALID_PLAN));
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.business_type).toBe("кофейня");
      expect(result.usage).toEqual({ prompt: 100, completion: 200 });
    }
  });

  it("transient=true на timeout/network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.transient).toBe(true);
  });

  it("transient=false на HTTP 400 (provider не поддерживает)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "json_schema not supported" }),
    } as Response);
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.transient).toBe(false);
    // После unsupported response фича отключается на сессию
    expect(isConstrainedDecodingEnabled()).toBe(false);
  });

  it("transient=false на HTTP 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.transient).toBe(false);
      expect(result.reason).toBe("http_404_unsupported");
    }
  });

  it("transient=true на HTTP 500 (серверная ошибка)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.transient).toBe(true);
  });

  it("отбрасывает пустой content", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    } as Response);
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_response");
  });

  it("отбрасывает invalid JSON в content (transient)", async () => {
    mockChatResponse("not json at all");
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_json");
      expect(result.transient).toBe(true);
    }
  });

  it("отбрасывает JSON не проходящий PlanSchema", async () => {
    mockChatResponse(JSON.stringify({ business_type: "x" }));
    const result = await generatePlanConstrained(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("zod_mismatch");
      expect(result.transient).toBe(true);
    }
  });

  it("пропускает user AbortError", async () => {
    const ac = new AbortController();
    ac.abort();
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    await expect(
      generatePlanConstrained({ ...baseParams, signal: ac.signal }),
    ).rejects.toThrow();
  });

  it("отправляет правильный response_format в body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(VALID_PLAN) } }] }),
    } as Response);
    global.fetch = fetchMock;
    await generatePlanConstrained(baseParams);
    const callArgs = fetchMock.mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("plan");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema).toBeDefined();
  });
});
