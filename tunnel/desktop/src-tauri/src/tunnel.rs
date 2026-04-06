//! WebSocket tunnel client.
//!
//! Maintains a persistent connection to the NIT Builder server at /api/tunnel,
//! authenticates with the user's tunnel token, receives generate requests,
//! proxies them to LM Studio, and streams responses back.
//!
//! Features:
//! - Auto-reconnect with exponential backoff (5s → 60s)
//! - Heartbeat every 15s
//! - Abort propagation to active LLM calls
//! - Tokio select loop for concurrent message handling

use crate::lm_studio::{LmStudioProxy, StreamEvent};
use crate::protocol::{
    Runtime, ServerErrorCode, ServerToTunnel, TunnelCapabilities, TunnelToServer,
    CLIENT_VERSION, PROTOCOL_VERSION,
};
use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

const HEARTBEAT_INTERVAL_SECS: u64 = 15;
const INITIAL_BACKOFF_SECS: u64 = 5;
const MAX_BACKOFF_SECS: u64 = 60;

/// Config passed to the tunnel runtime.
#[derive(Debug, Clone)]
pub struct TunnelConfig {
    /// wss://nit.vibecoding.by/api/tunnel (or ws://localhost:3000/api/tunnel for dev)
    pub server_url: String,
    /// User's tunnel token (nit_...)
    pub token: String,
    /// LM Studio base URL (default http://localhost:1234/v1)
    pub lm_studio_url: String,
}

/// Status reported to the UI layer via events.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TunnelStatus {
    Idle,
    ProbingLmStudio,
    Connecting,
    Connected { user_id: String, model: String },
    Disconnected { reason: String, retry_in_seconds: u64 },
    AuthFailed { reason: String },
    LmStudioUnreachable { reason: String },
}

/// Events emitted by the tunnel runtime for UI consumption.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TunnelUiEvent {
    StatusChanged(TunnelStatus),
    RequestStarted {
        request_id: String,
    },
    RequestProgress {
        request_id: String,
        tokens: usize,
    },
    RequestCompleted {
        request_id: String,
        duration_ms: u64,
    },
    RequestFailed {
        request_id: String,
        error: String,
    },
    Log(String),
}

/// Handle returned from `spawn` — use this to send events out and stop the runtime.
pub struct TunnelHandle {
    pub stop: CancellationToken,
    pub events: mpsc::UnboundedReceiver<TunnelUiEvent>,
}

impl TunnelHandle {
    pub fn stop(&self) {
        self.stop.cancel();
    }
}

/// Spawn the tunnel runtime as a background task. Returns a handle with an
/// event receiver and a stop token.
pub fn spawn(config: TunnelConfig) -> TunnelHandle {
    let (event_tx, event_rx) = mpsc::unbounded_channel();
    let stop = CancellationToken::new();
    let stop_for_task = stop.clone();

    tokio::spawn(async move {
        if let Err(err) = run_loop(config, event_tx.clone(), stop_for_task).await {
            let _ = event_tx.send(TunnelUiEvent::Log(format!("Fatal: {}", err)));
        }
    });

    TunnelHandle {
        stop,
        events: event_rx,
    }
}

