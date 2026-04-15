import { checkAdminToken } from "~/lib/server/adminAuth";
import { getStats } from "~/lib/services/ragStore";
import { ensureSeeded } from "~/lib/services/ragBootstrap";
import { isRagDisabled } from "~/lib/services/ragEmbeddings";

export async function loader({ request }: { request: Request }) {
  const auth = checkAdminToken(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    await ensureSeeded();
  } catch {
    // если embedding недоступен — просто покажем текущее состояние
  }

  const stats = getStats();
  return Response.json({
    ragDisabled: isRagDisabled(),
    ...stats,
  });
}
