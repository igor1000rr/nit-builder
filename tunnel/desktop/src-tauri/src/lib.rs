//! NIT Tunnel Desktop — Tauri app entry point.
//!
//! Architecture:
//! - React UI (tunnel/desktop/ui) talks to Rust backend via Tauri IPC commands
//! - Rust backend owns the tunnel runtime (tunnel.rs) running in a tokio task
//! - Events from tunnel runtime are pushed to UI via tauri::Emitter
//! - Credentials stored via tauri-plugin-store (encrypted on macOS Keychain where possible)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lm_studio;
mod protocol;
mod tunnel;

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use tunnel::{spawn as spawn_tunnel, TunnelConfig, TunnelHandle, TunnelUiEvent};

// ─── App state ───────────────────────────────────────────────────

#[derive(Default)]
struct AppState {
    /// Currently running tunnel handle. None if not started.
    tunnel_handle: Mutex<Option<TunnelHandle>>,
}

// ─── IPC commands ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct StartTunnelPayload {
    pub server_url: String,
    pub token: String,
    pub lm_studio_url: String,
}

#[derive(Debug, Serialize)]
pub struct StartTunnelResult {
    pub ok: bool,
    pub error: Option<String>,
}

#[tauri::command]
async fn start_tunnel(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: StartTunnelPayload,
) -> Result<StartTunnelResult, String> {
    // Stop any existing tunnel first
    {
        let mut guard = state.tunnel_handle.lock().await;
        if let Some(existing) = guard.take() {
            existing.stop();
        }
    }

    // Validate inputs
    if payload.token.is_empty() {
        return Ok(StartTunnelResult {
            ok: false,
            error: Some("Token is required".to_string()),
        });
    }
    if !payload.server_url.starts_with("ws://") && !payload.server_url.starts_with("wss://") {
        return Ok(StartTunnelResult {
            ok: false,
            error: Some("Server URL must start with ws:// or wss://".to_string()),
        });
    }

    let config = TunnelConfig {
        server_url: payload.server_url,
        token: payload.token,
        lm_studio_url: payload.lm_studio_url,
    };

    let handle = spawn_tunnel(config);

    // Extract event receiver BEFORE moving handle into state.
    // We need to destructure because moving out of a field of a struct
    // requires the rest of the struct to not be used again.
    let TunnelHandle { stop, events } = handle;

    // Store a new handle (with a dummy receiver) in state. The real receiver
    // lives in the forwarder task below.
    let (_dummy_tx, dummy_rx) = tokio::sync::mpsc::unbounded_channel();
    *state.tunnel_handle.lock().await = Some(TunnelHandle {
        stop: stop.clone(),
        events: dummy_rx,
    });

    // Spawn event forwarder: tunnel events → Tauri window events
    let app_for_events = app.clone();
    tokio::spawn(async move {
        let mut events = events;
        while let Some(event) = events.recv().await {
            let _ = app_for_events.emit("tunnel-event", &event);
        }
    });

    Ok(StartTunnelResult {
        ok: true,
        error: None,
    })
}

#[tauri::command]
async fn stop_tunnel(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.tunnel_handle.lock().await;
    if let Some(handle) = guard.take() {
        handle.stop();
    }
    Ok(())
}

#[tauri::command]
async fn is_tunnel_running(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.tunnel_handle.lock().await.is_some())
}

#[derive(Debug, Serialize)]
pub struct LmStudioProbeResult {
    pub available: bool,
    pub model: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
async fn probe_lm_studio(url: String) -> Result<LmStudioProbeResult, String> {
    let proxy = match lm_studio::LmStudioProxy::new(url) {
        Ok(p) => p,
        Err(err) => {
            return Ok(LmStudioProbeResult {
                available: false,
                model: None,
                error: Some(err.to_string()),
            });
        }
    };

    match proxy.probe().await {
        Ok(model) => Ok(LmStudioProbeResult {
            available: true,
            model: Some(model),
            error: None,
        }),
        Err(err) => Ok(LmStudioProbeResult {
            available: false,
            model: None,
            error: Some(err.to_string()),
        }),
    }
}

// ─── Entry ───────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--autostart"]),
            ),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_tunnel,
            stop_tunnel,
            is_tunnel_running,
            probe_lm_studio,
        ])
        .setup(|app| {
            // Show main window on startup (unless --autostart)
            let args: Vec<String> = std::env::args().collect();
            if !args.iter().any(|a| a == "--autostart") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running nit-tunnel-desktop application");
}
