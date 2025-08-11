use crate::utils::{AppError, Result};
use futures_util::StreamExt;
use reqwest_eventsource::{Event, RequestBuilderExt};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamEvent {
    pub event: String,
    pub data: StreamEventData,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamEventData {
    #[serde(rename = "type")]
    pub event_type: String,
    pub content: Option<String>,
    pub tool: Option<String>,
    pub status: Option<String>,
}

pub struct StreamHandler {
    // Stream handler implementation
}

impl StreamHandler {
    pub async fn stream_chat(
        base_url: &str,
        agent_name: &str,
        message: &str,
        session_id: Option<&str>,
    ) -> Result<impl futures_util::Stream<Item = Result<StreamEvent>>> {
        let mut url = format!("{}/api/agents/{}/stream", base_url, agent_name);
        if let Some(sid) = session_id {
            url = format!("{}?session_id={}", url, sid);
        }

        let client = reqwest::Client::new();
        let builder = client
            .post(&url)
            .json(&serde_json::json!({ "message": message }));

        let mut es = builder
            .eventsource()
            .map_err(|e| AppError::Agent(format!("Failed to create eventsource: {}", e)))?;

        let stream = async_stream::stream! {
            while let Some(event) = es.next().await {
                match event {
                    Ok(Event::Open) => {
                        // Connection opened, continue
                    }
                    Ok(Event::Message(msg)) => {
                        // Parse SSE event data
                        match serde_json::from_str::<StreamEventData>(&msg.data) {
                            Ok(data) => {
                                yield Ok(StreamEvent {
                                    event: msg.event,
                                    data,
                                });
                            }
                            Err(e) => {
                                yield Err(AppError::Serialization(e));
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        yield Err(AppError::Agent(format!("SSE stream error: {}", e)));
                        break;
                    }
                }
            }
        };

        Ok(stream)
    }
}

