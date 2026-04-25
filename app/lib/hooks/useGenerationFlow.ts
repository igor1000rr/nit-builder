/**
 * useGenerationFlow — encapsulates the entire site generation pipeline state.
 *
 * Раньше эта логика жила inline в app/routes/home.tsx (~500 LOC, треть
 * файла) и смешивалась с layout/JSX. Вынос даёт:
 *
 *  - home.tsx становится тонким — только JSX и UI-state (open drawer,
 *    keyboard shortcuts).
 *  - hook покрывается unit-тестами без рендеринга всей home-страницы.
 *  - WebSocket и HTTP-fallback ветки получают единое API: createSite /
 *    polishSite / cancelGeneration. Caller не знает какой path использован.
 *
 * Поведение НЕ изменено vs inline-версии — это refactor, не feature change.
 *
 * Stale-closure fix: раньше `if (!html)` в WS handler читал stale `html`
 * через прямой capture (eslint exhaustive-deps disable comment). Теперь
 * через htmlRef.current — current value читается на момент вызова, без
 * пересоздания callback на каждый setHtml().
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerToBrowser } from "@nit/shared";
import type { ControlSocketStatus, TunnelStatus } from "~/lib/hooks/useControlSocket";
import { runHttpPipeline } from "~/lib/services/pipelineHttpFallback";
import { saveToHistory, type HistoryEntry } from "~/lib/stores/historyStore";
import { saveRemoteSite } from "~/lib/stores/remoteHistoryStore";
import { toast } from "~/lib/stores/toastStore";
import { uuid } from "~/lib/utils/uuid";

// ─── Public types ──────────────────────────────────────────────────

export type ViewMode = "welcome" | "generating" | "editing";
export type PipelineStep = "plan" | "template" | "code" | "done";
export type ChatMessage = { role: "user" | "assistant"; text: string };

/** Минимальный shape того что возвращает useControlSocket — чтобы hook не зависел от полного типа. */
export type ControlSocketLike = {
  status: ControlSocketStatus;
  tunnelStatus: TunnelStatus;
  sendGenerate: (params: {
    requestId: string;
    mode: "create" | "polish";
    prompt: string;
    previousHtml?: string;
  }) => boolean;
  sendAbort: (requestId: string) => void;
};

export type GenerationAuth =
  | { status: "loading" | "unauthenticated" }
  | { status: "authenticated"; userId: string; email: string };

export type UseGenerationFlowOptions = {
  /** Stable, генерируется один раз в caller через useState(uuid). */
  projectId: string;
  /** Auth state — определяет, идти через WS-tunnel или HTTP fallback. */
  auth: GenerationAuth;
  /**
   * Геттер контрол-сокета. Передаётся как функция (не объект) чтобы
   * разорвать круг: useControlSocket ↔ useGenerationFlow.
   * useControlSocket нужен handleWsEvent (получает от этого hook'а),
   * этот hook нужен socket (создаётся useControlSocket'ом). Передавая
   * socket через геттер, caller вызывает useGenerationFlow ДО
   * useControlSocket, а реальный socket читается lazy через ref-внутри
   * useControlSocket'а в caller'е.
   */
  getSocket: () => ControlSocketLike;
};

export type UseGenerationFlow = {
  // ─── State ──────────────────────────────────────────
  mode: ViewMode;
  html: string;
  streamingHtml: string;
  streamingChars: number;
  loading: boolean;
  currentStep: PipelineStep;
  templateName: string;
  lastPrompt: string;
  lastTemplateId: string;
  chatMessages: ChatMessage[];

  // ─── Actions ────────────────────────────────────────
  createSite: (prompt: string) => Promise<void>;
  polishSite: (request: string) => Promise<void>;
  cancelGeneration: () => void;
  /** Используется HistoryPanel при открытии существующего сайта. */
  loadFromHistory: (entry: HistoryEntry) => void;
  reset: () => void;

  // ─── Direct setters (для специфичных UI-нужд) ──────
  setMode: (m: ViewMode) => void;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;

  // ─── WebSocket bridge ───────────────────────────────
  /** Передавать в useControlSocket({ onEvent: handleWsEvent }). */
  handleWsEvent: (event: ServerToBrowser) => void;
};