async fn run_loop(
    config: TunnelConfig,
    events: mpsc::UnboundedSender<TunnelUiEvent>,
    stop: CancellationToken,
) -> Result<()> {
    let mut backoff = INITIAL_BACKOFF_SECS;
    let lm_studio = LmStudioProxy::new(config.lm_studio_url.clone())?;

    loop {
        if stop.is_cancelled() {
            return Ok(());
        }

        // Probe LM Studio
        let _ = events.send(TunnelUiEvent::StatusChanged(TunnelStatus::ProbingLmStudio));
        let model = match lm_studio.probe().await {
            Ok(m) => m,
            Err(err) => {
                let _ = events.send(TunnelUiEvent::StatusChanged(
                    TunnelStatus::LmStudioUnreachable {
                        reason: err.to_string(),
                    },
                ));
                wait_or_cancel(&stop, Duration::from_secs(backoff)).await;
                backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
                continue;
            }
        };
        let _ = events.send(TunnelUiEvent::Log(format!("LM Studio online: {}", model)));

        // Connect to server
        let _ = events.send(TunnelUiEvent::StatusChanged(TunnelStatus::Connecting));
        match connect_and_serve(&config, model.clone(), &lm_studio, &events, &stop).await {
            Ok(_) => {
                // Normal close, reset backoff
                backoff = INITIAL_BACKOFF_SECS;
            }
            Err(err) => {
                let error_msg = err.to_string();
                let _ = events.send(TunnelUiEvent::Log(format!("Error: {}", error_msg)));

                // Check if this is an auth error — no point retrying
                if error_msg.contains("auth") || error_msg.contains("token") {
                    let _ = events.send(TunnelUiEvent::StatusChanged(TunnelStatus::AuthFailed {
                        reason: error_msg,
                    }));
                    return Ok(()); // stop runtime — user needs to fix token
                }

                let _ = events.send(TunnelUiEvent::StatusChanged(TunnelStatus::Disconnected {
                    reason: error_msg,
                    retry_in_seconds: backoff,
                }));
            }
        }

        wait_or_cancel(&stop, Duration::from_secs(backoff)).await;
        backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
    }
}

async fn wait_or_cancel(cancel: &CancellationToken, dur: Duration) {
    tokio::select! {
        _ = tokio::time::sleep(dur) => {}
        _ = cancel.cancelled() => {}
    }
}

