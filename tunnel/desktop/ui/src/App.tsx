import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Store } from "@tauri-apps/plugin-store";
import type {
  TunnelStatus,
  TunnelUiEvent,
  StartTunnelPayload,
  StartTunnelResult,
} from "./types";
import { LoginForm } from "./components/LoginForm";
import { StatusDashboard } from "./components/StatusDashboard";
import { LogPanel, type LogEntry } from "./components/LogPanel";

type Screen = "login" | "dashboard";

type PersistedConfig = {
  serverUrl: string;
  token: string;
  lmStudioUrl: string;
};

const STORE_PATH = "config.bin";
const DEFAULT_CONFIG: PersistedConfig = {
  serverUrl: "wss://nit.vibecoding.by/api/tunnel",
  token: "",
  lmStudioUrl: "http://localhost:1234/v1",
};

export function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [config, setConfig] = useState<PersistedConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<TunnelStatus>({ status: "idle" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeRequests, setActiveRequests] = useState<
    Map<string, { tokens: number; startedAt: number }>
  >(new Map());
  const [starting, setStarting] = useState(false);
  const [bootLoaded, setBootLoaded] = useState(false);

  // ─── Load persisted config on mount ───────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await Store.load(STORE_PATH);
        const saved = await store.get<PersistedConfig>("config");
        if (!cancelled && saved && saved.token) {
          setConfig(saved);
          // Auto-start tunnel if we have a saved token
          const res = (await invoke("start_tunnel", {
            payload: {
              server_url: saved.serverUrl,
              token: saved.token,
              lm_studio_url: saved.lmStudioUrl,
            } satisfies StartTunnelPayload,
          })) as StartTunnelResult;
          if (res.ok) setScreen("dashboard");
        }
      } catch (err) {
        console.error("Failed to load config:", err);
      } finally {
        if (!cancelled) setBootLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Subscribe to tunnel events from Rust backend ─────────────

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      unlisten = await listen<TunnelUiEvent>("tunnel-event", (event) => {
        handleTunnelEvent(event.payload);
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTunnelEvent = useCallback((ev: TunnelUiEvent) => {
    switch (ev.type) {
      case "status_changed":
        setStatus(ev.content);
        addLog(formatStatusLog(ev.content));
        break;
      case "request_started":
        setActiveRequests((prev) => {
          const next = new Map(prev);
          next.set(ev.request_id, { tokens: 0, startedAt: Date.now() });
          return next;
        });
        addLog(`→ Request ${ev.request_id.slice(0, 8)}`);
        break;
      case "request_progress":
        setActiveRequests((prev) => {
          const next = new Map(prev);
          const existing = next.get(ev.request_id);
          if (existing) {
            next.set(ev.request_id, { ...existing, tokens: ev.tokens });
          }
          return next;
        });
        break;
      case "request_completed":
        setActiveRequests((prev) => {
          const next = new Map(prev);
          next.delete(ev.request_id);
          return next;
        });
        addLog(
          `✓ Request ${ev.request_id.slice(0, 8)} done (${(ev.duration_ms / 1000).toFixed(1)}s)`,
        );
        break;
      case "request_failed":
        setActiveRequests((prev) => {
          const next = new Map(prev);
          next.delete(ev.request_id);
          return next;
        });
        addLog(`✗ Request ${ev.request_id.slice(0, 8)} failed: ${ev.error}`);
        break;
      case "log":
        addLog(ev.content);
        break;
    }
    // `addLog` намеренно не в deps — он сам useCallback с []-deps и
    // стабилен между рендерами. Включение его в массив создаст лишнюю
    // зависимость без эффекта, но порядок объявлений в файле сделает
    // ESLint не видящим стабильности на момент анализа этого callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => {
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date(),
        message,
      };
      return [entry, ...prev].slice(0, 200);
    });
  }, []);

  // ─── Actions ──────────────────────────────────────────────────

  const handleStart = useCallback(
    async (cfg: PersistedConfig) => {
      setStarting(true);
      try {
        // Save config first
        try {
          const store = await Store.load(STORE_PATH);
          await store.set("config", cfg);
          await store.save();
        } catch {
          // Store save failed — not fatal
        }
        setConfig(cfg);

        const res = (await invoke("start_tunnel", {
          payload: {
            server_url: cfg.serverUrl,
            token: cfg.token,
            lm_studio_url: cfg.lmStudioUrl,
          } satisfies StartTunnelPayload,
        })) as StartTunnelResult;

        if (!res.ok) {
          addLog(`✗ Failed to start: ${res.error ?? "unknown error"}`);
          return;
        }
        setScreen("dashboard");
      } finally {
        setStarting(false);
      }
    },
    [addLog],
  );

  const handleStop = useCallback(async () => {
    try {
      await invoke("stop_tunnel");
    } catch (err) {
      console.error("Stop failed:", err);
    }
    setStatus({ status: "idle" });
    setActiveRequests(new Map());
    addLog("Tunnel stopped");
    setScreen("login");
  }, [addLog]);

  const handleClearToken = useCallback(async () => {
    try {
      const store = await Store.load(STORE_PATH);
      await store.set("config", { ...config, token: "" });
      await store.save();
    } catch {
      // ignore
    }
  }, [config]);

  // ─── Render ───────────────────────────────────────────────────

  if (!bootLoaded) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)",
        }}
      >
        <div>Загружаем...</div>
      </div>
    );
  }

  if (screen === "login") {
    return (
      <LoginForm
        initial={config}
        onSubmit={handleStart}
        loading={starting}
      />
    );
  }

  return (
    <StatusDashboard
      status={status}
      config={config}
      activeRequests={Array.from(activeRequests.entries()).map(([id, data]) => ({
        id,
        tokens: data.tokens,
        elapsedMs: Date.now() - data.startedAt,
      }))}
      logs={<LogPanel logs={logs} />}
      onStop={handleStop}
      onClearToken={handleClearToken}
    />
  );
}

function formatStatusLog(s: TunnelStatus): string {
  switch (s.status) {
    case "idle":
      return "Idle";
    case "probing_lm_studio":
      return "Checking LM Studio...";
    case "connecting":
      return "Connecting to server...";
    case "connected":
      return `✓ Connected as ${s.user_id} (${s.model})`;
    case "disconnected":
      return `✗ Disconnected: ${s.reason}. Retry in ${s.retry_in_seconds}s`;
    case "auth_failed":
      return `✗ Auth failed: ${s.reason}`;
    case "lm_studio_unreachable":
      return `✗ LM Studio unreachable: ${s.reason}`;
  }
}
