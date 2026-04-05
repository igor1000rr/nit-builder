import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/landing.tsx"),
  route("api/pipeline/simple", "routes/api.pipeline.simple.ts"),
  route("api/health", "routes/api.health.ts"),
] satisfies RouteConfig;
