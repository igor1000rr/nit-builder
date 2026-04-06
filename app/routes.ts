import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/landing.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("download", "routes/download.tsx"),
  route("api/pipeline/simple", "routes/api.pipeline.simple.ts"),
  route("api/health", "routes/api.health.ts"),
  route("api/metrics", "routes/api.metrics.ts"),
  route("api/providers", "routes/api.providers.ts"),
  // Auth endpoints (Phase B)
  route("api/auth/register", "routes/api.auth.register.ts"),
  route("api/auth/login", "routes/api.auth.login.ts"),
  route("api/auth/logout", "routes/api.auth.logout.ts"),
  route("api/auth/me", "routes/api.auth.me.ts"),
  route("api/auth/regenerate-tunnel-token", "routes/api.auth.regenerate-tunnel-token.ts"),
  // Sites CRUD (Phase B.6)
  route("api/sites", "routes/api.sites.ts"),
  route("api/sites/:id", "routes/api.sites.$id.ts"),
  // Static assets
  route("sitemap.xml", "routes/sitemap[.xml].ts"),
  route("robots.txt", "routes/robots[.txt].ts"),
  route("*", "routes/$.tsx"),
] satisfies RouteConfig;
