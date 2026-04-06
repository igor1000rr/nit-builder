import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Скачать NIT Tunnel — NIT Builder" },
  {
    name: "description",
    content:
      "Скачай NIT Tunnel клиент для macOS, Windows или Linux и подключи свой GPU к NIT Builder.",
  },
];

type Platform = "macos-arm" | "macos-intel" | "windows" | "linux" | "unknown";

type PlatformInfo = {
  id: Platform;
  name: string;
  icon: string;
  arch: string;
  fileExt: string;
  fileName: string;
  description: string;
  sizeEstimate: string;
};

const LATEST_VERSION = "0.1.0-alpha";
const RELEASES_BASE = `https://github.com/igor1000rr/nit-builder/releases/download/tunnel-v${LATEST_VERSION}`;

const PLATFORMS: Record<Exclude<Platform, "unknown">, PlatformInfo> = {
  "macos-arm": {
    id: "macos-arm",
    name: "macOS",
    icon: "🍎",
    arch: "Apple Silicon (M1/M2/M3/M4)",
    fileExt: ".dmg",
    fileName: `NIT_Tunnel_${LATEST_VERSION}_aarch64.dmg`,
    description: "Для новых Mac на Apple Silicon. Использует Metal GPU.",
    sizeEstimate: "~15 МБ",
  },
  "macos-intel": {
    id: "macos-intel",
    name: "macOS Intel",
    icon: "🍎",
    arch: "Intel x64",
    fileExt: ".dmg",
    fileName: `NIT_Tunnel_${LATEST_VERSION}_x64.dmg`,
    description: "Для Mac на Intel. Работает через CPU или Metal (если есть дискретка).",
    sizeEstimate: "~18 МБ",
  },
  windows: {
    id: "windows",
    name: "Windows",
    icon: "🪟",
    arch: "Windows 10/11 x64",
    fileExt: ".exe",
    fileName: `NIT_Tunnel_${LATEST_VERSION}_x64-setup.exe`,
    description: "NSIS installer. Поддержка CUDA/DirectML через LM Studio.",
    sizeEstimate: "~12 МБ",
  },
  linux: {
    id: "linux",
    name: "Linux",
    icon: "🐧",
    arch: "Ubuntu 22.04+ / Debian",
    fileExt: ".AppImage",
    fileName: `nit-tunnel_${LATEST_VERSION}_amd64.AppImage`,
    description: "Portable AppImage, chmod +x и запускай. Есть также .deb пакет.",
    sizeEstimate: "~20 МБ",
  },
};

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();

  // Windows
  if (ua.includes("win") || platform.includes("win")) return "windows";

  // Linux
  if (ua.includes("linux") && !ua.includes("android")) return "linux";

  // macOS — distinguish ARM from Intel
  if (ua.includes("mac") || platform.includes("mac")) {
    // Try navigator.userAgentData.platform (modern browsers)
    // Fallback: use maxTouchPoints heuristic (Apple Silicon Macs report >0)
    if (navigator.maxTouchPoints && navigator.maxTouchPoints > 1) {
      // iPad pretending to be Mac → still arm
      return "macos-arm";
    }
    // Very rough: Apple Silicon came after 2020, hard to detect reliably
    // Default to arm since newer Macs dominate
    return "macos-arm";
  }

  return "unknown";
}

