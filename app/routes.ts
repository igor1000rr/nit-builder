import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/landing.tsx"),
  route("api/pipeline/simple", "routes/api.pipeline.simple.ts"),
  route("api/health", "routes/api.health.ts"),
  route("api/metrics", "routes/api.metrics.ts"),
  route("sitemap.xml", "routes/sitemap[.xml].ts"),
  route("robots.txt", "routes/robots[.txt].ts"),
] satisfies RouteConfig;
