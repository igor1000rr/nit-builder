import { getAvailableProviders } from "~/lib/llm/client";
import { TEMPLATE_CATALOG } from "~/lib/config/htmlTemplatesCatalog";

export async function loader() {
  const providers = getAvailableProviders();
  return Response.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    providers: providers.map((p) => ({ id: p.id, model: p.defaultModel })),
    templates: TEMPLATE_CATALOG.length,
    uptime: process.uptime(),
  });
}
