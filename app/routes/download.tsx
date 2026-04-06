import { useState } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Скачать NIT Tunnel — NIT Builder" },
  {
    name: "description",
    content:
      "Запусти NIT Tunnel клиент и подключи свой GPU к NIT Builder. CLI доступен сейчас, GUI приложение скоро.",
  },
];

const SERVER_URL =
  typeof window !== "undefined"
    ? `ws://${window.location.host}/api/tunnel`
    : "ws://nit.vibecoding.by/api/tunnel";

export default function Download() {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="px-6 py-5 max-w-6xl mx-auto w-full flex justify-between items-center">
        <a
          href="/"
          className="font-bold text-xl bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent"
        >
          NIT Builder
        </a>
        <div className="flex gap-2 text-sm">
          <a
            href="/about"
            className="hidden sm:block px-4 py-2 text-slate-400 hover:text-white transition"
          >
            О проекте
          </a>
          <a
            href="https://github.com/igor1000rr/nit-builder"
            target="_blank"
            rel="noopener"
            className="px-4 py-2 bg-slate-800 rounded-full hover:bg-slate-700 transition"
          >
            GitHub
          </a>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pt-12 pb-20">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full text-sm text-blue-300 mb-6">
            <span>⚡</span>
            <span>NIT Tunnel CLI · v0.1.0-alpha</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Подключи свой GPU
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            NIT Tunnel — клиент который проксирует твою локальную LM Studio к
            NIT Builder. Генерация сайтов через твою видеокарту, полностью
            приватно.
          </p>
        </div>

        {/* Prerequisites */}
        <div className="mb-8 p-5 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span className="text-xl">📋</span> Что нужно
          </h3>
          <ul className="text-sm text-slate-400 space-y-2">
            <li>
              • <span className="text-slate-300">Node.js 20+</span> —{" "}
              <a
                href="https://nodejs.org"
                target="_blank"
                rel="noopener"
                className="text-blue-400 hover:text-blue-300"
              >
                nodejs.org
              </a>{" "}
              или через nvm
            </li>
            <li>
              • <span className="text-slate-300">LM Studio 0.3+</span> —{" "}
              <a
                href="https://lmstudio.ai"
                target="_blank"
                rel="noopener"
                className="text-blue-400 hover:text-blue-300"
              >
                lmstudio.ai
              </a>{" "}
              с загруженной моделью (рекомендуем Qwen2.5-Coder-7B-Q4)
            </li>
            <li>
              • <span className="text-slate-300">Tunnel token</span> —{" "}
              получишь при{" "}
              <a
                href="/register"
                className="text-blue-400 hover:text-blue-300"
              >
                регистрации
              </a>
            </li>
          </ul>
        </div>

        {/* Step 1: Запустить LM Studio */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center justify-center font-mono font-semibold">
              1
            </span>
            <div className="flex-1">
              <h3 className="font-semibold text-white mb-1">Запусти LM Studio</h3>
              <p className="text-sm text-slate-400">
                Открой LM Studio → загрузи модель → во вкладке{" "}
                <span className="font-mono text-slate-300">Server</span> нажми{" "}
                <span className="font-mono text-slate-300">Start Server</span>
                . По умолчанию слушает на{" "}
                <span className="font-mono text-slate-300">localhost:1234</span>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Step 2: Клонировать репозиторий */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center justify-center font-mono font-semibold">
              2
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white mb-2">
                Скачай и установи tunnel клиент
              </h3>
              <div className="relative">
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto">
                  <code>{`git clone https://github.com/igor1000rr/nit-builder.git
cd nit-builder
npm install`}</code>
                </pre>
                <button
                  type="button"
                  onClick={() =>
                    copy(
                      "git clone https://github.com/igor1000rr/nit-builder.git\ncd nit-builder\nnpm install",
                      "clone",
                    )
                  }
                  className="absolute top-2 right-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs transition"
                >
                  {copied === "clone" ? "✓" : "Копировать"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Запустить tunnel */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center justify-center font-mono font-semibold">
              3
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white mb-2">
                Запусти tunnel с твоим токеном
              </h3>
              <p className="text-sm text-slate-400 mb-3">
                Замени{" "}
                <span className="font-mono text-amber-300">YOUR_TOKEN</span> на
                tunnel token полученный при регистрации.
              </p>
              <div className="relative">
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto">
                  <code>{`cd tunnel
npm run dev -- \\
  --token YOUR_TOKEN \\
  --server ${SERVER_URL} \\
  --lm-studio http://localhost:1234/v1`}</code>
                </pre>
                <button
                  type="button"
                  onClick={() =>
                    copy(
                      `cd tunnel\nnpm run dev -- \\\n  --token YOUR_TOKEN \\\n  --server ${SERVER_URL} \\\n  --lm-studio http://localhost:1234/v1`,
                      "run",
                    )
                  }
                  className="absolute top-2 right-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs transition"
                >
                  {copied === "run" ? "✓" : "Копировать"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Verify */}
        <div className="mb-10">
          <div className="flex items-start gap-4 mb-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-mono font-semibold">
              ✓
            </span>
            <div className="flex-1">
              <h3 className="font-semibold text-white mb-2">Готово</h3>
              <p className="text-sm text-slate-400 mb-3">
                Если в терминале появилось{" "}
                <span className="font-mono text-emerald-300">
                  ✓ Authenticated as user...
                </span>
                , значит туннель подключён. Возвращайся на{" "}
                <a href="/" className="text-blue-400 hover:text-blue-300">
                  главную
                </a>
                {" "}— в навбаре должен загореться зелёный индикатор «Туннель
                онлайн».
              </p>
            </div>
          </div>
        </div>

        {/* Native apps coming soon */}
        <div className="mb-8 p-5 bg-slate-900/30 border border-slate-800 rounded-2xl">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span className="text-xl">🚧</span> Нативные приложения — скоро
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Готовится Tauri-клиент с GUI для macOS, Windows и Linux. Не нужно
            будет ставить Node.js — просто скачать .dmg / .exe / .AppImage и
            ввести токен.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl opacity-60">
              <div className="text-2xl mb-1">🍎</div>
              <div className="text-xs text-slate-400">macOS</div>
              <div className="text-[10px] text-slate-600 mt-1">скоро</div>
            </div>
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl opacity-60">
              <div className="text-2xl mb-1">🪟</div>
              <div className="text-xs text-slate-400">Windows</div>
              <div className="text-[10px] text-slate-600 mt-1">скоро</div>
            </div>
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl opacity-60">
              <div className="text-2xl mb-1">🐧</div>
              <div className="text-xs text-slate-400">Linux</div>
              <div className="text-[10px] text-slate-600 mt-1">скоро</div>
            </div>
          </div>
        </div>

        {/* System requirements */}
        <div className="p-5 bg-slate-900/30 border border-slate-800 rounded-2xl">
          <h3 className="font-semibold text-white mb-3">Системные требования</h3>
          <ul className="text-sm text-slate-400 space-y-2">
            <li>
              • <span className="text-slate-300">GPU:</span> любая с 6+ ГБ
              VRAM (для 7B моделей) или 4 ГБ (для 3B). CPU fallback работает,
              но медленно.
            </li>
            <li>
              • <span className="text-slate-300">Диск:</span> 5-15 ГБ под
              модель + 200 МБ под зависимости
            </li>
            <li>
              • <span className="text-slate-300">Интернет:</span> стабильный
              канал для WebSocket (туннель — персистентное соединение)
            </li>
            <li>
              • <span className="text-slate-300">ОС:</span> macOS 11+, Windows
              10+, любой современный Linux
            </li>
          </ul>
        </div>
      </main>

      <footer className="border-t border-slate-900 py-8 text-center text-xs text-slate-600">
        <p>
          NIT Builder · MIT license · open-source ·{" "}
          <a
            href="https://github.com/igor1000rr/nit-builder"
            target="_blank"
            rel="noopener"
            className="hover:text-slate-400 transition"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
