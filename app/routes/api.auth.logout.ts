import type { ActionFunctionArgs } from "react-router";
import { buildClearCookie, isProduction } from "~/lib/server/sessionCookie.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Stateless tokens — just clear the cookie. No Appwrite call needed
  // (we don't store sessions server-side, the HMAC is self-contained).
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
