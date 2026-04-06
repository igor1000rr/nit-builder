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
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap",
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
        <meta name="theme-color" content="#020617" />
        <Meta />
        <Links />
      </head>
      <body className="bg-slate-950 text-white antialiased">
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-7xl font-extrabold mb-4 bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
        {message}
      </h1>
      <p className="text-slate-400 mb-8">{details}</p>
      <a
        href="/"
        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 rounded-full font-medium hover:scale-105 transition"
      >
        На главную
      </a>
    </div>
  );
}
