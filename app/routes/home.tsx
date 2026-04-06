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
import { GridBg, Orbs, Chip, NitButton, StatusDot, GlitchHeading, Particles, ScanLine, HorizontalParticles, ConicRays, Beams } from "~/components/nit";

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
      <div className="relative min-h-screen text-[color:var(--ink)] nit-grain overflow-x-hidden">
        <ConicRays />
        <GridBg />
        <Orbs />
        <Beams />
        <Particles count={30} />
        <HorizontalParticles count={15} />
        <ScanLine />
        <ToastContainer />
        <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)} onOpen={openFromHistory} />
        <SettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* NAV */}
        <nav
          className="relative z-10 px-8 py-5 flex justify-between items-center max-w-[1400px] mx-auto"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <a href="/" className="flex items-center gap-3 no-underline">
            <span
              className="block w-7 h-7 relative"
              style={{
                background:
                  "conic-gradient(from 0deg, var(--accent), var(--magenta), var(--acid), var(--accent))",
                animation: "nit-spin 8s linear infinite",
              }}
            >
              <span className="absolute inset-[3px]" style={{ background: "var(--bg)" }} />
            </span>
            <span className="nit-display text-lg text-[color:var(--ink)]">NIT.BUILDER</span>
          </a>

          <div className="flex gap-2 items-center">
            {auth.status === "authenticated" && (
              <>
                <div className="hidden md:block">
                  <StatusDot
                    status={socket.tunnelStatus === "online" ? "online" : "offline"}
                    label={
                      socket.tunnelStatus === "online"
                        ? `TUNNEL · ${socket.activeTunnels}`
                        : "TUNNEL OFF"
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="hidden sm:flex px-4 py-2 text-[11px] tracking-[0.15em] uppercase text-[color:var(--muted)] hover:text-[color:var(--ink)] transition items-center gap-2"
                  style={{ border: "1px solid var(--line)" }}
                >
                  <span>⌘H</span>
                  <span>History</span>
                </button>
              </>
            )}
            <a
              href="https://github.com/igor1000rr/nit-builder"
              target="_blank"
              rel="noopener"
              className="hidden md:inline-flex px-4 py-2 text-[11px] tracking-[0.15em] uppercase no-underline transition items-center gap-2 text-[color:var(--muted)] hover:text-[color:var(--accent-glow)]"
              style={{ border: "1px solid var(--line)" }}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub
            </a>
            <AuthBadge auth={auth} onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        </nav>

        <main className="relative z-10 max-w-5xl mx-auto px-8 pt-16 md:pt-24 pb-20">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-6">
              <Chip color="acid">⏵ AI editor · powered by your GPU</Chip>
            </div>
            <GlitchHeading
              lines={["Опиши.", "Сгенерь.", ["ВЛАДЕЙ.", "glitch"]]}
              className="text-center !text-[clamp(48px,9vw,128px)]"
            />
            <p className="text-[15px] text-[color:var(--muted)] max-w-[600px] mx-auto leading-[1.7] mt-4">
              Один промпт → готовый HTML-сайт. Стрим из{" "}
              <span className="nit-mark">твоего GPU</span> через peer-to-peer
              tunnel. Никакого облака, никаких лимитов.
            </p>
          </div>

          {/* Tunnel offline banner */}
          {auth.status === "authenticated" && socket.tunnelStatus === "offline" && (
            <div
              className="mb-8 p-5 flex items-start gap-4"
              style={{
                border: "1px solid var(--magenta)",
                background: "rgba(255,46,147,0.05)",
              }}
            >
              <span
                className="text-[10px] tracking-[0.2em] uppercase shrink-0 px-2 py-1 mt-0.5"
                style={{ color: "var(--magenta)", border: "1px solid var(--magenta)" }}
              >
                ⚠ TUNNEL OFFLINE
              </span>
              <div className="flex-1">
                <p className="text-[13px] text-[color:var(--ink)] mb-1">
                  CLI не подключён к серверу.
                </p>
                <p className="text-[12px] text-[color:var(--muted)]">
                  Скачай tunnel клиент и запусти с твоим токеном — генерация
                  пойдёт через твой GPU.
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <a
                  href="/download"
                  className="px-4 py-2 text-[10px] font-bold tracking-[0.15em] uppercase no-underline text-black transition"
                  style={{ background: "var(--accent)" }}
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="px-4 py-2 text-[10px] font-bold tracking-[0.15em] uppercase transition"
                  style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}
                >
                  Settings
                </button>
              </div>
            </div>
          )}

          {auth.status === "loading" && (
            <div
              className="mb-8 p-4 flex items-center gap-3"
              style={{ border: "1px solid var(--line)", background: "var(--bg-glass)" }}
            >
              <div className="w-2 h-2 rounded-full bg-[color:var(--muted)] animate-pulse" />
              <div className="text-[11px] tracking-[0.15em] uppercase text-[color:var(--muted)]">
                Authenticating...
              </div>
            </div>
          )}

          {auth.status === "unauthenticated" && (
            <div
              className="mb-8 p-5 flex items-center gap-4"
              style={{
                border: "1px solid var(--line-strong)",
                background: "rgba(0,212,255,0.04)",
              }}
            >
              <Chip color="accent">⏵ ANONYMOUS</Chip>
              <div className="flex-1 text-[12px] text-[color:var(--muted)]">
                Зарегистрируйся чтобы получить tunnel token и подключить
                свой GPU.
              </div>
              <div className="flex gap-2 shrink-0">
                <a
                  href="/login"
                  className="px-4 py-2 text-[10px] font-bold tracking-[0.15em] uppercase no-underline transition text-[color:var(--muted)] hover:text-[color:var(--ink)]"
                >
                  Login
                </a>
                <a
                  href="/register"
                  className="px-4 py-2 text-[10px] font-bold tracking-[0.15em] uppercase text-black no-underline transition"
                  style={{ background: "var(--accent)" }}
                >
                  Register →
                </a>
              </div>
            </div>
          )}

          <div className="mb-16">
            <SimplePromptInput onSubmit={createSite} loading={loading} />
          </div>

          <div className="text-[10px] tracking-[0.2em] uppercase text-[color:var(--accent-glow)] mb-6 flex items-center gap-3">
            <span className="w-10 h-px bg-[color:var(--accent-glow)]" />
            Templates · 22 ready
          </div>
          <TemplateGrid onSelect={createSite} />
        </main>

        <footer
          className="relative z-10 py-10 text-center text-[10px] tracking-[0.15em] uppercase text-[color:var(--muted-2)]"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <div className="max-w-6xl mx-auto px-8 flex flex-wrap justify-center items-center gap-6">
            <span>NIT.BUILDER · MIT · OPEN SOURCE</span>
            <span className="hidden md:inline">·</span>
            <span className="hidden md:inline">⌘H — HISTORY</span>
            <span className="hidden md:inline">⌘↵ — GENERATE</span>
            <span className="hidden md:inline">⌘, — SETTINGS</span>
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
      <div className="h-screen text-[color:var(--ink)] flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
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
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--line)", background: "var(--bg)" }}
        >
          <div className="flex items-center gap-4 min-w-0">
            <a href="/" className="flex items-center gap-2 no-underline shrink-0">
              <span
                className="block w-5 h-5 relative"
                style={{
                  background:
                    "conic-gradient(from 0deg, var(--accent), var(--magenta), var(--acid), var(--accent))",
                  animation: "nit-spin 8s linear infinite",
                }}
              >
                <span className="absolute inset-[2px]" style={{ background: "var(--bg)" }} />
              </span>
              <span className="nit-display text-[13px]">NIT.BUILDER</span>
            </a>

            <span
              className="hidden md:inline text-[10px] tracking-[0.15em] uppercase"
              style={{ color: "var(--muted-2)" }}
            >
              // session/{projectId.slice(-8)}
            </span>

            {/* Pipeline status during generation — ASCII-style progress */}
            {isGenerating && (
              <div className="hidden md:flex items-center gap-3 text-[10px] tracking-[0.15em] uppercase">
                <PipeStep
                  active={currentStep === "plan"}
                  done={currentStep === "template" || currentStep === "code" || currentStep === "done"}
                  label="01·ANALYZE"
                />
                <span style={{ color: "var(--muted-2)" }}>→</span>
                <PipeStep
                  active={currentStep === "template"}
                  done={currentStep === "code" || currentStep === "done"}
                  label={templateName ? `02·${templateName.toUpperCase()}` : "02·TEMPLATE"}
                />
                <span style={{ color: "var(--muted-2)" }}>→</span>
                <PipeStep
                  active={currentStep === "code"}
                  done={currentStep === "done"}
                  label={streamingChars > 0 ? `03·CODE [${streamingChars}]` : "03·CODE"}
                />
              </div>
            )}

            {/* Tunnel badge when not generating */}
            {!isGenerating &&
              auth.status === "authenticated" &&
              socket.tunnelStatus !== "unknown" && (
                <div className="hidden md:block">
                  <StatusDot
                    status={socket.tunnelStatus === "online" ? "online" : "offline"}
                    label={
                      socket.tunnelStatus === "online"
                        ? `TUNNEL · ${socket.activeTunnels}`
                        : "TUNNEL OFF"
                    }
                  />
                </div>
              )}
          </div>

          <div className="flex items-center gap-2">
            {isGenerating ? (
              <button
                type="button"
                onClick={cancelGeneration}
                className="px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase transition flex items-center gap-2"
                style={{
                  border: "1px solid var(--magenta)",
                  color: "var(--magenta)",
                }}
                title="Отмена (Esc)"
              >
                <span>✕</span>
                <span className="hidden sm:inline">Abort</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={reset}
                  className="px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase transition flex items-center gap-2 text-[color:var(--muted)] hover:text-[color:var(--ink)]"
                  style={{ border: "1px solid var(--line)" }}
                  title="Создать новый сайт"
                >
                  <span>+</span>
                  <span className="hidden sm:inline">New</span>
                </button>
                {auth.status === "authenticated" && (
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="hidden sm:flex px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase transition items-center gap-2 text-[color:var(--muted)] hover:text-[color:var(--ink)]"
                    style={{ border: "1px solid var(--line)" }}
                    title="Мои сайты (⌘H)"
                  >
                    <span>⌘H</span>
                    <span className="hidden md:inline">History</span>
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
                  ? "// analyzing prompt..."
                  : currentStep === "template"
                    ? "// selecting template..."
                    : currentStep === "code"
                      ? `// streaming code [${streamingChars} bytes]`
                      : "// working..."
                : "// applying patch..."
            }
          />

          <div className="flex flex-col overflow-hidden relative" style={{ background: "var(--bg-2)" }}>
            {previewHtml ? (
              <iframe
                title="preview"
                srcDoc={previewHtml}
                sandbox="allow-scripts"
                className="nit-preview w-full h-full border-0 bg-white"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[color:var(--muted)]">
                <div
                  className="w-16 h-16 rounded-full mb-6 animate-spin"
                  style={{
                    border: "3px solid var(--line)",
                    borderTopColor: "var(--accent-glow)",
                  }}
                />
                <p className="text-[11px] tracking-[0.2em] uppercase">// initializing tunnel...</p>
                <p className="text-[10px] mt-2 tracking-[0.15em] uppercase" style={{ color: "var(--muted-2)" }}>
                  Preview appears as code streams in
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

/* ─── Local sub-components ──────────────────────────────────── */

function PipeStep({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  const color = active ? "var(--accent-glow)" : done ? "var(--acid)" : "var(--muted-2)";
  return (
    <span className="flex items-center gap-1.5" style={{ color }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: color,
          boxShadow: active ? `0 0 8px ${color}` : undefined,
          animation: active ? "nit-pulse 1.5s infinite" : undefined,
        }}
      />
      {label}
    </span>
  );
}