async fn connect_and_serve(
    config: &TunnelConfig,
    model: String,
    lm_studio: &LmStudioProxy,
    events: &mpsc::UnboundedSender<TunnelUiEvent>,
    stop: &CancellationToken,
) -> Result<()> {
    let (ws_stream, _) = tokio_tungstenite::connect_async(&config.server_url).await?;
    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Send hello
    let hello = TunnelToServer::Hello {
        protocol_version: PROTOCOL_VERSION.to_string(),
        token: config.token.clone(),
        client_version: CLIENT_VERSION.to_string(),
        capabilities: TunnelCapabilities {
            runtime: Runtime::LmstudioProxy,
            model: model.clone(),
            context_window: 32_000,
            gpu: None,
        },
    };
    ws_write
        .send(Message::Text(serde_json::to_string(&hello)?))
        .await?;

    // Active request aborters
    let active: Arc<Mutex<HashMap<String, CancellationToken>>> = Arc::new(Mutex::new(HashMap::new()));

    // Heartbeat timer
    let mut heartbeat = tokio::time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));
    heartbeat.tick().await; // skip first immediate tick

    // Main event loop
    loop {
        tokio::select! {
            _ = stop.cancelled() => {
                let _ = ws_write.close().await;
                return Ok(());
            }

            _ = heartbeat.tick() => {
                let hb = TunnelToServer::Heartbeat {
                    timestamp: now_millis(),
                };
                if ws_write.send(Message::Text(serde_json::to_string(&hb)?)).await.is_err() {
                    return Err(anyhow::anyhow!("Heartbeat send failed"));
                }
            }

            msg = ws_read.next() => {
                let Some(msg) = msg else {
                    return Err(anyhow::anyhow!("Server closed connection"));
                };
                match msg? {
                    Message::Text(text) => {
                        let parsed: ServerToTunnel = match serde_json::from_str(&text) {
                            Ok(p) => p,
                            Err(err) => {
                                let _ = events.send(TunnelUiEvent::Log(
                                    format!("Malformed server message: {}", err),
                                ));
                                continue;
                            }
                        };

                        match parsed {
                            ServerToTunnel::Welcome { user_id, .. } => {
                                let _ = events.send(TunnelUiEvent::StatusChanged(
                                    TunnelStatus::Connected { user_id: user_id.clone(), model: model.clone() },
                                ));
                                let _ = events.send(TunnelUiEvent::Log(
                                    format!("Authenticated as user {}", user_id),
                                ));
                            }
                            ServerToTunnel::HeartbeatAck { .. } => {
                                // silent
                            }
                            ServerToTunnel::Generate { request_id, system, prompt, max_output_tokens, temperature, model: override_model } => {
                                let _ = events.send(TunnelUiEvent::RequestStarted {
                                    request_id: request_id.clone(),
                                });

                                // Create cancellation token for this request
                                let token = CancellationToken::new();
                                active.lock().await.insert(request_id.clone(), token.clone());

                                // Channel to receive stream events from LM Studio proxy
                                let (stream_tx, mut stream_rx) = mpsc::channel::<StreamEvent>(256);

                                // Clone for async move
                                let lm_model = override_model.unwrap_or_else(|| model.clone());
                                let proxy = LmStudioProxy::new(config.lm_studio_url.clone())?;
                                let token_for_proxy = token.clone();
                                tokio::spawn(async move {
                                    proxy.stream_chat(
                                        lm_model,
                                        system,
                                        prompt,
                                        max_output_tokens,
                                        temperature,
                                        stream_tx,
                                        token_for_proxy,
                                    ).await;
                                });

                                // Forward stream events to server
                                let mut tokens = 0usize;
                                while let Some(ev) = stream_rx.recv().await {
                                    match ev {
                                        StreamEvent::Start => {
                                            let m = TunnelToServer::ResponseStart {
                                                request_id: request_id.clone(),
                                            };
                                            ws_write.send(Message::Text(serde_json::to_string(&m)?)).await.ok();
                                        }
                                        StreamEvent::Text(text) => {
                                            tokens += 1;
                                            let _ = events.send(TunnelUiEvent::RequestProgress {
                                                request_id: request_id.clone(),
                                                tokens,
                                            });
                                            let m = TunnelToServer::ResponseText {
                                                request_id: request_id.clone(),
                                                text,
                                            };
                                            ws_write.send(Message::Text(serde_json::to_string(&m)?)).await.ok();
                                        }
                                        StreamEvent::Done { full_text, duration_ms } => {
                                            let m = TunnelToServer::ResponseDone {
                                                request_id: request_id.clone(),
                                                full_text,
                                                duration_ms,
                                                prompt_tokens: None,
                                                completion_tokens: Some(tokens as u32),
                                            };
                                            ws_write.send(Message::Text(serde_json::to_string(&m)?)).await.ok();
                                            let _ = events.send(TunnelUiEvent::RequestCompleted {
                                                request_id: request_id.clone(),
                                                duration_ms,
                                            });
                                            break;
                                        }
                                        StreamEvent::Error(error) => {
                                            let m = TunnelToServer::ResponseError {
                                                request_id: request_id.clone(),
                                                error: error.clone(),
                                            };
                                            ws_write.send(Message::Text(serde_json::to_string(&m)?)).await.ok();
                                            let _ = events.send(TunnelUiEvent::RequestFailed {
                                                request_id: request_id.clone(),
                                                error,
                                            });
                                            break;
                                        }
                                    }
                                }

                                active.lock().await.remove(&request_id);
                            }
                            ServerToTunnel::Abort { request_id } => {
                                if let Some(token) = active.lock().await.remove(&request_id) {
                                    token.cancel();
                                    let _ = events.send(TunnelUiEvent::Log(
                                        format!("Aborted request {}", &request_id[..8.min(request_id.len())]),
                                    ));
                                }
                            }
                            ServerToTunnel::Error { code, message } => {
                                let _ = events.send(TunnelUiEvent::Log(
                                    format!("Server error [{:?}]: {}", code, message),
                                ));
                                if matches!(code, ServerErrorCode::AuthFailed | ServerErrorCode::InvalidToken) {
                                    return Err(anyhow::anyhow!("Auth failed: {}", message));
                                }
                            }
                        }
                    }
                    Message::Ping(data) => {
                        ws_write.send(Message::Pong(data)).await.ok();
                    }
                    Message::Close(_) => {
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }
    }
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
