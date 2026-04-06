import type { ActionFunctionArgs } from "react-router";
import { deleteSession } from "~/lib/server/appwrite.server";
import {
  parseSessionCookie,
  buildClearCookie,
  isProduction,
} from "~/lib/server/sessionCookie.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = parseSessionCookie(request.headers.get("Cookie"));
  if (secret) {
    // Best-effort: invalidate Appwrite session, ignore errors
    await deleteSession(secret);
  }

  return Response.json(
    { message: "Logged out" },
    {
      status: 200,
      headers: {
        "Set-Cookie": buildClearCookie(isProduction()),
        "Content-Type": "application/json",
      },
    },
  );
}
