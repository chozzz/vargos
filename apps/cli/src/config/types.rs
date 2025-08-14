use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub mastra_url: String,
    pub default_agent: Option<String>,
    pub default_session: Option<String>,
    pub theme: Option<Theme>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theme {
    // Theme configuration (to be defined)
    #[serde(flatten)]
    pub settings: std::collections::HashMap<String, String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            mastra_url: "http://localhost:4862".to_string(),
            default_agent: None,
            default_session: None,
            theme: None,
        }
    }
}

