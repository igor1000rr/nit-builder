import { checkAdminToken } from "~/lib/server/adminAuth";
import {
  readRecentFeedback,
  countFeedback,
} from "~/lib/services/feedbackStore";

export async function loader({ request }: { request: Request }) {
  const auth = checkAdminToken(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    1000,
  );

  try {
    const [records, total] = await Promise.all([
      readRecentFeedback(limit),
      countFeedback(),
    ]);
    return Response.json({
      total,
      returned: records.length,
      records,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
