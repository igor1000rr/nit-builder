import { useState, useCallback, useRef, useEffect } from "react";
import { SimplePromptInput } from "~/components/simple/SimplePromptInput";
import { TemplateGrid } from "~/components/simple/TemplateGrid";
import { LocalModelStatus } from "~/components/simple/LocalModelStatus";
import { LivePreview } from "~/components/simple/LivePreview";
import { PolishChat } from "~/components/simple/PolishChat";
import { PipelineProgress } from "~/components/simple/PipelineProgress";
import { HistoryPanel } from "~/components/simple/HistoryPanel";
import { ToastContainer } from "~/components/simple/ToastContainer";
import { parseSseStream } from "~/lib/utils/sseParser";
import { saveToHistory, type HistoryEntry } from "~/lib/stores/historyStore";
import { toast } from "~/lib/stores/toastStore";
import { useKeyboardShortcuts } from "~/lib/hooks/useKeyboardShortcuts";

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
  const [projectId] = useState(() => `simple-${crypto.randomUUID()}`);
  const sessionIdRef = useRef<string | undefined>(undefined);

  // Pipeline tracking
  const [currentStep, setCurrentStep] = useState<PipelineStep>("plan");
  const [templateName, setTemplateName] = useState("");
  const [streamingChars, setStreamingChars] = useState(0);

  // UI state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastTemplateId, setLastTemplateId] = useState("");

  // Throttle iframe updates via rAF
  const pendingHtmlRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const scheduleIframeUpdate = useCallback((html: string, chars: number) => {
    pendingHtmlRef.current = html;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      setStreamingHtml(pendingHtmlRef.current);
      setStreamingChars(chars);
      rafIdRef.current = null;
    });
  }, []);

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

      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      let accumulated = "";
      let localTemplateId = "";
      let localTemplateName = "";
      let chars = 0;

      try {
        const res = await fetch("/api/pipeline/simple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "create",
            projectId,
            sessionId: sessionIdRef.current,
            message: prompt,
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
    [projectId, scheduleIframeUpdate],
  );

  const polishSite = useCallback(
    async (request: string) => {
      setChatMessages((prev) => [...prev, { role: "user", text: request }]);
      setLoading(true);

      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;
      let accumulated = "";

      try {
        const res = await fetch("/api/pipeline/simple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "polish",
            projectId,
            sessionId: sessionIdRef.current,
            message: request,
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
    [projectId, scheduleIframeUpdate],
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
    toast.warning("Генерация отменена");
    setMode("welcome");
  }, []);

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
        if (historyOpen) setHistoryOpen(false);
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
  ]);

  // ─── Welcome screen ─────────────────────────────────
  if (mode === "welcome") {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <ToastContainer />
        <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)} onOpen={openFromHistory} />

        <nav className="px-6 py-5 flex justify-between items-center max-w-6xl mx-auto">
          <a href="/" className="font-bold text-xl bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            NIT Builder
          </a>
          <div className="flex gap-2 text-sm items-center">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="px-4 py-2 text-slate-400 hover:text-white transition rounded-full hover:bg-slate-900 flex items-center gap-2"
            >
              <span>📚</span>
              <span className="hidden sm:inline">Мои сайты</span>
            </button>
            <a href="/about" className="px-4 py-2 text-slate-400 hover:text-white transition rounded-full hover:bg-slate-900">
              О проекте
            </a>
            <a
              href="https://github.com/igor1000rr/nit-builder"
              target="_blank"
              rel="noopener"
              className="px-4 py-2 bg-slate-800 rounded-full hover:bg-slate-700 transition inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
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
            <LocalModelStatus />
          </div>

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

  // ─── Generating screen ──────────────────────────────
  if (mode === "generating") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        <ToastContainer />
        <nav className="px-6 py-4 flex justify-between items-center border-b border-slate-900">
          <a href="/" className="font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            NIT Builder
          </a>
          <button
            type="button"
            onClick={cancelGeneration}
            className="text-sm text-slate-500 hover:text-white transition flex items-center gap-2"
          >
            Отмена <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px]">Esc</kbd>
          </button>
        </nav>

        <div className="flex-1 flex flex-col">
          <div className="py-10 px-6">
            <PipelineProgress
              currentStep={currentStep}
              templateName={templateName}
              streamingChars={streamingChars}
            />
          </div>

          <div className="flex-1 p-4 overflow-auto flex items-start justify-center">
            {streamingHtml ? (
              <iframe
                title="streaming preview"
                srcDoc={streamingHtml}
                sandbox="allow-scripts"
                className="w-full max-w-6xl border-0 bg-white rounded-xl shadow-2xl"
                style={{ height: "calc(100vh - 320px)", minHeight: "400px" }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-blue-500 animate-spin mb-6" />
                <p className="text-slate-400 text-sm">Подожди несколько секунд...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Editing screen ─────────────────────────────────
  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      <ToastContainer />
      <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)} onOpen={openFromHistory} />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_380px] overflow-hidden">
        <LivePreview
          html={streamingHtml || html}
          onOpenCode={() => {
            const blob = new Blob([streamingHtml || html], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
          }}
          onNew={reset}
        />
        <PolishChat onPolish={polishSite} messages={chatMessages} loading={loading} />
      </div>
    </div>
  );
}
