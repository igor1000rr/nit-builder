/**
 * useControlSocket — React hook managing the WebSocket connection to /api/control.
 *
 * Lifecycle:
 * 1. Hook mounts → opens WebSocket (cookie auto-auth via same-origin)
 * 2. Server sends "authed" → connection ready, hook state becomes "connected"
 * 3. Browser calls sendGenerate(prompt) → server routes to user's tunnel
 * 4. Server forwards tunnel events back: generate_step, generate_text, generate_done/error
 * 5. Hook dispatches to consumer via onEvent callback
 * 6. On disconnect → reconnect with exponential backoff (2s → 30s)
 * 7. Hook unmounts → close socket cleanly
 *
 * Consumer pattern:
 *   const socket = useControlSocket({ enabled: isAuthed, onEvent: handleEvent });
 *   socket.sendGenerate({ requestId, mode: "create", prompt });
 *
 * Browser sends session cookie automatically (same-origin) — no auth handshake needed.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { ServerToBrowser, BrowserToServer } from "@nit/shared";

export type ControlSocketStatus =
  | "idle" // not yet initialized
  | "connecting" // WebSocket is opening
  | "authed" // receive "authed" message from server
  | "disconnected" // closed, will reconnect
  | "error"; // fatal error (e.g. auth failed)

export type TunnelStatus = "unknown" | "online" | "offline";

type Options = {
  /** Only connect if enabled=true. Set to false when user is not authenticated. */
  enabled: boolean;
  /** Called on every incoming server message (except internal auth/heartbeat). */
  onEvent: (event: ServerToBrowser) => void;
};

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export function useControlSocket(options: Options) {
  const [status, setStatus] = useState<ControlSocketStatus>("idle");
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus>("unknown");
  const [activeTunnels, setActiveTunnels] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const backoffRef = useRef<number>(INITIAL_BACKOFF_MS);
  const shouldReconnectRef = useRef<boolean>(true);
  const onEventRef = useRef(options.onEvent);

  // Keep latest onEvent without re-triggering connection
  useEffect(() => {
    onEventRef.current = options.onEvent;
  }, [options.onEvent]);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/control`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Connection open. Server will validate session cookie automatically.
        // If cookie invalid, server closes with code 4001.
      };

      ws.onmessage = (ev) => {
        let msg: ServerToBrowser;
        try {
          msg = JSON.parse(ev.data as string) as ServerToBrowser;
        } catch {
          return;
        }

        // Handle internal state messages
        if (msg.type === "authed") {
          setStatus("authed");
          setTunnelStatus(msg.tunnelStatus);
          setActiveTunnels(msg.activeTunnels);
          backoffRef.current = INITIAL_BACKOFF_MS;

          // Start heartbeat
          if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "heartbeat" } satisfies BrowserToServer));
            }
          }, HEARTBEAT_INTERVAL_MS);
          return;
        }

        if (msg.type === "tunnel_status") {
          setTunnelStatus(msg.status);
          setActiveTunnels(msg.activeTunnels);
          // Don't dispatch — consumer can subscribe via separate state
          return;
        }

        if (msg.type === "heartbeat_ack") {
          return;
        }

        // Pass generation events to consumer
        onEventRef.current(msg);
      };

      ws.onerror = () => {
        // Logged via onclose
      };

      ws.onclose = (ev) => {
        wsRef.current = null;
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }

        // Auth failure — don't reconnect
        if (ev.code === 4001) {
          setStatus("error");
          return;
        }

        setStatus("disconnected");
        setTunnelStatus("unknown");

        if (!shouldReconnectRef.current) return;

        // Exponential backoff reconnect с jitter. Без jitter при падении
        // сервера все клиенты коннектятся синхронно (thundering herd) —
        // jitter 0.8..1.2 размазывает ре-коннекты во времени.
        const base = backoffRef.current;
        backoffRef.current = Math.min(base * 2, MAX_BACKOFF_MS);
        const delay = Math.round(base * (0.8 + Math.random() * 0.4));
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, delay);
      };
    } catch {
      setStatus("error");
    }
  }, []);

  // Effect: manage connection lifecycle based on enabled flag
  useEffect(() => {
    if (!options.enabled) {
      // Tear down any existing connection
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Hook disabled");
        wsRef.current = null;
      }
      setStatus("idle");
      setTunnelStatus("unknown");
      return;
    }

    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
    };
  }, [options.enabled, connect]);

  // ─── Public send methods ────────────────────────────────────────────

  const sendGenerate = useCallback(
    (params: {
      requestId: string;
      mode: "create" | "polish";
      prompt: string;
      previousHtml?: string;
    }): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || status !== "authed") {
        return false;
      }
      ws.send(
        JSON.stringify({
          type: "generate",
          requestId: params.requestId,
          mode: params.mode,
          prompt: params.prompt,
          previousHtml: params.previousHtml,
        } satisfies BrowserToServer),
      );
      return true;
    },
    [status],
  );

  const sendAbort = useCallback((requestId: string): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "abort",
        requestId,
      } satisfies BrowserToServer),
    );
  }, []);

  return {
    status,
    tunnelStatus,
    activeTunnels,
    sendGenerate,
    sendAbort,
  };
}