export default function Download() {
  const [detected, setDetected] = useState<Platform>("unknown");

  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  const primaryPlatform = detected !== "unknown" ? PLATFORMS[detected] : null;
  const otherPlatforms = Object.values(PLATFORMS).filter(
    (p) => p.id !== detected,
  );

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

      <main className="max-w-4xl mx-auto px-6 pt-12 pb-20">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full text-sm text-blue-300 mb-6">
            <span>⚡</span>
            <span>NIT Tunnel {LATEST_VERSION}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Подключи свой GPU
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            NIT Tunnel — маленький клиент (~15 МБ) который проксирует твою
            локальную LM Studio к NIT Builder. Генерация сайтов через твою
            видеокарту, полностью приватно.
          </p>
        </div>

        {/* Primary download for detected OS */}
        {primaryPlatform && (
          <div className="mb-10">
            <div className="p-6 md:p-8 bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-blue-500/30 rounded-3xl">
              <div className="flex items-start gap-5">
                <div className="text-5xl shrink-0">{primaryPlatform.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-blue-300 uppercase tracking-wider mb-1">
                    Рекомендовано для тебя
                  </div>
                  <h2 className="text-2xl font-bold mb-1">
                    {primaryPlatform.name}
                  </h2>
                  <p className="text-sm text-slate-400 mb-4">
                    {primaryPlatform.arch} · {primaryPlatform.sizeEstimate}
                  </p>
                  <p className="text-sm text-slate-300 mb-5">
                    {primaryPlatform.description}
                  </p>
                  <a
                    href={`${RELEASES_BASE}/${primaryPlatform.fileName}`}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 rounded-xl font-semibold hover:scale-[1.01] transition shadow-lg shadow-blue-500/30"
                  >
                    <span>↓</span>
                    <span>Скачать {primaryPlatform.fileExt}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other platforms */}
        <div className="mb-10">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
            {primaryPlatform ? "Другие платформы" : "Выбери платформу"}
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {otherPlatforms.map((p) => (
              <a
                key={p.id}
                href={`${RELEASES_BASE}/${p.fileName}`}
                className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition group flex items-center gap-4"
              >
                <span className="text-3xl shrink-0">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">{p.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {p.arch} · {p.fileExt} · {p.sizeEstimate}
                  </div>
                </div>
                <span className="text-slate-600 group-hover:text-blue-400 transition">
                  ↓
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Installation steps */}
        <div className="mb-10 p-6 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <h3 className="font-semibold text-white mb-4">Как начать</h3>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs flex items-center justify-center font-mono">
                1
              </span>
              <div className="text-slate-300">
                Скачай и установи NIT Tunnel для твоей ОС
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs flex items-center justify-center font-mono">
                2
              </span>
              <div className="text-slate-300">
                Запусти{" "}
                <a
                  href="https://lmstudio.ai"
                  target="_blank"
                  rel="noopener"
                  className="text-blue-400 hover:text-blue-300"
                >
                  LM Studio
                </a>{" "}
                и загрузи модель (рекомендуем Qwen2.5-Coder-7B-Q4 или
                аналогичную кодовую)
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs flex items-center justify-center font-mono">
                3
              </span>
              <div className="text-slate-300">
                <a href="/register" className="text-blue-400 hover:text-blue-300">
                  Зарегистрируйся
                </a>{" "}
                на NIT Builder и скопируй свой tunnel token (показывается
                один раз при регистрации)
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs flex items-center justify-center font-mono">
                4
              </span>
              <div className="text-slate-300">
                Запусти NIT Tunnel, вставь токен, нажми "Подключиться"
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs flex items-center justify-center font-mono">
                5
              </span>
              <div className="text-slate-300">
                Возвращайся на главную страницу и генерируй сайты — теперь
                через свой GPU 🚀
              </div>
            </li>
          </ol>
        </div>

        {/* Alternative: Node.js CLI */}
        <details className="mb-10">
          <summary className="cursor-pointer text-sm text-slate-400 hover:text-white transition">
            Альтернатива для разработчиков: Node.js CLI →
          </summary>
          <div className="mt-4 p-5 bg-slate-900/50 border border-slate-800 rounded-2xl">
            <p className="text-sm text-slate-300 mb-3">
              Если предпочитаешь командную строку или хочешь запустить туннель на
              сервере без GUI:
            </p>
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto mb-3">
              <code>{`git clone https://github.com/igor1000rr/nit-builder.git
cd nit-builder && npm install
cd tunnel && npm run dev -- \\
  --token YOUR_TUNNEL_TOKEN \\
  --server wss://nit.vibecoding.by/api/tunnel \\
  --lm-studio http://localhost:1234/v1`}</code>
            </pre>
            <p className="text-xs text-slate-500">
              Требует Node.js 20+. Исходники:{" "}
              <a
                href="https://github.com/igor1000rr/nit-builder/tree/main/tunnel"
                target="_blank"
                rel="noopener"
                className="text-blue-400 hover:text-blue-300"
              >
                /tunnel
              </a>
            </p>
          </div>
        </details>

        {/* System requirements */}
        <div className="p-6 bg-slate-900/30 border border-slate-800 rounded-2xl">
          <h3 className="font-semibold text-white mb-3">Системные требования</h3>
          <ul className="text-sm text-slate-400 space-y-2">
            <li>
              • <span className="text-slate-300">Видеокарта:</span> любая с 6+
              ГБ VRAM (для 7B моделей) или 4 ГБ (для 3B моделей). CPU
              fallback работает, но медленно.
            </li>
            <li>
              • <span className="text-slate-300">LM Studio:</span> версия 0.3.0+
              (поддержка OpenAI-совместимого API)
            </li>
            <li>
              • <span className="text-slate-300">Интернет:</span> стабильный
              канал для WebSocket (персистентное соединение к серверу)
            </li>
            <li>
              • <span className="text-slate-300">ОС:</span> macOS 11+, Windows
              10+, Ubuntu 22.04+
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
