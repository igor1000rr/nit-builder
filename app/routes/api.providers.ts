import { getAvailableProviders, type ProviderConfig } from "~/lib/llm/client";

type ProviderInfo = {
  id: string;
  model: string;
  contextWindow: number;
  status: "available" | "checking" | "unreachable";
  latencyMs?: number;
};

async function checkProviderHealth(provider: ProviderConfig): Promise<ProviderInfo> {
  const info: ProviderInfo = {
    id: provider.id,
    model: provider.defaultModel,
    contextWindow: provider.contextWindow,
    status: "checking",
  };

  // LM Studio — ping /v1/models
  if (provider.id === "lmstudio") {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${provider.baseUrl.replace("/v1", "")}/v1/models`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        info.status = "available";
        info.latencyMs = Date.now() - start;
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (data.data?.[0]?.id) {
          info.model = data.data[0].id;
        }
      } else {
        info.status = "unreachable";
      }
    } catch {
      info.status = "unreachable";
    }
    return info;
  }

  // Cloud providers — check if API key is set (don't make real API calls)
  if (provider.apiKey && provider.apiKey !== "lm-studio") {
    info.status = "available";
  } else {
    info.status = "unreachable";
  }

  return info;
}

export async function loader() {
  const providers = getAvailableProviders();
  const results = await Promise.all(providers.map(checkProviderHealth));

  return Response.json({
    providers: results,
    preferred: results.find((p) => p.status === "available")?.id ?? null,
  });
}
