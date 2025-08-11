use crate::agent::discovery::Agent;
use crate::utils::{AppError, Result};
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;
use reqwest_eventsource::{Event, RequestBuilderExt};

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessageContent {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Vec<ChatMessageContent>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub run_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_settings: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_context: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub resource_id: String,
}

pub struct AgentClient {
    base_url: String,
    client: reqwest::Client,
}

impl AgentClient {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            client: reqwest::Client::new(),
        }
    }

    pub async fn list_agents(&self) -> Result<Vec<Agent>> {
        let url = format!("{}/api/agents", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(AppError::Network)?;

        if !response.status().is_success() {
            return Err(AppError::Agent(format!(
                "Failed to list agents: {}",
                response.status()
            )));
        }

        let agents: Vec<Agent> = response
            .json()
            .await
            .map_err(AppError::Network)?;

        Ok(agents)
    }

    pub async fn get_agent(&self, name: &str) -> Result<Agent> {
        let url = format!("{}/api/agents/{}", self.base_url, name);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(AppError::Network)?;

        if !response.status().is_success() {
            return Err(AppError::Agent(format!(
                "Agent '{}' not found: {}",
                name,
                response.status()
            )));
        }

        let agent: Agent = response
            .json()
            .await
            .map_err(AppError::Network)?;

        Ok(agent)
    }

    pub async fn chat(&self, agent_name: &str, message: &str, thread_id: Option<&str>) -> Result<String> {
        use futures_util::StreamExt;
        use reqwest_eventsource::{Event, RequestBuilderExt};
        
        let url = format!("{}/api/agents/{}/stream", self.base_url, agent_name);
        
        let request = ChatRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: vec![ChatMessageContent {
                    content_type: "text".to_string(),
                    text: message.to_string(),
                }],
            }],
            run_id: agent_name.to_string(),
            model_settings: None,
            runtime_context: None,
            thread_id: thread_id.map(|s| s.to_string()),
            resource_id: agent_name.to_string(),
        };
        
        let builder = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request);

        let mut es = builder
            .eventsource()
            .map_err(|e| AppError::Agent(format!("Failed to create eventsource: {}", e)))?;

        let mut full_response = String::new();
        
        while let Some(event) = es.next().await {
            match event {
                Ok(Event::Open) => {
                    // Connection opened
                }
                Ok(Event::Message(msg)) => {
                    // Parse SSE message data
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&msg.data) {
                        // Handle different event types
                        if let Some(event_type) = data.get("type").and_then(|v| v.as_str()) {
                            match event_type {
                                "text" | "text-delta" => {
                                    if let Some(content) = data.get("content").and_then(|v| v.as_str()) {
                                        full_response.push_str(content);
                                    } else if let Some(delta) = data.get("delta").and_then(|v| v.as_str()) {
                                        full_response.push_str(delta);
                                    }
                                }
                                "done" => {
                                    break;
                                }
                                _ => {
                                    // Other event types (tool calls, etc.)
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    return Err(AppError::Agent(format!("SSE stream error: {}", e)));
                }
            }
        }

        Ok(full_response)
    }
}

