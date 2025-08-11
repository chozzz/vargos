use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct AppState {
    pub current_agent: Option<String>,
    pub current_session: Option<String>,
    pub mastra_url: String,
    pub is_connected: bool,
    pub history: Vec<String>,
}

impl AppState {
    pub fn new(mastra_url: String) -> Self {
        Self {
            current_agent: None,
            current_session: None,
            mastra_url,
            is_connected: false,
            history: Vec::new(),
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

