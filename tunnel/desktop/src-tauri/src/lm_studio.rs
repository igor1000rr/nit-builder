//! LM Studio streaming proxy.
//!
//! Calls a local OpenAI-compatible endpoint (default LM Studio on :1234)
//! and streams tokens back via an mpsc channel. Supports abort via CancellationToken.

use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

const LLM_TIMEOUT_SECS: u64 = 300; // 5 minutes

#[derive(Debug, Clone)]
pub enum StreamEvent {
    Start,
    Text(String),
    Done { full_text: String, duration_ms: u64 },
    Error(String),
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
    temperature: f32,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Option<Vec<StreamChoice>>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: Option<StreamDelta>,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Option<Vec<ModelInfo>>,
}

#[derive(Debug, Deserialize)]
struct ModelInfo {
    id: String,
}

pub struct LmStudioProxy {
    client: Client,
    base_url: String,
}

impl LmStudioProxy {
    pub fn new(base_url: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(LLM_TIMEOUT_SECS))
            .build()
            .context("Failed to build HTTP client")?;
        Ok(Self { client, base_url })
    }

    /// Probe LM Studio availability and return detected model name.
    /// Uses a short 3-second timeout.
    pub async fn probe(&self) -> Result<String> {
        let url = format!("{}/models", self.base_url.trim_end_matches('/'));
        let response = self
            .client
            .get(&url)
            .timeout(Duration::from_secs(3))
            .send()
            .await
            .context("LM Studio /v1/models request failed")?;

        if !response.status().is_success() {
            return Err(anyhow!("LM Studio returned {}", response.status()));
        }

        let data: ModelsResponse = response
            .json()
            .await
            .context("Failed to parse /v1/models response")?;

        let first_model = data
            .data
            .and_then(|models| models.into_iter().next())
            .map(|m| m.id)
            .ok_or_else(|| anyhow!("LM Studio has no loaded models"))?;

        Ok(first_model)
    }

    /// Stream a chat completion from LM Studio.
    /// Sends events to `tx` until done, error, or cancelled.
    pub async fn stream_chat(
        &self,
        model: String,
        system: String,
        prompt: String,
        max_tokens: u32,
        temperature: f32,
        tx: mpsc::Sender<StreamEvent>,
        cancel: CancellationToken,
    ) {
        let start = std::time::Instant::now();
        let _ = tx.send(StreamEvent::Start).await;

        let request = ChatCompletionRequest {
            model,
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: prompt,
                },
            ],
            max_tokens,
            temperature,
            stream: true,
        };

        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));

        let response_result = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await;

        let response = match response_result {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                let status = r.status();
                let body = r.text().await.unwrap_or_default();
                let _ = tx
                    .send(StreamEvent::Error(format!(
                        "LM Studio {}: {}",
                        status, body
                    )))
                    .await;
                return;
            }
            Err(err) => {
                let _ = tx
                    .send(StreamEvent::Error(format!("LM Studio request failed: {}", err)))
                    .await;
                return;
            }
        };

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut full_text = String::new();

        loop {
            tokio::select! {
                biased;

                _ = cancel.cancelled() => {
                    let _ = tx.send(StreamEvent::Error("Request aborted".to_string())).await;
                    return;
                }

                chunk = stream.next() => {
                    match chunk {
                        None => break, // end of stream
                        Some(Err(err)) => {
                            let _ = tx
                                .send(StreamEvent::Error(format!("Stream error: {}", err)))
                                .await;
                            return;
                        }
                        Some(Ok(bytes)) => {
                            let text = match std::str::from_utf8(&bytes) {
                                Ok(s) => s,
                                Err(_) => continue, // skip invalid UTF-8 chunks
                            };
                            buffer.push_str(text);

                            // Parse SSE events (separated by \n\n)
                            while let Some(sep_idx) = buffer.find("\n\n") {
                                let block: String = buffer.drain(..sep_idx + 2).collect();
                                for line in block.lines() {
                                    if !line.starts_with("data: ") {
                                        continue;
                                    }
                                    let data = line[6..].trim();
                                    if data.is_empty() || data == "[DONE]" {
                                        continue;
                                    }
                                    if let Ok(chunk) = serde_json::from_str::<StreamChunk>(data) {
                                        if let Some(delta_text) = chunk
                                            .choices
                                            .as_ref()
                                            .and_then(|c| c.first())
                                            .and_then(|c| c.delta.as_ref())
                                            .and_then(|d| d.content.as_ref())
                                        {
                                            full_text.push_str(delta_text);
                                            if tx
                                                .send(StreamEvent::Text(delta_text.clone()))
                                                .await
                                                .is_err()
                                            {
                                                return; // consumer dropped
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let duration_ms = start.elapsed().as_millis() as u64;
        let _ = tx
            .send(StreamEvent::Done {
                full_text,
                duration_ms,
            })
            .await;
    }
}
