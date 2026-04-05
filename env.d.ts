/// <reference types="@react-router/node" />
/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production" | "test";
    PORT?: string;
    LMSTUDIO_BASE_URL?: string;
    LMSTUDIO_MODEL?: string;
    GROQ_API_KEY?: string;
    GROQ_MODEL?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_MODEL?: string;
    NIT_API_SECRET?: string;
    GUEST_DAILY_LIMIT?: string;
    LOG_LEVEL?: "debug" | "info" | "warn" | "error";
  }
}
