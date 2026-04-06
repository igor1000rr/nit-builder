import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  type LinksFunction,
} from "react-router";
import type { Route } from "./+types/root";
import { AuthProvider } from "~/lib/contexts/AuthContext";
import "./styles/app.css";

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;700;900&family=JetBrains+Mono:wght@300;400;500;700&display=swap",
  },
];

export const meta = () => [
  { title: "NIT Builder — AI конструктор сайтов для локальной модели" },
  {
    name: "description",
    content: "Создавай сайты на своём компьютере через LM Studio. Бесплатно, приватно, без подписки. Open source.",
  },
  { property: "og:title", content: "NIT Builder — Создай сайт за минуту" },
  { property: "og:description", content: "AI-конструктор сайтов, работающий локально через LM Studio. Бесплатно, без облака, без подписки." },
  { property: "og:type", content: "website" },
  { property: "og:image", content: "/og-image.svg" },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:locale", content: "ru_RU" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: "NIT Builder — Создай сайт за минуту" },
  { name: "twitter:description", content: "AI-конструктор сайтов для локальной модели. Бесплатно, приватно, open source." },
  { name: "twitter:image", content: "/og-image.svg" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#05060a" />
        <Meta />
        <Links />
      </head>
      <body className="bg-nit-bg text-nit-ink antialiased font-mono">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Неизвестная ошибка";
  let details = "Что-то пошло не так. Попробуй обновить страницу.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : `${error.status}`;
    details = error.status === 404 ? "Страница не найдена" : error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      <div className="nit-grid-bg" />
      <div className="nit-orb nit-orb-1" />
      <div className="nit-orb nit-orb-2" />
      <div className="relative z-10">
        <div className="nit-label mb-6">// system error</div>
        <h1 className="nit-display text-8xl md:text-[10rem] mb-6 text-[color:var(--accent-glow)]">
          {message}
        </h1>
        <p className="text-[color:var(--muted)] mb-10 max-w-md mx-auto">{details}</p>
        <a
          href="/"
          className="inline-block px-8 py-4 bg-[color:var(--accent)] text-black font-bold text-xs tracking-[0.15em] uppercase hover:bg-[color:var(--accent-glow)] transition"
          style={{ boxShadow: "var(--glow-cyan)" }}
        >
          ← Back to root
        </a>
      </div>
    </div>
  );
}