// ─── Implementation ────────────────────────────────────────────────

export function useGenerationFlow(
  options: UseGenerationFlowOptions,
): UseGenerationFlow {
  const { projectId, auth, getSocket } = options;

  // Pipeline state
  const [mode, setMode] = useState<ViewMode>("welcome");
  const [html, setHtml] = useState("");
  const [streamingHtml, setStreamingHtml] = useState("");
  const [streamingChars, setStreamingChars] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<PipelineStep>("plan");
  const [templateName, setTemplateName] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [lastTemplateId, setLastTemplateId] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Refs (state мы не кладём сюда — useState даёт реактивность; refs только
  // для значений которые не должны вызывать пересоздание callback'ов)
  const sessionIdRef = useRef<string | undefined>(undefined);
  const activeRequestIdRef = useRef<string | null>(null);
  const pendingHtmlRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  // Stale-closure fix: handleWsEvent читает текущий html (для решения
  // stay-on-split vs bounce-to-welcome при error) — но не должен
  // пересоздаваться на каждом setHtml() (иначе useControlSocket
  // переподпишется и потеряет in-flight генерацию).
  const htmlRef = useRef(html);
  useEffect(() => {
    htmlRef.current = html;
  }, [html]);

  // auth ref — для long-lived callback'ов без recreate.
  const authRef = useRef(auth);
  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  // lastPromptRef — handleWsEvent читает lastPrompt при сохранении в
  // history. Объявлен здесь (выше handleWsEvent) для читаемости — раньше
  // был ниже и работал через TDZ + временной gap (callback вызывается
  // только после mount). Так понятнее.
  const lastPromptRef = useRef(lastPrompt);
  useEffect(() => {
    lastPromptRef.current = lastPrompt;
  }, [lastPrompt]);

  // getSocket-ref: caller передаёт стабильную функцию-геттер, мы сохраняем
  // её и читаем актуальный socket на каждый action. Это разрывает
  // зависимостный круг useControlSocket ↔ useGenerationFlow.
  const getSocketRef = useRef(getSocket);
  useEffect(() => {
    getSocketRef.current = getSocket;
  }, [getSocket]);

  // RAF-throttled iframe updates чтобы не блокировать main thread на
  // больших HTML стримах.
  const scheduleIframeUpdate = useCallback((htmlStr: string, chars: number) => {
    pendingHtmlRef.current = htmlStr;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      setStreamingHtml(pendingHtmlRef.current);
      setStreamingChars(chars);
      rafIdRef.current = null;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      abortCtrlRef.current?.abort();
    };
  }, []);

  // ─── WebSocket event handler ──────────────────────────────────────
  // Нет deps кроме scheduleIframeUpdate — все читаемые значения через
  // refs выше. Это устраняет необходимость в eslint-disable который был
  // в inline-версии в home.tsx.
  const handleWsEvent = useCallback(
    (event: ServerToBrowser) => {
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

          // Save to history (local + remote если authed)
          try {
            const entry: HistoryEntry = {
              id: uuid(),
              createdAt: Date.now(),
              prompt: lastPromptRef.current,
              templateId: event.templateId,
              templateName: event.templateName,
              html: event.html,
            };
            saveToHistory(entry);
            void saveRemoteSite({
              prompt: lastPromptRef.current,
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
          } else if (event.code === "RATE_LIMITED") {
            msg = "Слишком много параллельных генераций. Дождись завершения.";
          }
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", text: `❌ ${msg}` },
          ]);
          // Stay on split view if we already have a site, otherwise bounce
          // back to welcome. Через ref — не пересоздаём callback на каждый
          // setHtml.
          if (!htmlRef.current) {
            setMode("welcome");
          }
          toast.error(msg);
          break;
        }
      }
    },
    [scheduleIframeUpdate],
  );

  // ─── Actions ──────────────────────────────────────────────────────

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

      // Seed chat с первым сообщением юзера для split-view.
      setChatMessages([{ role: "user", text: prompt }]);

      // WebSocket tunnel path (preferred если authed + tunnel online).
      const currentSocket = getSocketRef.current();
      const currentAuth = authRef.current;
      if (
        currentAuth.status === "authenticated" &&
        currentSocket.status === "authed" &&
        currentSocket.tunnelStatus === "online"
      ) {
        const requestId = `req-${uuid()}`;
        activeRequestIdRef.current = requestId;
        const sent = currentSocket.sendGenerate({
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

      // HTTP fallback
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      try {
        const result = await runHttpPipeline({
          mode: "create",
          projectId,
          prompt,
          sessionId: sessionIdRef.current,
          signal: ctrl.signal,
          onEvent: (event) => {
            switch (event.type) {
              case "session_init":
                sessionIdRef.current = event.sessionId;
                break;
              case "plan_ready":
                setCurrentStep("template");
                break;
              case "template_selected":
                setTemplateName(event.templateName);
                setCurrentStep("template");
                break;
              case "step_start":
                if (event.roleName === "Кодер") setCurrentStep("code");
                break;
              case "text_delta":
                scheduleIframeUpdate(event.accumulated, event.accumulated.length);
                break;
              case "step_complete":
              case "error":
                break;
            }
          },
        });

        setCurrentStep("done");
        setHtml(result.finalHtml);
        setStreamingHtml("");
        setLastTemplateId(result.templateId);

        if (result.finalHtml && result.templateId) {
          saveToHistory({
            prompt,
            html: result.finalHtml,
            templateId: result.templateId,
            templateName: result.templateName,
          });
          if (currentAuth.status === "authenticated") {
            void saveRemoteSite({
              prompt,
              html: result.finalHtml,
              templateId: result.templateId,
              templateName: result.templateName,
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
    [projectId, scheduleIframeUpdate],
  );

  const polishSite = useCallback(
    async (request: string) => {
      setChatMessages((prev) => [...prev, { role: "user", text: request }]);
      setLoading(true);

      const currentSocket = getSocketRef.current();
      const currentAuth = authRef.current;
      if (
        currentAuth.status === "authenticated" &&
        currentSocket.status === "authed" &&
        currentSocket.tunnelStatus === "online"
      ) {
        const requestId = `req-${uuid()}`;
        activeRequestIdRef.current = requestId;
        pendingHtmlRef.current = "";
        setStreamingHtml("");
        const sent = currentSocket.sendGenerate({
          requestId,
          mode: "polish",
          prompt: request,
          previousHtml: htmlRef.current,
        });
        if (!sent) {
          toast.error("Туннель не готов. Попробуй ещё раз.");
          setLoading(false);
          return;
        }
        return;
      }

      // HTTP fallback
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      try {
        const result = await runHttpPipeline({
          mode: "polish",
          projectId,
          prompt: request,
          sessionId: sessionIdRef.current,
          signal: ctrl.signal,
          onEvent: (event) => {
            switch (event.type) {
              case "session_init":
                sessionIdRef.current = event.sessionId;
                break;
              case "text_delta":
                scheduleIframeUpdate(event.accumulated, event.accumulated.length);
                break;
              default:
                break;
            }
          },
        });

        setHtml(result.finalHtml);
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

  const cancelGeneration = useCallback(() => {
    abortCtrlRef.current?.abort();
    if (activeRequestIdRef.current) {
      getSocketRef.current().sendAbort(activeRequestIdRef.current);
      activeRequestIdRef.current = null;
    }
    setLoading(false);
    toast.warning("Генерация отменена");
    setMode("welcome");
  }, []);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    setHtml(entry.html);
    setStreamingHtml("");
    setLastPrompt(entry.prompt);
    setLastTemplateId(entry.templateId);
    setTemplateName(entry.templateName);
    setChatMessages([]);
    setMode("editing");
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

  return {
    mode,
    html,
    streamingHtml,
    streamingChars,
    loading,
    currentStep,
    templateName,
    lastPrompt,
    lastTemplateId,
    chatMessages,
    createSite,
    polishSite,
    cancelGeneration,
    loadFromHistory,
    reset,
    setMode,
    setChatMessages,
    handleWsEvent,
  };
}
