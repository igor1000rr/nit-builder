export function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
