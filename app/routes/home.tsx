import { useState, useCallback, useRef, useEffect } from "react";
import { SimplePromptInput } from "~/components/simple/SimplePromptInput";
import { TemplateGrid } from "~/components/simple/TemplateGrid";
import { PolishChat } from "~/components/simple/PolishChat";
import { HistoryPanel } from "~/components/simple/HistoryPanel";
import { ToastContainer } from "~/components/simple/ToastContainer";
import { parseSseStream } from "~/lib/utils/sseParser";
import { saveToHistory, type HistoryEntry } from "~/lib/stores/historyStore";
import { saveRemoteSite } from "~/lib/stores/remoteHistoryStore";
import { toast } from "~/lib/stores/toastStore";
import { useKeyboardShortcuts } from "~/lib/hooks/useKeyboardShortcuts";
import { useAuth } from "~/lib/hooks/useAuth";
import { useControlSocket } from "~/lib/hooks/useControlSocket";
import { uuid } from "~/lib/utils/uuid";
import { SettingsDrawer } from "~/components/simple/SettingsDrawer";
import { AuthBadge } from "~/components/simple/AuthBadge";

type ViewMode = "welcome" | "generating" | "editing";
type PipelineStep = "plan" | "template" | "code" | "done";
type ChatMessage = { role: "user" | "assistant"; text: string };

export function meta() {
  return [
    { title: "NIT Builder — Создай сайт на своём компьютере за минуту" },
    {
      name: "description",
      content: "AI-конструктор сайтов работающий локально через LM Studio. Бесплатно, приватно, без подписки.",
    },
  ];
}

