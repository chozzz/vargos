use crate::agent::client::AgentClient;
use crate::utils::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub name: String,
    pub description: String,
    pub tools: Option<Vec<String>>,
}

pub struct AgentDiscovery {
    client: AgentClient,
}

impl AgentDiscovery {
    pub fn new(base_url: String) -> Self {
        Self {
            client: AgentClient::new(base_url),
        }
    }

    pub async fn list_agents(&self) -> Result<Vec<Agent>> {
        self.client.list_agents().await
    }

    pub async fn get_agent(&self, name: &str) -> Result<Agent> {
        self.client.get_agent(name).await
    }

    pub async fn validate_agent(&self, name: &str) -> Result<bool> {
        match self.get_agent(name).await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
}