export default function Home() {
  const [mode, setMode] = useState<ViewMode>("welcome");
  const [html, setHtml] = useState("");
  const [streamingHtml, setStreamingHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [projectId] = useState(() => `simple-${uuid()}`);
  const sessionIdRef = useRef<string | undefined>(undefined);

  // Pipeline tracking
  const [currentStep, setCurrentStep] = useState<PipelineStep>("plan");
  const [templateName, setTemplateName] = useState("");
  const [streamingChars, setStreamingChars] = useState(0);

  // UI state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Provider override — kept for v1 HTTP fallback path. Phase B+ uses tunnel
  // routing which doesn't need provider selection (LM Studio is the only
  // option on the user's side via the tunnel client).
  const selectedProvider: string | null = null;
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastTemplateId, setLastTemplateId] = useState("");

  // Auth + WebSocket tunnel state (Phase B.5)
  const auth = useAuth();
  const activeRequestIdRef = useRef<string | null>(null);

  // Throttle iframe updates via rAF
  const pendingHtmlRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const scheduleIframeUpdate = useCallback((htmlStr: string, chars: number) => {
    pendingHtmlRef.current = htmlStr;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      setStreamingHtml(pendingHtmlRef.current);
      setStreamingChars(chars);
      rafIdRef.current = null;
    });
  }, []);

  // WebSocket control socket — dispatches server events to state
  const handleWsEvent = useCallback(
    (event: import("@nit/shared").ServerToBrowser) => {
      switch (event.type) {
        case "generate_step": {
          if (event.step === "plan") setCurrentStep("plan");
          else if (event.step === "template") {
            setCurrentStep("template");
            if (event.templateName) setTemplateName(event.templateName);
            if (event.templateId) setLastTemplateId(event.templateId);
          } else if (event.step === "code") setCurrentStep("code");
          else if (event.step === "done") setCurrentStep("done");
          break;
        }
        case "generate_text": {
          const next = (pendingHtmlRef.current || "") + event.text;
          scheduleIframeUpdate(next, next.length);
          break;
        }
        case "generate_done": {
          setHtml(event.html);
          setStreamingHtml(event.html);
          setMode("editing");
          setLoading(false);
          setCurrentStep("done");
          activeRequestIdRef.current = null;

          setChatMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: `Готово ✨ Шаблон: ${event.templateName}. Сгенерировано за ${(event.durationMs / 1000).toFixed(1)}s. Опиши правки — применю.`,
            },
          ]);

          // Save to history (local + remote if authed)
          try {
            const entry: HistoryEntry = {
              id: uuid(),
              createdAt: Date.now(),
              prompt: lastPrompt,
              templateId: event.templateId,
              templateName: event.templateName,
              html: event.html,
            };
            saveToHistory(entry);
            // Fire-and-forget remote save (non-blocking, ignore errors)
            void saveRemoteSite({
              prompt: lastPrompt,
              html: event.html,
              templateId: event.templateId,
              templateName: event.templateName,
            });
          } catch {
            // ignore storage failures
          }
          toast.success(`Сайт готов за ${(event.durationMs / 1000).toFixed(1)}s`);
          break;
        }
        case "generate_error": {
          setLoading(false);
          activeRequestIdRef.current = null;

          let msg = event.error;
          if (event.code === "NO_TUNNEL") {
            msg = "Твой туннель не подключён. Запусти NIT Tunnel клиент.";
          } else if (event.code === "TUNNEL_DISCONNECTED") {
            msg = "Туннель отключился во время генерации. Попробуй снова.";
          }
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", text: `❌ ${msg}` },
          ]);
          // Stay on split view if we already have a site or chat history,
          // otherwise bounce back to welcome
          if (!html) {
            setMode("welcome");
          }
          toast.error(msg);
          break;
        }
      }
    },
    [lastPrompt, scheduleIframeUpdate],
  );

  const socket = useControlSocket({
    enabled: auth.status === "authenticated",
    onEvent: handleWsEvent,
  });

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      abortCtrlRef.current?.abort();
    };
  }, []);

  const createSite = useCallback(
    async (prompt: string) => {
      setMode("generating");
      setLoading(true);
      setStreamingHtml("");
      setTemplateName("");
      setStreamingChars(0);
      setCurrentStep("plan");
      setLastPrompt(prompt);
      pendingHtmlRef.current = "";

      // Seed the chat with the user's initial prompt so the split-view
      // layout (chat left, preview right) has something to show from
      // the very first moment of generation.
      setChatMessages([{ role: "user", text: prompt }]);

      // Phase B.5: Prefer WebSocket tunnel path if authed and tunnel online.
      // Events flow through handleWsEvent → state updates happen there.
      if (
        auth.status === "authenticated" &&
        socket.status === "authed" &&
        socket.tunnelStatus === "online"
      ) {
        const requestId = `req-${uuid()}`;
        activeRequestIdRef.current = requestId;
        const sent = socket.sendGenerate({
          requestId,
          mode: "create",
          prompt,
        });
        if (!sent) {
          toast.error("Туннель не готов. Попробуй ещё раз.");
          setLoading(false);
          setMode("welcome");
          return;
        }
        return; // Response handled via handleWsEvent
      }

      // Fallback: HTTP streaming path (legacy v1)
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      let accumulated = "";
      let localTemplateId = "";
      let localTemplateName = "";
      let chars = 0;

      try {
        const res = await fetch("/api/pipeline/simple", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "create",
            projectId,
            sessionId: sessionIdRef.current,
            message: prompt,
            providerId: selectedProvider ?? undefined,
          }),
          signal: ctrl.signal,
        });

        await parseSseStream(res, (event) => {
          switch (event.type) {
            case "session_init":
              sessionIdRef.current = event.sessionId as string;
              break;
            case "plan_ready":
              setCurrentStep("template");
              break;
            case "template_selected":
              localTemplateId = event.templateId as string;
              localTemplateName = event.templateName as string;
              setTemplateName(localTemplateName);
              setCurrentStep("template");
              break;
            case "step_start":
              if (event.roleName === "Кодер") {
                setCurrentStep("code");
              }
              break;
            case "text":
              accumulated += event.text as string;
              chars = accumulated.length;
              scheduleIframeUpdate(accumulated, chars);
              break;
            case "step_complete":
              if (event.html) accumulated = event.html as string;
              break;
            case "error":
              throw new Error((event.message as string) || "Неизвестная ошибка");
          }
        });

        setCurrentStep("done");
        setHtml(accumulated);
        setStreamingHtml("");
        setLastTemplateId(localTemplateId);

        // Save to local history
        if (accumulated && localTemplateId) {
          saveToHistory({
            prompt,
            html: accumulated,
            templateId: localTemplateId,
            templateName: localTemplateName,
          });
          // Fire-and-forget remote save when authed
          if (auth.status === "authenticated") {
            void saveRemoteSite({
              prompt,
              html: accumulated,
              templateId: localTemplateId,
              templateName: localTemplateName,
            });
          }
          toast.success("Сайт создан и сохранён в истории");
        }

        setMode("editing");
      } catch (err) {
        const msg = (err as Error).message;
        if ((err as Error).name !== "AbortError") {
          toast.error(`Ошибка: ${msg}`);
        }
        setMode("welcome");
      } finally {
        setLoading(false);
        abortCtrlRef.current = null;
      }
    },
    [projectId, scheduleIframeUpdate, selectedProvider, auth.status, socket],
  );

  const polishSite = useCallback(
    async (request: string) => {
      setChatMessages((prev) => [...prev, { role: "user", text: request }]);
      setLoading(true);

      // Phase B.5: Prefer WebSocket tunnel path
      if (
        auth.status === "authenticated" &&
        socket.status === "authed" &&
        socket.tunnelStatus === "online"
      ) {
        const requestId = `req-${uuid()}`;
        activeRequestIdRef.current = requestId;
        pendingHtmlRef.current = "";
        setStreamingHtml("");
        const sent = socket.sendGenerate({
          requestId,
          mode: "polish",
          prompt: request,
          previousHtml: html,
        });
        if (!sent) {
          toast.error("Туннель не готов. Попробуй ещё раз.");
          setLoading(false);
          return;
        }
        return;
      }

      // Fallback: HTTP path
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;
      let accumulated = "";

      try {
        const res = await fetch("/api/pipeline/simple", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "polish",
            projectId,
            sessionId: sessionIdRef.current,
            message: request,
            providerId: selectedProvider ?? undefined,
          }),
          signal: ctrl.signal,
        });

        await parseSseStream(res, (event) => {
          switch (event.type) {
            case "session_init":
              sessionIdRef.current = event.sessionId as string;
              break;
            case "text":
              accumulated += event.text as string;
              scheduleIframeUpdate(accumulated, accumulated.length);
              break;
            case "step_complete":
              if (event.html) accumulated = event.html as string;
              break;
            case "error":
              throw new Error((event.message as string) || "Неизвестная ошибка");
          }
        });

        setHtml(accumulated);
        setStreamingHtml("");
        setChatMessages((prev) => [...prev, { role: "assistant", text: "Готово ✨" }]);
        toast.success("Правки применены");
      } catch (err) {
        const msg = (err as Error).message;
        if ((err as Error).name !== "AbortError") {
          setChatMessages((prev) => [...prev, { role: "assistant", text: `Ошибка: ${msg}` }]);
          toast.error(`Ошибка правки: ${msg}`);
        }
        setStreamingHtml("");
      } finally {
        setLoading(false);
        abortCtrlRef.current = null;
      }
    },
    [projectId, scheduleIframeUpdate, selectedProvider, auth.status, socket, html],
  );

  const openFromHistory = useCallback((entry: HistoryEntry) => {
    setHtml(entry.html);
    setStreamingHtml("");
    setLastPrompt(entry.prompt);
    setLastTemplateId(entry.templateId);
    setTemplateName(entry.templateName);
    setChatMessages([]);
    setHistoryOpen(false);
    setMode("editing");
    toast.info(`Открыт сайт: ${entry.templateName}`);
  }, []);

  const reset = useCallback(() => {
    setMode("welcome");
    setHtml("");
    setStreamingHtml("");
    setChatMessages([]);
    setTemplateName("");
    setStreamingChars(0);
    setCurrentStep("plan");
    sessionIdRef.current = undefined;
  }, []);

  const cancelGeneration = useCallback(() => {
    abortCtrlRef.current?.abort();
    // Phase B.5: also abort via WebSocket if active request is being routed via tunnel
    if (activeRequestIdRef.current) {
      socket.sendAbort(activeRequestIdRef.current);
      activeRequestIdRef.current = null;
    }
    setLoading(false);
    toast.warning("Генерация отменена");
    setMode("welcome");
  }, [socket]);

  const downloadHtml = useCallback(() => {
    const content = streamingHtml || html;
    if (!content) return;
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nit-${lastTemplateId || "site"}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("HTML скачан");
  }, [html, streamingHtml, lastTemplateId]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "Escape",
      handler: () => {
        if (settingsOpen) setSettingsOpen(false);
        else if (historyOpen) setHistoryOpen(false);
        else if (mode === "generating") cancelGeneration();
      },
      description: "Отмена / закрыть",
    },
    {
      key: "h",
      meta: true,
      handler: () => setHistoryOpen(true),
      description: "⌘H — История",
    },
    {
      key: "h",
      ctrl: true,
      handler: () => setHistoryOpen(true),
      description: "Ctrl+H — История",
    },
    {
      key: "d",
      meta: true,
      handler: () => mode === "editing" && downloadHtml(),
      description: "⌘D — Скачать",
    },
    {
      key: "d",
      ctrl: true,
      handler: () => mode === "editing" && downloadHtml(),
      description: "Ctrl+D — Скачать",
    },
    {
      key: ",",
      meta: true,
      handler: () => setSettingsOpen(true),
      description: "⌘, — Настройки",
    },
    {
      key: ",",
      ctrl: true,
      handler: () => setSettingsOpen(true),
      description: "Ctrl+, — Настройки",
    },
  ]);

  // ─── Welcome screen ─────────────────────────────────
  if (mode === "welcome") {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <ToastContainer />
        <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)} onOpen={openFromHistory} />
        <SettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

        <nav className="px-6 py-5 flex justify-between items-center max-w-6xl mx-auto">
          <a href="/" className="font-bold text-xl bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            NIT Builder
          </a>
          <div className="flex gap-2 text-sm items-center">
            {auth.status === "authenticated" && (
              <>
                <div
                  className={`hidden md:flex items-center gap-2 px-3 py-2 rounded-full text-xs ${
                    socket.tunnelStatus === "online"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-900 text-slate-500 border border-slate-800"
                  }`}
                  title={
                    socket.tunnelStatus === "online"
                      ? `${socket.activeTunnels} активных туннелей`
                      : "Туннель не подключён — запусти NIT Tunnel клиент"
                  }
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      socket.tunnelStatus === "online"
                        ? "bg-emerald-400 animate-pulse"
                        : "bg-slate-600"
                    }`}
                  />
                  <span>
                    {socket.tunnelStatus === "online"
                      ? `Туннель онлайн (${socket.activeTunnels})`
                      : "Туннель офлайн"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition rounded-full hover:bg-slate-900 flex items-center gap-2"
                >
                  <span>📚</span>
                  <span className="hidden sm:inline">Мои сайты</span>
                </button>
              </>
            )}
            <a href="/about" className="hidden sm:block px-4 py-2 text-slate-400 hover:text-white transition rounded-full hover:bg-slate-900">
              О проекте
            </a>
            <a
              href="https://github.com/igor1000rr/nit-builder"
              target="_blank"
              rel="noopener"
              className="hidden md:inline-flex px-4 py-2 bg-slate-800 rounded-full hover:bg-slate-700 transition items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <AuthBadge auth={auth} onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-6 pt-12 md:pt-16 pb-20">
          <div className="text-center mb-10">
            <h1 className="text-5xl md:text-7xl font-extrabold mb-6 leading-tight">
              Создай сайт<br />
              <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
                за минуту
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
              AI-конструктор работающий на твоём компьютере через LM Studio. Бесплатно, приватно, без подписки.
            </p>
          </div>

          {/* Tunnel offline banner — prompts authed users to install client */}
          {auth.status === "authenticated" && socket.tunnelStatus === "offline" && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
              <span className="text-2xl">🔌</span>
              <div className="flex-1">
                <div className="font-semibold text-amber-200 mb-1">
                  Туннель не подключён
                </div>
                <p className="text-sm text-amber-200/80">
                  Чтобы генерировать сайты через свой GPU, скачай NIT Tunnel
                  клиент и подключи свой токен.
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <a
                  href="/download"
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-lg text-xs font-semibold text-white transition hover:scale-[1.02] text-center"
                >
                  Скачать
                </a>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-xs text-amber-100 transition"
                >
                  Настройки
                </button>
              </div>
            </div>
          )}

          {/* Auth loading skeleton — fades in while /api/auth/me resolves */}
          {auth.status === "loading" && (
            <div className="mb-6 p-4 bg-slate-900/30 border border-slate-800 rounded-2xl flex items-center gap-3 animate-pulse">
              <div className="w-5 h-5 rounded-full bg-slate-800" />
              <div className="flex-1 h-3 bg-slate-800 rounded" />
              <div className="w-20 h-7 bg-slate-800 rounded-lg" />
            </div>
          )}

          {/* Not-authenticated prompt — soft encouragement to sign up */}
          {auth.status === "unauthenticated" && (
            <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl flex items-center gap-3">
              <span className="text-xl">👋</span>
              <div className="flex-1 text-sm text-blue-200/80">
                Зарегистрируйся чтобы подключить свой GPU через туннель и
                получить приватную генерацию.
              </div>
              <div className="flex gap-2 shrink-0">
                <a
                  href="/login"
                  className="px-3 py-1.5 text-xs text-blue-200 hover:text-white transition"
                >
                  Войти
                </a>
                <a
                  href="/register"
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-lg text-xs font-semibold transition hover:scale-[1.02]"
                >
                  Регистрация
                </a>
              </div>
            </div>
          )}

          <div className="mb-12">
            <SimplePromptInput onSubmit={createSite} loading={loading} />
          </div>

          <TemplateGrid onSelect={createSite} />
        </main>

        <footer className="text-center py-8 text-slate-600 text-xs border-t border-slate-900">
          <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-center items-center gap-4">
            <span>NIT Builder · MIT license · open-source</span>
            <span className="hidden md:inline">•</span>
            <span className="hidden md:inline">
              <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px]">⌘H</kbd> — история
            </span>
            <span className="hidden md:inline">
              <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px]">⌘↵</kbd> — создать
            </span>
          </div>
        </footer>
      </div>
    );
  }

  // ─── Split layout: chat (left) + preview (right) ──────────────
  // Used for BOTH "generating" and "editing" modes. During generation
  // we stream into the right iframe, show the user's prompt as the first
  // chat bubble, and render a "typing" indicator. After generation the
  // same layout stays — user can polish via chat on the left.
  if (mode === "generating" || mode === "editing") {
    const previewHtml = streamingHtml || html;
    const isGenerating = mode === "generating";

    return (
      <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
        <ToastContainer />
        <HistoryPanel
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onOpen={openFromHistory}
        />
        <SettingsDrawer
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-900 bg-slate-950 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/"
              className="font-bold text-sm bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent shrink-0"
            >
              NIT Builder
            </a>

            {/* Pipeline status during generation */}
            {isGenerating && (
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 min-w-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    currentStep === "plan" ? "bg-blue-400 animate-pulse" : "bg-slate-700"
                  }`}
                />
                <span
                  className={
                    currentStep === "plan"
                      ? "text-blue-400"
                      : "text-slate-600"
                  }
                >
                  Анализ
                </span>
                <span className="text-slate-800">→</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    currentStep === "template"
                      ? "bg-blue-400 animate-pulse"
                      : currentStep === "code" || currentStep === "done"
                        ? "bg-emerald-400"
                        : "bg-slate-700"
                  }`}
                />
                <span
                  className={
                    currentStep === "template"
                      ? "text-blue-400"
                      : "text-slate-600"
                  }
                >
                  {templateName ? `Шаблон: ${templateName}` : "Шаблон"}
                </span>
                <span className="text-slate-800">→</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    currentStep === "code"
                      ? "bg-blue-400 animate-pulse"
                      : currentStep === "done"
                        ? "bg-emerald-400"
                        : "bg-slate-700"
                  }`}
                />
                <span
                  className={
                    currentStep === "code"
                      ? "text-blue-400"
                      : "text-slate-600"
                  }
                >
                  Код
                  {streamingChars > 0 && ` (${streamingChars})`}
                </span>
              </div>
            )}

            {/* Tunnel badge when not generating */}
            {!isGenerating &&
              auth.status === "authenticated" &&
              socket.tunnelStatus !== "unknown" && (
                <div
                  className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${
                    socket.tunnelStatus === "online"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-900 text-slate-500 border border-slate-800"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      socket.tunnelStatus === "online"
                        ? "bg-emerald-400 animate-pulse"
                        : "bg-slate-600"
                    }`}
                  />
                  <span>
                    {socket.tunnelStatus === "online"
                      ? `туннель (${socket.activeTunnels})`
                      : "офлайн"}
                  </span>
                </div>
              )}
          </div>

          <div className="flex items-center gap-2">
            {isGenerating ? (
              <button
                type="button"
                onClick={cancelGeneration}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition rounded-full hover:bg-slate-900 flex items-center gap-1.5"
                title="Отмена (Esc)"
              >
                <span>✕</span>
                <span className="hidden sm:inline">Отмена</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={reset}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition rounded-full hover:bg-slate-900 flex items-center gap-1.5"
                  title="Создать новый сайт"
                >
                  <span>➕</span>
                  <span className="hidden sm:inline">Новый</span>
                </button>
                {auth.status === "authenticated" && (
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="hidden sm:flex px-3 py-1.5 text-xs text-slate-400 hover:text-white transition rounded-full hover:bg-slate-900 items-center gap-1.5"
                    title="Мои сайты (⌘H)"
                  >
                    <span>📚</span>
                    <span className="hidden md:inline">Мои сайты</span>
                  </button>
                )}
              </>
            )}
            <AuthBadge
              auth={auth}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </div>

        {/* Chat (left) + Preview (right) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[400px_1fr] overflow-hidden">
          <PolishChat
            onPolish={polishSite}
            messages={chatMessages}
            loading={loading}
            loadingLabel={
              isGenerating
                ? currentStep === "plan"
                  ? "анализирую промпт..."
                  : currentStep === "template"
                    ? "подбираю шаблон..."
                    : currentStep === "code"
                      ? `генерирую код (${streamingChars} симв.)`
                      : "работаю..."
                : "применяю правки..."
            }
          />

          <div className="flex flex-col bg-slate-900 overflow-hidden">
            {previewHtml ? (
              <iframe
                title="preview"
                srcDoc={previewHtml}
                sandbox="allow-scripts"
                className="w-full h-full border-0 bg-white"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-blue-500 animate-spin mb-6" />
                <p className="text-sm">Подожди несколько секунд...</p>
                <p className="text-xs mt-2 text-slate-600">
                  Превью появится здесь по мере генерации
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback (should never reach here — welcome/generating/editing are all
  // handled above)
  return null;
}
